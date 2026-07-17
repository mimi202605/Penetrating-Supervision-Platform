// 端到端验证（V2 Spec Task 23.2）
// 链路：建库 → 触发 m-fin-dup-pay-001 关联任务 → 等待完成 → 校验 risk_clues 入库
//      → 派单 → 处置 → 关闭 → 工单 archive；断言全链路状态
//
// 运行方式（假设服务已在 localhost:7077 运行）：
//   cd /workspace/server && pnpm exec tsx scripts/e2e.ts
//
// 说明：m-fin-dup-pay-001 的 rule_dsl 要求 fact dupCount>=2，而种子任务 T-V2-001
// 的 script transform 产出 { trigger: true, ... }（无 dupCount），无法直接命中。
// 因此本脚本采用 spec 推荐的 fallback：
//   1) 先调 POST /regulatory/models/m-fin-dup-pay-001/test 验证模型可编译；
//   2) 创建临时红线模型（trigger==true, level=red）+ 临时任务，跑全链路。
// 临时模型/任务用时间戳后缀 ID，保证幂等可重跑。
import { getDb, queryAll, queryOne } from "../src/db/index.js";

const BASE = process.env.E2E_BASE || "http://localhost:7077/api/v1";
const ADMIN = { username: "admin", password: "admin123" };

/** 简单 sleep */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** HTTP 调用辅助：返回 { status, body }，body 已 JSON 解析（失败保留原文） */
async function api(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // 保留原文
  }
  return { status: res.status, body: json };
}

