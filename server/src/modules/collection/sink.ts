// Sink 写入：根据 sink_type 落地到 ods_generic / 专用表 / 外部
import { transaction, execute } from "../../db/index.js";
import { logger } from "../../utils/logger.js";

interface TaskRow {
  id: string;
  sink_type: string | null;
  sink_target: string | null;
  write_mode: string | null;
}

/** 把记录批量写入 sink（默认 ods_generic；专用表预留） */
export function writeRecordsToSink(
  task: TaskRow,
  runId: string,
  stream: string,
  records: Record<string, unknown>[],
): void {
  if (records.length === 0) return;
  const sinkType = task.sink_type || "ods-generic";
  const writeMode = task.write_mode || "append";

  switch (sinkType) {
    case "ods-generic":
      writeOdsGeneric(task.id, runId, stream, records, writeMode);
      break;
    default:
      // 其他 sink 类型预留
      logger.warn(
        { taskId: task.id, sinkType },
        "未知 sink_type，回退到 ods-generic",
      );
      writeOdsGeneric(task.id, runId, stream, records, writeMode);
  }
}

/** 写 ods_generic 表（事务批写，overwrite 模式先清同 stream） */
function writeOdsGeneric(
  taskId: string,
  runId: string,
  stream: string,
  records: Record<string, unknown>[],
  writeMode: string,
): void {
  transaction(() => {
    if (writeMode === "overwrite") {
      execute("DELETE FROM ods_generic WHERE stream = ?", [stream]);
    }
    // 批量 INSERT
    const stmt = "INSERT INTO ods_generic (task_id, run_id, stream, record_json) VALUES (?, ?, ?, ?)";
    for (const rec of records) {
      execute(stmt, [taskId, runId, stream, JSON.stringify(rec)]);
    }
  });
  logger.debug(
    { taskId, runId, stream, count: records.length, writeMode },
    "sink 写入 ods_generic",
  );
}
