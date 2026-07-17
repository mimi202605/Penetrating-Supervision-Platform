// 风险模块事件监听器：将监管模型命中转为风险线索并自动派单
// 订阅：
//   1. monitoring.rule.hit → 自动写 risk_clues（status='pending'）+ emit 'risk.clue.created'
//   2. risk.clue.created → 自动派单（按 org_code + scene_id 路由到对应岗位）
//   3. risk.clue.overdue → T+5 超期通报（写 audit_logs + 推送 dispatch 大屏）
// 供 main.ts 启动时调用
import { queryOne } from "../../db/index.js";
import { eventBus } from "../platform/eventbus.js";
import { recordAudit } from "../platform/audit.js";
import { logger } from "../../utils/logger.js";
import { createClue, dispatchClue, type RiskLevel } from "./clues.js";

/** monitoring.rule.hit 事件 payload（与 models.ts evaluateModelForRun emit 对齐） */
interface RuleHitPayload {
  modelId?: string;
  runId?: string;
  riskLevel?: string;
  evidence?: Record<string, unknown>;
  event?: { type: string; params?: Record<string, unknown> };
  sceneId?: string;
}

/** risk.clue.created 事件 payload（与 clues.ts createClue emit 对齐） */
interface ClueCreatedPayload {
  clueId?: string;
  sceneId?: string;
  modelId?: string;
  riskLevel?: string;
  orgCode?: string | null;
  dueAt?: string;
}

/** risk.clue.overdue 事件 payload */
interface OverduePayload {
  clueId?: string;
  dueAt?: string;
}

/** 按 scene_id + org_code 路由到岗位责任人（fallback：集团监管员） */
function pickOwner(sceneId: string | undefined, orgCode: string | null | undefined): string {
  // 当前未灌入 regulatory_positions，按 scene_id 推断占位 owner
  // 后续 Task 23.1 灌入 positions 后可改为查 position_model_grant
  if (orgCode) return `dispatcher-${orgCode}`;
  if (sceneId) return `dispatcher-${sceneId}`;
  return "dispatcher-default";
}

/** 从 evidence + event 推断风险等级（按 model threshold_json） */
function resolveRiskLevel(payload: RuleHitPayload): RiskLevel {
  const level = (payload.event?.params?.level as string) || payload.riskLevel || "yellow";
  if (level === "red" || level === "orange") return level as RiskLevel;
  return "yellow";
}

/** 从 evidence 推断 entity */
function deriveEntity(evidence: Record<string, unknown> | undefined): { type: string | null; id: string | null; orgCode: string | null; description: string | null } {
  if (!evidence) return { type: null, id: null, orgCode: null, description: null };
  const orgCode = (evidence.orgCode as string) || (evidence.org_code as string) || null;
  const entityId =
    (evidence.entityId as string) ||
    (evidence.paymentId as string) ||
    (evidence.contractId as string) ||
    (evidence.id as string) ||
    null;
  const entityType = entityId
    ? (evidence.entityType as string) ||
      (evidence.paymentId ? "payment" : evidence.contractId ? "contract" : "entity")
    : null;
  const description = (evidence.title as string) || (evidence.description as string) || null;
  return { type: entityType, id: entityId, orgCode, description };
}

/** 注册风险模块事件监听器 */
export function registerRiskListeners(): void {
  // 1. monitoring.rule.hit → 自动写 risk_clues
  eventBus.on("monitoring.rule.hit", (payload: unknown) => {
    try {
      const p = (payload as RuleHitPayload | undefined) ?? {};
      if (!p.modelId) {
        logger.warn({ payload }, "[risk] monitoring.rule.hit 缺少 modelId，跳过");
        return;
      }
      // 查模型关联的 sceneId（若 payload 未带）
      let sceneId = p.sceneId;
      if (!sceneId) {
        const m = queryOne<{ scene_id: string }>(
          "SELECT scene_id FROM regulatory_models WHERE id = ?",
          [p.modelId],
        );
        sceneId = m?.scene_id;
      }
      if (!sceneId) {
        logger.warn({ modelId: p.modelId }, "[risk] 模型未关联 scene，跳过线索创建");
        return;
      }
      const riskLevel = resolveRiskLevel(p);
      const entity = deriveEntity(p.evidence);
      const clue = createClue({
        sceneId,
        modelId: p.modelId,
        entityType: entity.type || undefined,
        entityId: entity.id || undefined,
        riskLevel,
        riskValue: p.evidence ? JSON.stringify(p.evidence).slice(0, 200) : undefined,
        description: entity.description || `模型 ${p.modelId} 命中`,
        orgCode: entity.orgCode || undefined,
        evidenceJson: p.evidence ?? null,
        detectedAt: undefined,
      });
      logger.info(
        { clueId: clue.id, modelId: p.modelId, sceneId, riskLevel },
        "[risk] 监管模型命中 → 风险线索已入库",
      );
    } catch (err) {
      logger.error(
        { err: (err as Error).message, payload },
        "[risk] monitoring.rule.hit 处理失败",
      );
    }
  });

  // 2. risk.clue.created → 自动派单
  eventBus.on("risk.clue.created", (payload: unknown) => {
    try {
      const p = (payload as ClueCreatedPayload | undefined) ?? {};
      if (!p.clueId) {
        logger.warn({ payload }, "[risk] risk.clue.created 缺少 clueId，跳过自动派单");
        return;
      }
      // 仅对 red/orange 自动派单，yellow 留待人工认领（避免低优线索淹没派单池）
      if (p.riskLevel === "yellow") {
        logger.debug({ clueId: p.clueId, riskLevel: p.riskLevel }, "[risk] yellow 级线索暂不自动派单，等待人工认领");
        return;
      }
      const owner = pickOwner(p.sceneId, p.orgCode);
      const result = dispatchClue(p.clueId, owner, null);
      recordAudit({
        userId: null,
        action: "auto-dispatch",
        target: `/risk/clues/${p.clueId}/dispatch`,
        ip: null,
        detail: { auto: true, clueId: p.clueId, orderId: result.orderId, owner: result.owner },
      });
      logger.info({ clueId: p.clueId, orderId: result.orderId }, "[risk] 自动派单完成");
    } catch (err) {
      logger.error(
        { err: (err as Error).message, payload },
        "[risk] risk.clue.created 自动派单失败",
      );
    }
  });

  // 3. risk.clue.overdue → T+5 超期通报
  eventBus.on("risk.clue.overdue", (payload: unknown) => {
    try {
      const p = (payload as OverduePayload | undefined) ?? {};
      if (!p.clueId) {
        logger.warn({ payload }, "[risk] risk.clue.overdue 缺少 clueId");
        return;
      }
      recordAudit({
        userId: null,
        action: "t5-overdue",
        target: `/risk/clues/${p.clueId}`,
        ip: null,
        detail: { clueId: p.clueId, dueAt: p.dueAt, message: "T+5 超期未处置" },
      });
      logger.warn({ clueId: p.clueId, dueAt: p.dueAt }, "[risk] T+5 超期通报已写审计");
    } catch (err) {
      logger.error(
        { err: (err as Error).message, payload },
        "[risk] risk.clue.overdue 处理失败",
      );
    }
  });

  // 4. risk.clue.closed → 规则反哺（占位：仅日志，未来可触发规则权重调整）
  eventBus.on("risk.clue.closed", (payload: unknown) => {
    const p = (payload as { clueId?: string; orderId?: string | null } | undefined) ?? {};
    logger.info({ clueId: p.clueId, orderId: p.orderId }, "[risk] 线索已关闭，触发规则反哺（占位）");
  });

  logger.info("风险模块事件监听器已注册");
}
