// Transform 引擎：流式应用 pipeline，处理错误策略、errorLimit、脏数据收集
import type {
  TransformPipeline,
  TransformStep,
  TransformContext,
  ApplyResult,
  TransformState,
} from "./types.js";
import { ErrorLimitExceeded, TransformStepError } from "./types.js";
import { getTransformHandler } from "./registry.js";
import { logger } from "../../../utils/logger.js";

export interface DirtyRecord {
  taskId?: string;
  runId?: string;
  stepId: string;
  error: string;
  raw: Record<string, unknown>;
  ts: string;
}

export interface TransformEngineResult {
  output: Record<string, unknown>[];
  dirty: DirtyRecord[];
  totalRead: number;
  totalWrite: number;
  totalDirty: number;
  evidence: TransformContext["evidence"];
}

/** 单条 record 经过 pipeline 的单步处理，返回结果数组（normalize ApplyResult） */
function normalizeResult(r: ApplyResult): Record<string, unknown>[] {
  if (r === null) return [];
  if (Array.isArray(r)) return r;
  return [r];
}

/** 流式处理输入迭代器，输出处理后的迭代器 */
export async function* runTransformPipeline(
  input: AsyncIterable<Record<string, unknown>>,
  pipeline: TransformPipeline,
  ctx: TransformContext,
  onDirty?: (d: DirtyRecord) => void,
): AsyncIterable<Record<string, unknown>> {
  // 为每个 step 初始化 handler + state
  const stepStates: Array<{ step: TransformStep; state: TransformState }> = [];
  for (const step of pipeline.steps) {
    const handler = getTransformHandler(step.type);
    const state = handler.init ? handler.init(step.config, ctx) : {};
    stepStates.push({ step, state });
  }

  const errorLimit = pipeline.errorLimit || { rate: 0.01 };
  let total = 0;
  let errors = 0;

  for await (const record of input) {
    total++;
    // 当前批处理：可能因 flatten 一进多出
    let batch: Record<string, unknown>[] = [record];
    for (const { step, state } of stepStates) {
      const handler = getTransformHandler(step.type);
      const nextBatch: Record<string, unknown>[] = [];
      for (const rec of batch) {
        try {
          const r = await handler.apply(rec, state, step.config, ctx);
          nextBatch.push(...normalizeResult(r));
        } catch (err) {
          errors++;
          // 错误率检查
          const rate = errors / total;
          if (
            (errorLimit.rate !== undefined && rate > errorLimit.rate) ||
            (errorLimit.count !== undefined && errors > errorLimit.count)
          ) {
            throw new ErrorLimitExceeded(rate, errors, errorLimit);
          }
          // 错误策略
          const onError = step.onError || "skip";
          const dirty: DirtyRecord = {
            taskId: ctx.taskId,
            runId: ctx.runId,
            stepId: step.id,
            error: err instanceof TransformStepError ? err.message : (err as Error).message,
            raw: rec,
            ts: new Date().toISOString(),
          };
          onDirty?.(dirty);
          if (onError === "fail") {
            throw err;
          }
          // skip / quarantine：丢弃该 record（quarantine 已通过 onDirty 入库）
          // inner-batch 下一条
        }
      }
      batch = nextBatch;
      if (batch.length === 0) break;
    }
    for (const out of batch) yield out;

    // 流式检查 errorLimit
    const rate = errors / total;
    if (
      (errorLimit.rate !== undefined && rate > errorLimit.rate) ||
      (errorLimit.count !== undefined && errors > errorLimit.count)
    ) {
      throw new ErrorLimitExceeded(rate, errors, errorLimit);
    }
  }

  // flush 各 step（如 dedup 末尾不再发射，目前所有实现 flush 均空）
  for (const { step, state } of stepStates) {
    const handler = getTransformHandler(step.type);
    if (handler.flush) {
      const flushed = handler.flush(state, step.config, ctx);
      for (const r of flushed) yield r;
    }
  }

  logger.debug(
    { total, errors, rate: errors / Math.max(total, 1) },
    "Transform pipeline 完成",
  );
}

/** 同步版引擎：输入数组，输出结果（用于 preview） */
export async function runTransformSync(
  input: Record<string, unknown>[],
  pipeline: TransformPipeline,
  ctx: TransformContext,
): Promise<TransformEngineResult> {
  const output: Record<string, unknown>[] = [];
  const dirty: DirtyRecord[] = [];
  let totalRead = 0;
  let totalWrite = 0;
  let totalDirty = 0;

  async function* gen(): AsyncIterable<Record<string, unknown>> {
    for (const r of input) {
      totalRead++;
      yield r;
    }
  }

  try {
    for await (const r of runTransformPipeline(
      gen(),
      pipeline,
      ctx,
      (d) => {
        dirty.push(d);
        totalDirty++;
      },
    )) {
      output.push(r);
      totalWrite++;
    }
  } catch (err) {
    if (err instanceof ErrorLimitExceeded) throw err;
    // 其他错误统一包装
    throw err;
  }

  return {
    output,
    dirty,
    totalRead,
    totalWrite,
    totalDirty,
    evidence: ctx.evidence,
  };
}
