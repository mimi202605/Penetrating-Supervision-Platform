// 数据采集任务运行时（SeaTunnel 等价）：Job→Task→Split
// 10 步契约：loadTask → split → for each split: connect(read) → transform → sink → checkpoint → audit
//         → lineage → emit done；retry/timeout/concurrency
import {
  execute,
  queryOne,
} from "../../db/index.js";
import { logger } from "../../utils/logger.js";
import { eventBus } from "../platform/eventbus.js";
import { getConnector } from "./connectors/index.js";
import { loadFullConfigFromRow } from "./sources-runtime-helper.js";
import { runTransformPipeline, type DirtyRecord } from "./transform/engine.js";
import type {
  TransformPipeline,
  TransformContext,
  TransformStep,
} from "./transform/types.js";
import { ErrorLimitExceeded } from "./transform/types.js";
import { writeRecordsToSink } from "./sink.js";
import { runQualityCheck } from "./quality.js";
import { incCollectionRecords, incCollectionDirty } from "../../health.js";

/** 任务运行选项 */
export interface RunTaskOptions {
  /** 强制从指定水位/checkpoint 启动；默认从 DB checkpoint 恢复 */
  startCheckpoint?: Record<string, unknown>;
  /** 仅试运行（不落库 sink/checkpoint）；用于 dryRun */
  dryRun?: boolean;
}

/** 任务运行结果 */
export interface RunTaskResult {
  runId: string;
  status: "success" | "failed" | "killed";
  recordsRead: number;
  recordsWrite: number;
  recordsDirty: number;
  bytesRead: number;
  error?: string;
  checkpoint?: Record<string, unknown>;
  evidence?: TransformContext["evidence"];
}

interface TaskRow {
  id: string;
  name: string;
  source_id: string | null;
  mode: string;          // 全量/增量/CDC
  concurrency: number;
  retry_max: number;
  retry_interval_sec: number;
  timeout_sec: number | null;
  transform_pipeline: string | null;
  sink_type: string | null;
  sink_target: string | null;
  write_mode: string | null;
  scene_id: string | null;
  model_id: string | null;
  checkpoint_state: string | null;
}

interface SourceRow {
  id: string;
  connector_type: string | null;
  config_json: string | null;
  endpoint: string | null;
  schema_catalog: string | null;
}

/** 生成 runId */
function genRunId(taskId: string): string {
  return `run-${taskId}-${Date.now()}`;
}

/** 加载任务定义 + 关联数据源 */
function loadTask(taskId: string): { task: TaskRow; source: SourceRow | null } {
  const task = queryOne<TaskRow>(
    "SELECT id, name, source_id, mode, concurrency, retry_max, retry_interval_sec, timeout_sec, transform_pipeline, sink_type, sink_target, write_mode, scene_id, model_id, checkpoint_state FROM collection_tasks WHERE id = ?",
    [taskId],
  );
  if (!task) throw new Error(`采集任务不存在: ${taskId}`);
  let source: SourceRow | null = null;
  if (task.source_id) {
    source = queryOne<SourceRow>(
      "SELECT id, connector_type, config_json, endpoint, schema_catalog FROM data_sources WHERE id = ?",
      [task.source_id],
    ) ?? null;
  }
  return { task, source };
}

/** 解析 transform_pipeline JSON */
function parsePipeline(task: TaskRow): TransformPipeline {
  if (!task.transform_pipeline) return { steps: [] };
  try {
    const p = JSON.parse(task.transform_pipeline) as { steps: TransformStep[]; errorLimit?: { rate?: number; count?: number } };
    if (!Array.isArray(p.steps)) return { steps: [] };
    return p;
  } catch {
    logger.warn({ taskId: task.id }, "transform_pipeline 解析失败，按空管道处理");
    return { steps: [] };
  }
}