/** 断言：失败抛错并以 exit 1 退出 */
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`  ✗ 断言失败：${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

/** 从 body 取字段（宽松类型） */
function pick(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object") {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

async function main(): Promise<void> {
  const ts = Date.now();
  const redModelId = `m-e2e-red-${ts}`;
  const redTaskId = `T-E2E-RED-${ts}`;
  // 复用种子数据源 DS-V2-001（treasury-sys mock，可产出 payment_flow 记录）
  const seedSourceId = "DS-V2-001";

  console.log("==========================================");
  console.log("  V2 E2E：风险闭环全链路（Task 23.2）");
  console.log(`  run-ts=${ts}  base=${BASE}`);
  console.log("==========================================");

  // 0. 打开 DB 连接（与服务端共享同一 SQLite 文件，WAL 模式支持并发读）
  await getDb();
  console.log("→ 已连接数据库（用于直查 risk_clues / work_orders）");

  // 1. 登录 admin/admin123 拿 token
  console.log("\n=== Step 1：登录 ===");
  const login = await api("POST", "/auth/login", null, ADMIN);
  assert(login.status === 200, `登录 HTTP 200（实际 ${login.status}）`);
  const token = pick(login.body, "token") as string | undefined;
  assert(!!token, "登录返回 token");
  const userId = pick(pick(login.body, "user"), "id") as string | undefined;
  console.log(`  用户ID=${userId ?? "unknown"}`);

  // 2. 验证 m-fin-dup-pay-001 可编译并命中（facts: dupCount=3 应命中）
  console.log("\n=== Step 2：验证 m-fin-dup-pay-001 可编译 ===");
  const testRes = await api(
    "POST",
    "/regulatory/models/m-fin-dup-pay-001/test",
    token,
    { facts: [{ dupCount: 3 }] },
  );
  const testHit = pick(testRes.body, "hitCount");
  assert(
    testRes.status === 200 && typeof testHit === "number" && testHit >= 1,
    `m-fin-dup-pay-001 可编译并命中（hitCount=${testHit}）`,
  );

  // 3. 创建临时红线模型（trigger==true, level=red，绑定 sc-fin-dup-pay）
  console.log("\n=== Step 3：创建临时红线模型 ===");
  const modelBody = {
    id: redModelId,
    sceneId: "sc-fin-dup-pay",
    domain: "finance-risk",
    name: "E2E红线模型",
    ruleDsl: {
      conditions: { all: [{ fact: "trigger", operator: "equal", value: true }] },
      event: { type: "risk-hit", params: { level: "red", title: "E2E红线命中" } },
    },
    status: "online",
  };
  const modelRes = await api("POST", "/regulatory/models", token, modelBody);
  assert(
    pick(modelRes.body, "id") === redModelId,
    `创建红线模型 ${redModelId}`,
  );

  // 4. 创建临时采集任务（绑定 DS-V2-001 + 红线模型，script transform 产出 { trigger: true }）
  console.log("\n=== Step 4：创建临时采集任务（绑定红线模型） ===");
  const taskBody = {
    id: redTaskId,
    name: "E2E红线触发任务",
    source: "treasury-sys",
    mode: "全量",
    sourceId: seedSourceId,
    sinkType: "ods-generic",
    sinkTarget: "ods_e2e_red",
    writeMode: "append",
    transformPipeline: {
      steps: [
        {
          id: "s1",
          type: "script",
          config: { code: "return { trigger: true }" },
        },
      ],
    },
    concurrency: 1,
    sceneId: "sc-fin-dup-pay",
    modelId: redModelId,
    enabled: 1,
  };
  const taskRes = await api("POST", "/collection/tasks", token, taskBody);
  assert(
    pick(taskRes.body, "modelId") === redModelId,
    `创建任务 ${redTaskId}（modelId=${redModelId}）`,
  );

  // 5. 触发任务
  console.log("\n=== Step 5：触发采集任务 ===");
  const trig = await api("POST", `/collection/tasks/${redTaskId}/trigger`, token, {});
  assert(
    pick(trig.body, "status") === "accepted",
    `任务触发已受理（status=accepted）`,
  );

  // 6. 轮询 runs 直到 success（最多 30s）
  console.log("\n=== Step 6：轮询任务运行状态 ===");
  let runStatus = "";
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const runsRes = await api("GET", `/collection/tasks/${redTaskId}/runs`, token);
    const runs = runsRes.body as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(runs) && runs.length > 0) {
      runStatus = String(runs[0].status ?? "");
      if (runStatus === "success") break;
      if (runStatus === "failed" || runStatus === "killed") break;
    }
  }
  assert(runStatus === "success", `任务运行成功（status=${runStatus}）`);

  // 7. 轮询 DB risk_clues 直到红线线索入库（最多 15s，等模型评估桥接）
  console.log("\n=== Step 7：校验 risk_clues 入库（红线线索） ===");
  let clue: Record<string, unknown> | undefined;
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const rows = queryAll<Record<string, unknown>>(
      "SELECT * FROM risk_clues WHERE model_id = ? ORDER BY detected_at DESC LIMIT 1",
      [redModelId],
    );
    if (rows.length > 0) {
      clue = rows[0];
      break;
    }
  }
  assert(!!clue, "红线线索已入库");
  const clueId = String(clue!.id);
  assert(
    String(clue!.risk_level) === "red",
    `线索风险级别=red（实际 ${clue!.risk_level}）`,
  );
  console.log(`  线索ID=${clueId}  初始状态=${clue!.status}`);

  // 8. 派单（red 自动派单；若未自动派单则手动 dispatch）
  console.log("\n=== Step 8：派单（确保 status=dispatched） ===");
  if (String(clue!.status) !== "dispatched") {
    const dispRes = await api("POST", `/risk/clues/${clueId}/dispatch`, token, {});
    assert(dispRes.status === 201, `手动派单成功（HTTP ${dispRes.status}）`);
  } else {
    console.log("  ✓ 红线线索已自动派单（status=dispatched）");
  }
  // 重新查线索确认状态
  clue = queryOne<Record<string, unknown>>(
    "SELECT id, status, work_order_id FROM risk_clues WHERE id = ?",
    [clueId],
  );
  assert(!!clue, "派单后线索可查");
  assert(
    String(clue!.status) === "dispatched",
    `线索 status=dispatched（实际 ${clue!.status}）`,
  );
  const workOrderId = String(clue!.work_order_id ?? "");
  assert(!!workOrderId, `线索已关联工单（work_order_id=${workOrderId}）`);

  // 9. 处置（POST /risk/clues/:id/dispose）
  console.log("\n=== Step 9：处置 ===");
  const dispBody = {
    step: "dispose",
    handler: "admin",
    comment: "e2e处置",
  };
  const disposeRes = await api(
    "POST",
    `/risk/clues/${clueId}/dispose`,
    token,
    dispBody,
  );
  assert(
    disposeRes.status === 201 && pick(disposeRes.body, "step") === "dispose",
    "处置记录已添加（step=dispose）",
  );

  // 10. 关闭（POST /risk/clues/:id/close，closeClue 内部联动工单 archive）
  console.log("\n=== Step 10：关闭线索（销警 → 工单 archive） ===");
  const closeRes = await api("POST", `/risk/clues/${clueId}/close`, token, {});
  assert(
    pick(closeRes.body, "success") === true,
    "线索关闭成功（success=true）",
  );

  // 11. 最终校验：risk_clues.status=closed + work_orders.status=archived + current_node=archive + progress=100
  console.log("\n=== Step 11：最终全链路状态校验 ===");
  const finalClue = queryOne<Record<string, unknown>>(
    "SELECT id, status, work_order_id FROM risk_clues WHERE id = ?",
    [clueId],
  );
  assert(!!finalClue, "关闭后线索可查");
  assert(
    String(finalClue!.status) === "closed",
    `risk_clues.status=closed（实际 ${finalClue!.status}）`,
  );

  const wo = queryOne<Record<string, unknown>>(
    "SELECT id, current_node, progress, status FROM work_orders WHERE id = ?",
    [workOrderId],
  );
  assert(!!wo, "关联工单可查");
  assert(
    String(wo!.current_node) === "archive",
    `work_orders.current_node=archive（实际 ${wo!.current_node}）`,
  );
  assert(
    Number(wo!.progress) === 100,
    `work_orders.progress=100（实际 ${wo!.progress}）`,
  );
  assert(
    String(wo!.status) === "archived",
    `work_orders.status=archived（实际 ${wo!.status}）`,
  );

  // 12. 处置流水校验（应有 1 条 dispose 记录）
  const disposals = queryAll<Record<string, unknown>>(
    "SELECT step FROM risk_disposals WHERE clue_id = ?",
    [clueId],
  );
  assert(
    disposals.some((d) => String(d.step) === "dispose"),
    `处置流水包含 dispose（共 ${disposals.length} 条）`,
  );

  console.log("\n==========================================");
  console.log("  ✅ E2E 全链路通过");
  console.log("==========================================");
}

main().catch((err: unknown) => {
  console.error("\n❌ E2E 执行异常：", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
