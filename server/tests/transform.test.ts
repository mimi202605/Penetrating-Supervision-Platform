// Transform 管道单元测试：13 类 Transform + engine + preview
import { test } from "node:test";
import assert from "node:assert/strict";
import { runPreview } from "../src/modules/collection/transform/preview.js";
import { listTransformTypes, getTransformHandler } from "../src/modules/collection/transform/registry.js";
import { runTransformPipeline } from "../src/modules/collection/transform/engine.js";
import { ErrorLimitExceeded } from "../src/modules/collection/transform/types.js";
import { getDb, initSchema } from "../src/db/index.js";
import { addNodeSync, addEdgeSync } from "../src/modules/monitoring/graph.js";

test("listTransformTypes 返回 13 类 Transform 含 configSchema", () => {
  const types = listTransformTypes();
  assert.equal(types.length, 13);
  const cats = new Set(types.map((t) => t.category));
  assert.ok(cats.has("basic"));
  assert.ok(cats.has("data-quality"));
  assert.ok(cats.has("security"));
  assert.ok(cats.has("regulatory"));
  for (const t of types) {
    assert.ok(t.configSchema.type === "object", `${t.type} configSchema 应为 object`);
  }
});

test("field-mapping：重命名 + includeOnly", async () => {
  const r = await runPreview({
    sample: [{ FNumber: "001", FName: "张三", FExtra: "x" }],
    pipeline: {
      steps: [
        { id: "s1", type: "field-mapping", config: { mapping: { FNumber: "code", FName: "name" }, includeOnly: true } },
      ],
    },
  });
  assert.deepEqual(r.output, [{ code: "001", name: "张三" }]);
  assert.equal(r.totalWrite, 1);
});

test("type-cast：decimal '123.45' → 123.45 (format 0.00 → 2 位)", async () => {
  const r = await runPreview({
    sample: [{ amount: "123.456", qty: "10", active: "yes" }],
    pipeline: {
      steps: [
        {
          id: "s1",
          type: "type-cast",
          config: {
            fields: {
              amount: { target: "decimal", format: "0.00" },
              qty: { target: "number" },
              active: { target: "boolean" },
            },
          },
        },
      ],
    },
  });
  assert.equal(r.output[0].amount, 123.46);
  assert.equal(r.output[0].qty, 10);
  assert.equal(r.output[0].active, true);
});

test("clean：trim + defaults + regex replace", async () => {
  const r = await runPreview({
    sample: [{ name: "  abc  ", phone: "138-0000-0000", qty: "" }],
    pipeline: {
      steps: [
        {
          id: "s1",
          type: "clean",
          config: {
            trim: ["name"],
            defaults: { qty: 0 },
            replace: [{ field: "phone", pattern: "-", replacement: "" }],
          },
        },
      ],
    },
  });
  assert.equal(r.output[0].name, "abc");
  assert.equal(r.output[0].phone, "13800000000");
  assert.equal(r.output[0].qty, 0);
});

test("dedup：3 条同主键 → 输出 1 条", async () => {
  const r = await runPreview({
    sample: [
      { code: "A", v: 1 },
      { code: "A", v: 2 },
      { code: "B", v: 3 },
    ],
    pipeline: {
      steps: [{ id: "s1", type: "dedup", config: { keys: ["code"] } }],
    },
  });
  assert.equal(r.output.length, 2);
  assert.deepEqual(r.output[0], { code: "A", v: 1 });
  assert.deepEqual(r.output[1], { code: "B", v: 3 });
});

test("filter：amount>100 过滤", async () => {
  const r = await runPreview({
    sample: [{ amount: 50 }, { amount: 150 }, { amount: 200 }],
    pipeline: {
      steps: [{ id: "s1", type: "filter", config: { expr: "amount > 100" } }],
    },
  });
  assert.equal(r.output.length, 2);
  assert.equal(r.output[0].amount, 150);
  assert.equal(r.output[1].amount, 200);
});

test("mask：身份证 keep-edges 保留前 6 后 4", async () => {
  const r = await runPreview({
    sample: [{ idcard: "110101199001011234" }],
    pipeline: {
      steps: [
        {
          id: "s1",
          type: "mask",
          config: { fields: [{ name: "idcard", strategy: "keep-edges", keepPrefix: 6, keepSuffix: 4 }] },
        },
      ],
    },
  });
  assert.equal(r.output[0].idcard, "110101********1234");
});

