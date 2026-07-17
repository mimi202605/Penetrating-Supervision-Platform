// 连接器测试：6 个已实现 + 14 个占位
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerAllConnectors, getConnector, listConnectors } from "../src/modules/collection/connectors/index.ts";

registerAllConnectors();

test("registry 含 20 个连接器", () => {
  const list = listConnectors();
  assert.equal(list.length, 20);
  const types = list.map((s) => s.type);
  for (const t of [
    "kingdee-eas-openapi",
    "sap-odata",
    "jdbc-mysql",
    "cdc-mysql",
    "treasury-sys",
    "file-csv",
  ]) {
    assert.ok(types.includes(t), `连接器 ${t} 应注册`);
  }
});

test("kingdee-eas-openapi test/discover/read", async () => {
  const c = getConnector("kingdee-eas-openapi");
  const t = await c.test({ endpoint: "http://eas", username: "u", password: "p" });
  assert.equal(t.status, "online");
  const cat = await c.discover({});
  assert.ok(cat.streams.length >= 4);
  assert.ok(cat.streams.some((s) => s.name === "customer"));
  const records: Record<string, unknown>[] = [];
  for await (const r of c.read({ config: {}, stream: "customer", mode: "full" })) {
    records.push(r);
  }
  assert.equal(records.length, 100);
  assert.ok(records[0].FNumber);
});

test("sap-odata discover 返回 entity set", async () => {
  const c = getConnector("sap-odata");
  const cat = await c.discover({});
  assert.ok(cat.streams.some((s) => s.name === "MaterialSet"));
});

test("jdbc-mysql 按 split.range 切片", async () => {
  const c = getConnector("jdbc-mysql");
  const records: Record<string, unknown>[] = [];
  for await (const r of c.read({
    config: { host: "h", database: "d" },
    stream: "t_account",
    mode: "full",
    split: { id: "0-100", range: [0, 100] },
  })) {
    records.push(r);
  }
  assert.equal(records.length, 100);
  assert.equal(records[0].id, 0);
  assert.equal(records[99].id, 99);
});

test("cdc-mysql 从 checkpoint 增量拉取", async () => {
  const c = getConnector("cdc-mysql");
  const records: Record<string, unknown>[] = [];
  for await (const r of c.read({
    config: { host: "h" },
    stream: "t_payment",
    mode: "cdc",
    checkpoint: { last_pk: 100, binlog_file: "mysql-bin.000001", position: 1000 },
  })) {
    records.push(r);
  }
  assert.equal(records.length, 500);
  assert.equal(records[0].id, 101);
  assert.equal(records[499].id, 600);
});

test("treasury-sys 生成 200 条 payment_flow 含非工作时间样本", async () => {
  const c = getConnector("treasury-sys");
  const records: Record<string, unknown>[] = [];
  for await (const r of c.read({ config: { endpoint: "http://t", token: "x" }, stream: "payment_flow", mode: "full" })) {
    records.push(r);
  }
  assert.equal(records.length, 200);
  const nightPrivate = records.filter(
    (r) => r.payeeType === "对私" && /T23:/.test(String(r.payTime)),
  );
  assert.ok(nightPrivate.length > 0, "应含非工作时间对私支付样本");
});

test("file-csv test 真实文件存在性", async () => {
  const c = getConnector("file-csv");
  const t = await c.test({ path: "/etc/hostname" });
  assert.equal(t.status, "online");
  const t2 = await c.test({ path: "/nonexistent/file.csv" });
  assert.equal(t2.status, "offline");
});

test("占位连接器 test 返回 offline + NOT_IMPLEMENTED", async () => {
  const c = getConnector("sap-bapi");
  const t = await c.test({ ashost: "h", sysnr: "00", client: "100", user: "u", passwd: "p" });
  assert.equal(t.status, "offline");
  assert.match(t.error || "", /NOT_IMPLEMENTED/);
  await assert.rejects(() => c.discover({}), /未实现/);
});
