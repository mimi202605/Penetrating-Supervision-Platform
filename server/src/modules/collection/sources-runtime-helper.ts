// 凭据解密 + 配置合并 helper（runtime 专用，避免与 sources.ts 路由循环依赖）
import { queryOne } from "../../db/index.js";
import { decryptSecret } from "./crypto.js";
import { getConnector } from "./connectors/index.js";

/** 读取并解密数据源的完整 config（合并非敏感 config_json + 解密后的凭据） */
export function loadFullConfigFromRow(
  row: Record<string, unknown>,
  connectorType: string,
): Record<string, unknown> {
  let nonSecret: Record<string, unknown> = {};
  const configJson = row.config_json;
  if (typeof configJson === "string" && configJson) {
    try {
      nonSecret = JSON.parse(configJson) as Record<string, unknown>;
    } catch {
      nonSecret = {};
    }
  }
  // 兜底：若 config_json 为空，回退到 endpoint 字段
  if (!nonSecret.endpoint && row.endpoint) {
    nonSecret.endpoint = row.endpoint;
  }
  // 解密凭据
  const sourceId = String(row.id);
  let secret: Record<string, unknown> = {};
  const secretRow = queryOne<{ secret_blob: Uint8Array }>(
    "SELECT secret_blob FROM data_source_secrets WHERE source_id = ?",
    [sourceId],
  );
  if (secretRow) {
    try {
      secret = decryptSecret<Record<string, unknown>>(secretRow.secret_blob);
    } catch {
      secret = {};
    }
  }
  void getConnector; // 引用保留：specOf 等价
  void connectorType;
  return { ...nonSecret, ...secret };
}