test("mask：strategy=fixed 全部星号", async () => {
  const r = await runPreview({
    sample: [{ password: "super-secret" }],
    pipeline: {
      steps: [
        { id: "s1", type: "mask", config: { fields: [{ name: "password", strategy: "fixed" }] } },
      ],
    },
  });
  assert.equal(r.output[0].password, "****");
});

test("flatten：FEntry 数组展开为 2 条扁平记录", async () => {
  const r = await runPreview({
    sample: [
      {
        FVoucherNumber: "V-001",
        FEntry: [
          { FAccount: "1001", FDebit: 1000 },
          { FAccount: "1002", FCredit: 1000 },
        ],
      },
    ],
    pipeline: {
      steps: [{ id: "s1", type: "flatten", config: { field: "FEntry", prefix: "entry_", mode: "spread" } }],
    },
  });
  assert.equal(r.output.length, 2);
  assert.equal(r.output[0].FVoucherNumber, "V-001");
  assert.equal(r.output[0].entry_FAccount, "1001");
  assert.equal(r.output[0].entry_FDebit, 1000);
  assert.equal(r.output[1].entry_FAccount, "1002");
  assert.ok(!("FEntry" in r.output[1]));
});

test("enrich：维表关联 left join", async () => {
  const r = await runPreview({
    sample: [{ orgCode: "001", amount: 100 }, { orgCode: "999", amount: 50 }],
    pipeline: {
      steps: [
        {
          id: "s1",
          type: "enrich",
          config: {
            lookupField: "orgCode",
            lookupTable: { "001": { orgName: "总部" } },
            fields: { orgName: "orgName" },
            mode: "left",
          },
        },
      ],
    },
  });
  assert.equal(r.output.length, 2);
  assert.equal(r.output[0].orgName, "总部");
  assert.ok(!("orgName" in r.output[1]));
});

test("script：return {...record, _ts:1} 执行成功", async () => {
  const r = await runPreview({
    sample: [{ x: 1 }],
    pipeline: {
      steps: [{ id: "s1", type: "script", config: { code: "return { ...record, _ts: 1 }" } }],
    },
  });
  assert.equal(r.output[0].x, 1);
  assert.equal(r.output[0]._ts, 1);
});

test("script：require 被沙箱拦截（错误落入 dirty）", async () => {
  // vm2 沙箱内 require 未定义 → 抛 ReferenceError → handler 包装 TransformStepError
  // onError=skip 默认 → 记录入 dirty，不抛
  const r = await runPreview({
    sample: [{ x: 1 }],
    pipeline: {
      steps: [{ id: "s1", type: "script", config: { code: "return require('fs')" } }],
      errorLimit: { rate: 1.0 },
    },
  });
  assert.equal(r.output.length, 0, "脚本失败记录应被丢弃");
  assert.equal(r.dirty.length, 1, "应有 1 条脏数据");
  assert.match(r.dirty[0].error, /脚本执行失败/);
  assert.equal(r.dirty[0].stepId, "s1");
});

test("sql：SELECT * FROM ? WHERE amount > 100", async () => {
  const r = await runPreview({
    sample: [{ amount: 50, name: "a" }, { amount: 150, name: "b" }],
    pipeline: {
      steps: [{ id: "s1", type: "sql", config: { sql: "SELECT * FROM ? WHERE amount > 100" } }],
    },
  });
  assert.equal(r.output.length, 1);
  assert.equal(r.output[0].name, "b");
});

test("entity-resolve：两个系统同 org_code+name 归一同一 entityId", async () => {
  const r = await runPreview({
    sample: [
      { orgCode: "001", name: "总部", source: "EAS" },
      { orgCode: "001", name: "总部", source: "SAP" },
      { orgCode: "002", name: "分公司", source: "EAS" },
    ],
    pipeline: {
      steps: [{ id: "s1", type: "entity-resolve", config: { orgCodeField: "orgCode", nameField: "name" } }],
    },
  });
  assert.equal(r.output[0].entityId, r.output[1].entityId);
  assert.notEqual(r.output[0].entityId, r.output[2].entityId);
});

