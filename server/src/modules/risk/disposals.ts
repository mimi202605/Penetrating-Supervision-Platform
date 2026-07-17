// 风险处置记录模块：每个线索的处置流水（receive/dispose/approve/close）
// 对应 risk_disposals 表
import { execute, queryAll, transaction } from "../../db/index.js";
import { camelize } from "../../utils/case.js";
import { logger } from "../../utils/logger.js";

/** 处置步骤 */
export type DisposalStep = "receive" | "dispose" | "approve" | "close" | "other";

/** 处置请求体 */
export interface DisposalInput {
  clueId: string;
  step: DisposalStep;
  handler: string;
  roleCode?: string;
  comment?: string;
  attachment?: string;
}

/** 当前时间字符串（YYYY-MM-DD HH:mm） */
function nowFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 生成处置记录 ID */
function generateDisposalId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `DISP${stamp}${rand}`;
}

/** 记录一条处置流水 */
export function recordDisposal(input: DisposalInput): Record<string, unknown> {
  const id = generateDisposalId();
  const now = nowFormatted();
  transaction(() => {
    execute(
      `INSERT INTO risk_disposals (id, clue_id, step, handler, role_code, comment, attachment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.clueId,
        input.step,
        input.handler,
        input.roleCode || null,
        input.comment || null,
        input.attachment || null,
        now,
      ],
    );
  });
  logger.info({ disposalId: id, clueId: input.clueId, step: input.step, handler: input.handler }, "处置流水已记录");
  const row = queryAll<Record<string, unknown>>(
    "SELECT * FROM risk_disposals WHERE id = ?",
    [id],
  );
  return row.length > 0 ? camelize(row[0]) : { id, clueId: input.clueId, step: input.step };
}

/** 列出指定线索的全部处置流水 */
export function listDisposalsByClue(clueId: string): Array<Record<string, unknown>> {
  const rows = queryAll<Record<string, unknown>>(
    "SELECT * FROM risk_disposals WHERE clue_id = ? ORDER BY created_at ASC, id ASC",
    [clueId],
  );
  return rows.map((r) => camelize(r));
}

void logger;
