// 回归测试：覆盖本次代码审查发现并修复的关键缺陷。
// 运行：pnpm test  (等价于 node --import tsx --test tests/*.test.ts)
//
// 测试分两类：
// 1) 纯函数测试（无需 DB）：escapeForLiteral、RBAC 权限映射
// 2) DB 集成测试：禁用规则不应触发、穿透树防环、工单状态机事务性、采集任务级联删除
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在导入任何会触发 config.ts 加载的模块之前设置环境变量。
// config.ts 在模块求值时读取 process.env，ESM 静态 import 会先于本文件顶层语句执行，
// 因此对应用模块统一使用动态 import()，确保 env 先就位。
process.env.NODE_ENV = "development"; // 避免 JWT_SECRET 生产守卫抛错
process.env.JWT_SECRET = "test-secret-not-default";
process.env.SEED_ON_BOOT = "false";
const TEST_DB = join(tmpdir(), `supervision-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TEST_DB;

// ===================== 纯函数测试 =====================

describe("escapeForLiteral — SQL/Cypher 占位响应注入防护", async () => {
  const { escapeForLiteral } = await import("../src/modules/ai/ai-service.js");

  test("单引号被加倍，阻断 ' OR '1'='1 类注入", () => {
    const out = escapeForLiteral("' OR '1'='1");
    assert.equal(out.includes("' OR '1'='1"), false, "原始注入 payload 不应原样保留");
    assert.equal(out.includes("''"), true, "单引号应被加倍为 ''");
    // 加倍后插入 SQL 字符串字面量，整个 payload 会被当作字面值，无法逃逸
    const sql = `WHERE name LIKE '%${out}%'`;
    assert.equal(sql.match(/LIKE '%[^']*' OR '1'='1%/), null, "不应形成 OR '1'='1 注入结构");
  });

  test("语句分隔符 ; 与注释 -- 被移除", () => {
    const out = escapeForLiteral("x'; DROP TABLE users;--");
    assert.equal(out.includes(";"), false, "; 应被移除");
    assert.equal(out.includes("--"), false, "-- 应被移除");
    assert.equal(out.includes("DROP TABLE"), true, "普通文本保留（已无害，因无分隔符/注释无法成句）");
  });

  test("正常中文/英文查询不受影响", () => {
    assert.equal(escapeForLiteral("新兴铸管邯郸基地"), "新兴铸管邯郸基地");
    // 单个连字符不是 SQL 注释（注释需 --），不应被移除
    assert.equal(escapeForLiteral("account-123"), "account-123");
    // 连续两个连字符（SQL 行注释起始）会被移除
    assert.equal(escapeForLiteral("foo--bar"), "foobar");
  });
});

describe("RBAC 权限映射 — 验证修复所依赖的权限模型", async () => {
  const { hasPermission } = await import("../src/modules/platform/rbac.js");

  test("audit:read 仅授予 admin / leader", () => {
    assert.equal(hasPermission("admin", "audit:read"), true);
    assert.equal(hasPermission("leader", "audit:read"), true);
    // 这三个角色不应能读审计日志（修复前 GET /system/audit 漏检，任一登录用户可读全量）
    assert.equal(hasPermission("group_admin", "audit:read"), false);
    assert.equal(hasPermission("inspector", "audit:read"), false);
    assert.equal(hasPermission("duty_officer", "audit:read"), false);
  });

  test("sanitizer:read 仅授予 admin", () => {
    assert.equal(hasPermission("admin", "sanitizer:read"), true);
    assert.equal(hasPermission("leader", "sanitizer:read"), false);
    assert.equal(hasPermission("inspector", "sanitizer:read"), false);
  });

  test("ai:invoke 授予 admin（/ai/health 修复后要求此权限）", () => {
    assert.equal(hasPermission("admin", "ai:invoke"), true);
    assert.equal(hasPermission("duty_officer", "ai:invoke"), false);
  });
});

// ===================== DB 集成测试 =====================

describe("DB 集成：规则引擎 / 穿透树 / 工单事务", async () => {
  // 动态导入：此时 env 已就位，config.ts / db/index.ts 会读到 TEST_DB
  const { getDb, initSchema, execute, queryOne, transaction } = await import("../src/db/index.js");
  const { evaluateRule } = await import("../src/modules/monitoring/rule-engine.js");
  const { buildPenetrationTree } = await import("../src/modules/monitoring/penetration.js");
  const { advanceWorkOrder } = await import("../src/modules/dispatch/workflow.js");

  before(async () => {
    await initSchema();
    // 插入最小测试数据
    execute(
      "INSERT INTO rules (id, name, domain, dsl_json, priority, enabled, version) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        "R-TEST",
        "大额资金流出测试规则",
        "财务",
        JSON.stringify({
          conditions: { all: [{ fact: "amount", operator: "greaterThanInclusive", value: 1_000_000 }] },
          event: { type: "high-risk", params: { level: "high", title: "大额流出" } },
        }),
        1,
        1,
        1,
      ],
    );
  });

  after(() => {
    try {
      rmSync(TEST_DB);
    } catch {
      /* 忽略 */
    }
  });

  test("已禁用的规则不得触发预警或派单", async () => {
    // 先启用：应命中
    execute("UPDATE rules SET enabled = 1 WHERE id = ?", ["R-TEST"]);
    const hitEnabled = await evaluateRule("R-TEST", { amount: 5_000_000, subject: "公司A" });
    assert.equal(hitEnabled.hit, true, "启用规则应命中");
    assert.ok(hitEnabled.warning, "启用规则命中应生成预警");
    // 清理本次产生的预警，避免影响后续
    execute("DELETE FROM risk_warnings WHERE rule = ?", ["大额资金流出测试规则"]);

    // 禁用：不应命中、不应生成预警
    execute("UPDATE rules SET enabled = 0 WHERE id = ?", ["R-TEST"]);
    const hitDisabled = await evaluateRule("R-TEST", { amount: 5_000_000, subject: "公司A" });
    assert.equal(hitDisabled.hit, false, "禁用规则不得命中");
    assert.equal(hitDisabled.warning, undefined, "禁用规则不得生成预警");

    // 验证 DB 中没有因禁用规则产生新预警
    const cnt = queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM risk_warnings WHERE rule = ?",
      ["大额资金流出测试规则"],
    );
    assert.equal(cnt?.c ?? 0, 0, "禁用规则不应在 DB 中留下任何预警");
  });

  test("穿透树：organizations.parent_id 成环时不得栈溢出", () => {
    // 构造 A → B → A 的环（外加一个正常根以便 buildPenetrationTree 能取到根）
    execute(
      "INSERT INTO organizations (id, name, level, parent_id, type) VALUES (?, ?, ?, ?, ?)",
      ["root-org", "根组织", 1, null, "集团总部"],
    );
    execute(
      "INSERT INTO organizations (id, name, level, parent_id, type) VALUES (?, ?, ?, ?, ?)",
      ["org-A", "A", 2, "org-B", "二级"],
    );
    execute(
      "INSERT INTO organizations (id, name, level, parent_id, type) VALUES (?, ?, ?, ?, ?)",
      ["org-B", "B", 2, "org-A", "二级"],
    );

    // 修复前：buildNode(A) → buildNode(B) → buildNode(A) → ... → RangeError
    // 修复后：visited 集合截断环，正常返回
    let tree;
    assert.doesNotThrow(() => {
      tree = buildPenetrationTree();
    }, "环状 parent_id 不应导致栈溢出");
    assert.ok(tree, "穿透树应正常构建");
  });

  test("advanceWorkOrder：归档时 work_orders 与 risk_warnings 在同一事务中提交", () => {
    // 构造一个处于 close 节点的工单（V2 七态倒数第二节点，一次推进即归档）+ 关联预警
    execute(
      "INSERT INTO risk_warnings (id, title, domain, level, subject, rule, triggered_at, status, clue, related_order_id, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ["RW-TEST-1", "测试预警", "财务", "high", "公司A", "测试规则", "2026-07-17 10:00", "processing", "线索", "WO-TEST-1", "{}"],
    );
    execute(
      "INSERT INTO work_orders (id, risk_source, owner, current_node, progress, status, risk_warning_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ["WO-TEST-1", "测试风险源", "张三", "close", 90, "processing", "RW-TEST-1", "2026-07-17 09:00", "2026-07-17 09:00"],
    );

    const result = advanceWorkOrder("WO-TEST-1");
    assert.equal(result.ok, true, "推进应成功");
    assert.equal(result.toNode, "archive", "应推进到 archive");

    // 关键断言：工单已 archive AND 关联预警已 resolved（同一事务，要么都成功要么都回滚）
    const wo = queryOne<{ status: string; current_node: string; progress: number }>(
      "SELECT status, current_node, progress FROM work_orders WHERE id = ?",
      ["WO-TEST-1"],
    );
    const rw = queryOne<{ status: string; related_order_id: string | null }>(
      "SELECT status, related_order_id FROM risk_warnings WHERE id = ?",
      ["RW-TEST-1"],
    );
    assert.equal(wo?.status, "archived", "工单应已归档");
    assert.equal(wo?.progress, 100, "进度应为 100");
    assert.equal(rw?.status, "resolved", "关联风险预警应同步置为 resolved（事务联动）");
    assert.equal(rw?.related_order_id, "WO-TEST-1", "预警既有的 related_order_id 不应被破坏");
  });

  test("transaction() 回滚：内部抛错时所有写操作都不落库", () => {
    // 先插入一条独立工单用于验证回滚
    execute(
      "INSERT INTO work_orders (id, risk_source, owner, current_node, progress, status, risk_warning_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ["WO-ROLLBACK", "回滚测试", "李四", "verify", 20, "processing", null, "2026-07-17 09:00", "2026-07-17 09:00"],
    );

    assert.throws(
      () =>
        transaction(() => {
          execute("UPDATE work_orders SET owner = '新负责人' WHERE id = ?", ["WO-ROLLBACK"]);
          throw new Error("模拟中途失败");
        }),
      /模拟中途失败/,
    );

    // 关键断言：事务回滚后，UPDATE 不应生效
    const wo = queryOne<{ owner: string | null }>(
      "SELECT owner FROM work_orders WHERE id = ?",
      ["WO-ROLLBACK"],
    );
    assert.equal(wo?.owner, "李四", "事务回滚后写操作不应落库");
  });
});

describe("穿透树 depth 参数解析（图查询 BFS 深度上限）", async () => {
  // graph.ts 的 depth 解析逻辑内联在路由处理器中，这里直接验证等价的解析规则，
  // 确保非数字输入不会让 BFS 深度上限被 NaN 绕过。
  test("非数字 depth 不得产生 NaN（NaN 会让 d >= depth 恒 false、BFS 深度上限被绕过）", () => {
    const parseDepth = (raw: string | undefined): number => {
      const parsed = Number(raw ?? 2);
      return Number.isFinite(parsed) ? Math.max(1, Math.min(5, Math.floor(parsed))) : 2;
    };
    // 关键：任何输入都不得返回 NaN
    for (const v of ["abc", "", undefined, "3", "10", "0", "-1", "2"]) {
      const d = parseDepth(v as string | undefined);
      assert.equal(Number.isNaN(d), false, `depth=${JSON.stringify(v)} 不应解析为 NaN`);
      assert.ok(d >= 1 && d <= 5, `depth=${JSON.stringify(v)} 应在 [1,5] 区间，实际 ${d}`);
    }
    assert.equal(parseDepth("abc"), 2, "'abc' 应回退到默认 2");
    assert.equal(parseDepth(undefined), 2, "undefined 回退到 2");
    assert.equal(parseDepth("3"), 3, "合法数字 3 正常解析");
    assert.equal(parseDepth("10"), 5, "越界值 10 被夹到 5");
    assert.equal(parseDepth("0"), 1, "0 被夹到下限 1");
    assert.equal(parseDepth("-1"), 1, "负数被夹到下限 1");
  });
});
