// 调度指挥中心 - 事件总线消费者
// 监听 'risk.warning.created'：high 级别预警自动创建核查工单
// 按风险领域分派责任人，并回填 risk_warnings.related_order_id
// 供 main.ts 启动时调用（非路由）
import { execute, queryOne } from "../../db/index.js";
import { eventBus } from "../platform/eventbus.js";
import { recordAudit } from "../platform/audit.js";
import { logger } from "../../utils/logger.js";

/** 风险领域 → 责任人映射（按关键字匹配 warning.domain） */
function pickOwner(domain: string | undefined): string {
  const d = (domain || "").trim();
  if (d.includes("财务")) return "李建国";
  if (d.includes("投资")) return "王志远";
  if (d.includes("采购")) return "周涛";
  if (d.includes("产权")) return "吴芳";
  return "赵敏";
}

/** 从 warning 派生风险来源（优先 title，回退 domain） */
function deriveRiskSource(warning: { title?: string; domain?: string }): string {
  if (warning.title && warning.title.trim()) return warning.title.trim();
  if (warning.domain && warning.domain.trim()) return warning.domain.trim();
  return "自动派单";
}

/** 当前时间字符串（YYYY-MM-DD HH:mm） */
function nowFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 生成工单 ID：WO + YYYYMMDDHHmmss + 3 位随机 */
function generateOrderId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `WO${stamp}${rand}`;
}

/** 风险预警事件 payload（与 rule-engine.ts emit 对齐） */
interface RiskWarningPayload {
  warning?: {
    id: string;
    title?: string;
    domain?: string;
    level?: string;
    subject?: string;
    rule?: string;
    triggeredAt?: string;
    status?: string;
  };
  ruleId?: string;
}

/**
 * 注册调度指挥中心事件消费者
 * - 'risk.warning.created'：high 级别预警自动创建工单（verify 节点），回填风险预警关联工单
 * 供 main.ts 启动时调用
 */
export function registerDispatchListeners(): void {
  eventBus.on("risk.warning.created", (payload: unknown) => {
    const p = (payload as RiskWarningPayload | undefined) ?? {};
    const warning = p.warning;
    if (!warning || !warning.id) {
      logger.warn({ payload }, "[dispatch] risk.warning.created 缺少 warning.id，跳过自动派单");
      return;
    }
    if (warning.level !== "high") {
      logger.debug(
        { warningId: warning.id, level: warning.level },
        "[dispatch] 非 high 级别预警，跳过自动派单",
      );
      return;
    }
    // 已存在关联工单则跳过，避免重复派单
    const existing = queryOne<{ id: string }>(
      "SELECT id FROM work_orders WHERE risk_warning_id = ?",
      [warning.id],
    );
    if (existing) {
      logger.info(
        { warningId: warning.id, orderId: existing.id },
        "[dispatch] 预警已关联工单，跳过自动派单",
      );
      return;
    }
    const owner = pickOwner(warning.domain);
    const riskSource = deriveRiskSource(warning);
    const orderId = generateOrderId();
    const now = nowFormatted();
    execute(
      "INSERT INTO work_orders (id, risk_source, owner, current_node, progress, status, risk_warning_id, created_at, updated_at) VALUES (?, ?, ?, 'verify', 20, 'processing', ?, ?, ?)",
      [orderId, riskSource, owner, warning.id, now, now],
    );
    // 回填风险预警关联工单 + 状态推进至 processing
    execute(
      "UPDATE risk_warnings SET related_order_id = ?, status = 'processing' WHERE id = ?",
      [orderId, warning.id],
    );
    recordAudit({
      userId: null,
      action: "create",
      target: `/dispatch/work-orders/${orderId}`,
      ip: null,
      detail: {
        auto: true,
        riskWarningId: warning.id,
        ruleId: p.ruleId ?? null,
        owner,
        riskSource,
      },
    });
    logger.info(
      { warningId: warning.id, orderId, owner, riskSource },
      "[dispatch] 自动派单完成",
    );
  });
  logger.info("调度指挥中心事件消费者已注册");
}