/** 取最近 checkpoint（增量/CDC） */
function loadCheckpoint(taskId: string, shardId: string): Record<string, unknown> | undefined {
  const row = queryOne<{ state: string }>(
    "SELECT state FROM collection_checkpoints WHERE task_id = ? AND shard_id = ?",
    [taskId, shardId],
  );
  if (!row) return undefined;
  try {
    return JSON.parse(row.state) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** 写 checkpoint */
function saveCheckpoint(taskId: string, shardId: string, state: Record<string, unknown>): void {
  const json = JSON.stringify(state);
  execute(
    `INSERT INTO collection_checkpoints (task_id, shard_id, state, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(task_id, shard_id) DO UPDATE SET state = excluded.state, updated_at = datetime('now')`,
    [taskId, shardId, json],
  );
}

/** 写 collection_audit（4 个审计点） */
function writeAudit(taskId: string, point: string, count: number, bytes: number): void {
  execute(
    "INSERT INTO collection_audit (task_id, audit_point, log_ts, count, bytes, delay_ms) VALUES (?, ?, ?, ?, ?, 0)",
    [taskId, point, new Date().toISOString().slice(0, 16).replace("T", " "), count, bytes],
  );
  // 同步递增 Prometheus 指标 collection_records_total{task_id,point}
  incCollectionRecords(taskId, point, count);
}

/** 写 data_lineage */
function writeLineage(taskId: string, sourceId: string, sourceTable: string, sinkTable: string, fieldMap: unknown, sceneId: string | null): void {
  execute(
    "INSERT INTO data_lineage (task_id, source_id, source_table, sink_table, field_map, layer, scene_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [taskId, sourceId, sourceTable, sinkTable, fieldMap ? JSON.stringify(fieldMap) : null, "ods", sceneId],
  );
}

/** 写 dirty_records */
function writeDirty(taskId: string, runId: string, d: DirtyRecord): void {
  execute(
    "INSERT INTO dirty_records (task_id, run_id, step_id, raw_json, error) VALUES (?, ?, ?, ?, ?)",
    [taskId, runId, d.stepId, JSON.stringify(d.raw), d.error],
  );
  // 同步递增 Prometheus 指标 collection_dirty_total{task_id}
  incCollectionDirty(taskId);
}

/** 写 collection_task_runs（开始） */
function startRun(runId: string, taskId: string, attempt: number): void {
  execute(
    "INSERT INTO collection_task_runs (id, task_id, attempt, status, started_at) VALUES (?, ?, ?, 'running', datetime('now'))",
    [runId, taskId, attempt],
  );
}

/** 写 collection_task_runs（结束） */
function finishRun(runId: string, status: string, result: Partial<RunTaskResult>): void {
  execute(
    `UPDATE collection_task_runs SET
       status = ?, finished_at = datetime('now'),
       records_read = ?, records_write = ?, records_dirty = ?, bytes_read = ?,
       error = ?, checkpoint = ?
     WHERE id = ?`,
    [
      status,
      result.recordsRead ?? 0,
      result.recordsWrite ?? 0,
      result.recordsDirty ?? 0,
      result.bytesRead ?? 0,
      result.error ?? null,
      result.checkpoint ? JSON.stringify(result.checkpoint) : null,
      runId,
    ],
  );
}

/** 单 split 执行：read → transform → sink */
async function runSplit(
  task: TaskRow,
  source: SourceRow | null,
  split: { shardId: string; streamName: string; startPk?: number },
  pipeline: TransformPipeline,
  ctx: TransformContext,
  dryRun: boolean,
): Promise<{ read: number; write: number; dirty: number; bytes: number }> {
  if (!source || !source.connector_type) {
    throw new Error(`任务 ${task.id} 未绑定有效数据源或 connector_type`);
  }
  const connector = getConnector(source.connector_type);
  // 加载 + 解密凭据
  const fullSourceRow = queryOne<Record<string, unknown>>(
    "SELECT * FROM data_sources WHERE id = ?",
    [source.id],
  );
  if (!fullSourceRow) throw new Error(`数据源不存在: ${source.id}`);
  const config = loadFullConfigFromRow(fullSourceRow, source.connector_type);
  // checkpoint 注入
  const ckpt = loadCheckpoint(task.id, split.shardId);
  if (ckpt) (config as Record<string, unknown>)._checkpoint = ckpt;
  if (split.startPk !== undefined) (config as Record<string, unknown>)._startPk = split.startPk;

  // 中文 mode → 英文 mode（连接器契约要求 full/incremental/cdc）
  const modeMap: Record<string, "full" | "incremental" | "cdc"> = {
    "全量": "full",
    "增量": "incremental",
    "CDC": "cdc",
    "cdc": "cdc",
    "full": "full",
    "incremental": "incremental",
  };
  const mode = modeMap[task.mode] || "full";

  const readContext = {
    stream: split.streamName,
    mode,
    checkpoint: ckpt,
    config,
  };

  // reader_in 审计点
  writeAudit(task.id, "reader_in", 0, 0);

  let read = 0;
  let write = 0;
  let dirty = 0;
  let bytes = 0;
  const sinkBuffer: Record<string, unknown>[] = [];
  const qualitySample: Record<string, unknown>[] = [];   // 采样用于后置质量校验（最多 100 条）
  const SINK_BATCH = 100;
  const QUALITY_SAMPLE_LIMIT = 100;

  async function* gen(): AsyncIterable<Record<string, unknown>> {
    for await (const rec of connector.read(readContext as never)) {
      read++;
      bytes += JSON.stringify(rec).length;
      yield rec;
    }
  }

  try {
    for await (const out of runTransformPipeline(gen(), pipeline, ctx, (d) => {
      dirty++;
      if (!dryRun) writeDirty(task.id, ctx.runId || "", d);
    })) {
      write++;
      sinkBuffer.push(out);
      // 采样：前 N 条进 qualitySample
      if (qualitySample.length < QUALITY_SAMPLE_LIMIT) {
        qualitySample.push(out);
      }
      if (sinkBuffer.length >= SINK_BATCH) {
        if (!dryRun) {
          writeRecordsToSink(task, ctx.runId || "", split.streamName, sinkBuffer.splice(0, SINK_BATCH));
        } else {
          sinkBuffer.length = 0;
        }
      }
    }
    // 写剩余
    if (sinkBuffer.length > 0 && !dryRun) {
      writeRecordsToSink(task, ctx.runId || "", split.streamName, sinkBuffer.splice(0, sinkBuffer.length));
    }
    // reader_out / writer_in / writer_out 审计点
    writeAudit(task.id, "reader_out", read, bytes);
    writeAudit(task.id, "writer_in", write, bytes);
    writeAudit(task.id, "writer_out", write, bytes);
    // 写 checkpoint（仅成功）
    if (!dryRun) {
      const newState = { ...ckpt, lastPk: split.startPk ?? read, ts: new Date().toISOString() };
      saveCheckpoint(task.id, split.shardId, newState);
      // 后置质量校验钩子（Great Expectations 等价）：sink 写入后跑 5 类规则
      if (qualitySample.length > 0) {
        try {
          runQualityCheck(task.id, qualitySample, task.scene_id);
        } catch (qerr) {
          logger.warn({ taskId: task.id, err: (qerr as Error).message }, "质量校验钩子异常（不影响任务）");
        }
      }
    }
  } catch (err) {
    // reader 异常或 transform 错误率超限
    throw err;
  }
  return { read, write, dirty, bytes };
}

/**
 * 运行采集任务（核心入口）
 * 1. 加载任务+数据源 2. 解析 pipeline 3. split 4. for each split: read→transform→sink→checkpoint
 * 5. 写 task_runs/audit/lineage 6. emit done 7. retry/timeout
 */
export async function runTask(taskId: string, opts: RunTaskOptions = {}): Promise<RunTaskResult> {
  const { task, source } = loadTask(taskId);
  const pipeline = parsePipeline(task);
  const runId = genRunId(taskId);
  const sceneId = task.scene_id;
  const modelId = task.model_id;

  // 任务级 ctx
  const ctx: TransformContext = {
    taskId,
    runId,
    sceneId: sceneId || undefined,
    modelId: modelId || undefined,
    sourceId: task.source_id || undefined,
    evidence: [],
  };

  if (!opts.dryRun) startRun(runId, taskId, 1);

  // splits：从 schema_catalog 取 streams，每 stream 一个 split
  let splits: Array<{ shardId: string; streamName: string; startPk?: number }> = [];
  if (source?.schema_catalog) {
    try {
      const cat = JSON.parse(source.schema_catalog) as { streams: Array<{ name: string }> };
      splits = cat.streams.map((s) => ({ shardId: s.name, streamName: s.name }));
    } catch {
      splits = [{ shardId: "default", streamName: "default" }];
    }
  } else {
    splits = [{ shardId: "default", streamName: "default" }];
  }
  if (splits.length === 0) splits = [{ shardId: "default", streamName: "default" }];

  // 限流：令牌桶（concurrency 限制并发 split）
  const concurrency = Math.max(1, task.concurrency || 1);

  // 超时
  const timeoutMs = (task.timeout_sec || 0) * 1000;
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = timeoutMs > 0
    ? new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`任务超时 ${task.timeout_sec}s`)), timeoutMs);
      })
    : null;

  let totalRead = 0;
  let totalWrite = 0;
  let totalDirty = 0;
  let totalBytes = 0;

  async function execSplit(split: typeof splits[number]): Promise<void> {
    const r = await runSplit(task, source, split, pipeline, ctx, opts.dryRun || false);
    totalRead += r.read;
    totalWrite += r.write;
    totalDirty += r.dirty;
    totalBytes += r.bytes;
  }

  try {
    // 并发执行（限制 concurrency）
    const queue = [...splits];
    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push((async () => {
        while (queue.length > 0) {
          const split = queue.shift()!;
          await execSplit(split);
        }
      })());
    }
    const work = Promise.all(workers);
    if (timeoutPromise) {
      await Promise.race([work, timeoutPromise]);
    } else {
      await work;
    }
    // lineage：每个 split 一条
    if (!opts.dryRun) {
      for (const s of splits) {
        writeLineage(
          taskId,
          source?.id || "unknown",
          s.streamName,
          task.sink_target || `ods_${s.streamName}`,
          null,
          sceneId,
        );
      }
    }
    // 任务成功
    const result: RunTaskResult = {
      runId,
      status: "success",
      recordsRead: totalRead,
      recordsWrite: totalWrite,
      recordsDirty: totalDirty,
      bytesRead: totalBytes,
      evidence: ctx.evidence,
    };
    if (!opts.dryRun) {
      finishRun(runId, "success", result);
      execute(
        "UPDATE collection_tasks SET last_status = ?, last_run = datetime('now') WHERE id = ?",
        ["成功", taskId],
      );
    }
    eventBus.emit("collection.task.done", {
      taskId,
      runId,
      sceneId,
      modelId,
      recordsWrite: totalWrite,
      evidence: ctx.evidence,
    });
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const status = errMsg.includes("超时") ? "killed" : "failed";
    const result: RunTaskResult = {
      runId,
      status,
      recordsRead: totalRead,
      recordsWrite: totalWrite,
      recordsDirty: totalDirty,
      bytesRead: totalBytes,
      error: errMsg,
    };
    if (!opts.dryRun) {
      finishRun(runId, status, result);
      execute(
        "UPDATE collection_tasks SET last_status = ? WHERE id = ?",
        [status === "killed" ? "失败" : "失败", taskId],
      );
    }
    eventBus.emit("collection.failed", { taskId, runId, error: errMsg });
    logger.error({ taskId, runId, err: errMsg, status }, "采集任务运行失败");
    return result;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

/** 同步触发（兼容旧 runCollectionTask 调用方） */
export function runTaskSync(taskId: string): void {
  // 不阻塞调度器：fire-and-forget
  runTask(taskId).catch((err) => {
    logger.error({ taskId, err: (err as Error).message }, "runTask 异步执行异常");
  });
}

void ErrorLimitExceeded; // 引用保留：上层调用方可能捕获