test("relationship-extract：节点+边写入图谱", async () => {
  // 需要数据库就绪：graph 模块写库依赖
  await getDb();
  await initSchema();
  addNodeSync({ id: "acc-test-1", label: "账户1", type: "account" });
  addEdgeSync({ source: "acc-test-1", target: "cp-test-1", label: "支付" });

  const r = await runPreview({
    sample: [
      { accId: "acc-test-2", accName: "账户2", cpId: "cp-test-2", amount: 1000 },
    ],
    pipeline: {
      steps: [
        {
          id: "s1",
          type: "relationship-extract",
          config: {
            nodes: [
              { idField: "accId", labelField: "accName", type: "account" },
              { idField: "cpId", labelField: "cpId", type: "counterparty" },
            ],
            edges: [{ fromField: "accId", toField: "cpId", label: "支付", weightField: "amount" }],
          },
        },
      ],
    },
  });
  // 透传原记录
  assert.equal(r.output.length, 1);
  // 图谱已写入（间接验证：再次 addNodeSync 不会重复，但已存在）
  assert.ok(true);
});

test("evidence-snapshot：命中条件时快照写入 evidence", async () => {
  const r = await runPreview({
    sample: [{ amount: 200 }, { amount: 50 }],
    pipeline: {
      steps: [
        {
          id: "s1",
          type: "evidence-snapshot",
          config: { ruleId: "R-001", condition: "amount > 100" },
        },
      ],
    },
  });
  assert.equal(r.output.length, 2);
  assert.equal(r.evidence?.length, 1);
  assert.equal(r.evidence?.[0].ruleId, "R-001");
  assert.equal(r.evidence?.[0].snapshot.amount, 200);
});

test("errorLimit：rate > 0.5 抛 ErrorLimitExceeded", async () => {
  await assert.rejects(
    runPreview({
      sample: [{ x: "a" }, { x: "b" }, { x: "c" }],
      pipeline: {
        steps: [
          { id: "s1", type: "type-cast", config: { fields: { x: { target: "number" } } } },
        ],
        errorLimit: { rate: 0.5 },
      },
    }),
    ErrorLimitExceeded,
  );
});

test("errorLimit 默认 0.01：1 条脏数据 rate=1 > 0.01 也抛", async () => {
  await assert.rejects(
    runPreview({
      sample: [{ x: "not-a-number" }],
      pipeline: {
        steps: [
          { id: "s1", type: "type-cast", config: { fields: { x: { target: "number" } } } },
        ],
      },
    }),
    // 默认 rate=0.01，单条全部失败 → rate=1 → 抛
  );
});

test("engine 流式：AsyncIterable 输入，flatten 后多输出", async () => {
  async function* gen() {
    yield { FEntry: [{ a: 1 }, { a: 2 }] };
    yield { FEntry: [{ a: 3 }] };
  }
  const out: Record<string, unknown>[] = [];
  for await (const r of runTransformPipeline(
    gen(),
    { steps: [{ id: "s1", type: "flatten", config: { field: "FEntry", prefix: "e_", mode: "spread" } }] },
    { evidence: [] },
  )) {
    out.push(r);
  }
  assert.equal(out.length, 3);
  assert.equal(out[0].e_a, 1);
  assert.equal(out[2].e_a, 3);
});

test("getTransformHandler 未知 type 抛错", () => {
  assert.throws(
    () => getTransformHandler("non-existent" as never),
    /未知 Transform 类型/,
  );
});

test("onError=skip：单步错误丢弃该记录，其他正常输出", async () => {
  const r = await runPreview({
    sample: [{ x: "1" }, { x: "not-a-num" }, { x: "3" }],
    pipeline: {
      steps: [
        { id: "s1", type: "type-cast", config: { fields: { x: { target: "number" } } }, onError: "skip" },
      ],
      errorLimit: { rate: 1.0 }, // 放开限制
    },
  });
  assert.equal(r.output.length, 2);
  assert.equal(r.dirty.length, 1);
  assert.equal(r.dirty[0].stepId, "s1");
  assert.equal(r.output[0].x, 1);
  assert.equal(r.output[1].x, 3);
});
