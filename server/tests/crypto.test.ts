// crypto.ts 单元测试
import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret, maskSecrets } from "../src/modules/collection/crypto.ts";

test("encryptSecret / decryptSecret 往返一致", () => {
  const original = { username: "admin", password: "P@ssw0rd!123", token: "abc-xyz" };
  const blob = encryptSecret(original);
  assert.ok(Buffer.isBuffer(blob));
  assert.ok(blob.length > 28, "密文应含 IV+tag+密文");
  const decoded = decryptSecret<typeof original>(blob);
  assert.deepEqual(decoded, original);
});

test("decryptSecret 拒绝篡改的密文（GCM 完整性）", () => {
  const blob = encryptSecret({ password: "secret" });
  const tampered = Buffer.from(blob);
  tampered[tampered.length - 1] ^= 0xff; // 翻转末位
  assert.throws(() => decryptSecret(tampered), /unsupported|auth|decrypt/i);
});

test("maskSecrets 脱敏 secretFields", () => {
  const out = maskSecrets(
    { username: "admin", password: "secret", token: "tok" },
    ["password", "token"],
  );
  assert.equal(out.username, "admin");
  assert.equal(out.password, "****");
  assert.equal(out.token, "****");
});

test("maskSecrets 空字符串不脱敏（避免暴露字段存在性）", () => {
  const out = maskSecrets({ password: "" }, ["password"]);
  // 空值保持空，不转为 ****
  assert.equal(out.password, "");
});
