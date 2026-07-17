// 数据源凭据加解密（AES-256-GCM）
// 密文布局：[IV(12字节) | authTag(16字节) | 密文]
// 密钥从 config.sourceSecretKey 读取（环境变量 SOURCE_SECRET_KEY），不入库不入日志
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../../config.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

/** 加密凭据对象，返回 Buffer */
export function encryptSecret(
  obj: Record<string, unknown>,
  keyRef: string = config.sourceSecretKeyRef,
): Buffer {
  const key = Buffer.from(config.sourceSecretKey, "utf-8");
  if (key.length !== 32) {
    throw new Error("SOURCE_SECRET_KEY 必须为 32 字节");
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const plain = Buffer.from(JSON.stringify(obj), "utf-8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  // 引用 keyRef 仅用于审计追溯，不存储密钥本身
  void keyRef;
  return Buffer.concat([iv, tag, enc]);
}

/** 解密凭据密文，返回原始对象 */
export function decryptSecret<T = Record<string, unknown>>(
  blob: Buffer | Uint8Array,
  _keyRef?: string,
): T {
  const key = Buffer.from(config.sourceSecretKey, "utf-8");
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error("密文长度不足，无法解密");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(plain.toString("utf-8")) as T;
}

/** 脱敏凭据字段（API 返回时统一调用） */
export function maskSecrets(
  obj: Record<string, unknown>,
  secretFields: string[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (secretFields.includes(k) && typeof v === "string" && v.length > 0) {
      out[k] = "****";
    } else {
      out[k] = v;
    }
  }
  return out;
}
