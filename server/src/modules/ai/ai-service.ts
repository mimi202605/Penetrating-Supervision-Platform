// 人工智能与数据脱敏 - AI 应用服务
// naturalLanguageQuery / contractReview / generateRiskReport
// 数据流约束：任何业务数据传入 LLM 前必须先经 sanitizeForAI 脱敏
import { queryOne } from "../../db/index.js";
import { sanitizeForAI } from "./sanitizer.js";
import { getEnabledPolicies } from "./sanitizer-policies.js";
import { callLLM, isAIConfigured } from "./llm-adapter.js";
import { logAICall, truncate } from "./ai-logs.js";
import type { JwtUser } from "../platform/auth.js";

/** 风险预警行（用于报告生成） */
interface RiskWarningRow {
  id: string;
  title: string;
  domain: string | null;
  level: string;
  subject: string | null;
  rule: string | null;
  triggered_at: string | null;
  status: string;
  clue: string | null;
  raw_json: string | null;
}

/** 提取用户上下文用于脱敏与审计 */
function userContext(user: JwtUser | undefined): { id: string | null; role: string | null } {
  return {
    id: user?.id ?? null,
    role: user?.role ?? null,
  };
}

/** 对载荷脱敏并返回结果 */
function sanitizePayload(payload: unknown, user: JwtUser | undefined) {
  const ctx = userContext(user);
  return sanitizeForAI(payload, getEnabledPolicies(), {
    operator: ctx.id,
    role: ctx.role,
  });
}

/**
 * 自然语言穿透查询：先脱敏 → 调用 LLM → 记录
 * 未配置 AI 时返回结构化占位（含解析意图、建议 SQL/图查询模板、提示需配置 AI 端点）
 */
export async function naturalLanguageQuery(
  query: string,
  user?: JwtUser,
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const sanitized = sanitizePayload({ query }, user) as { query?: string };
  const safeQuery = sanitized.query ?? query;
  const inputSummary = `query=${truncate(safeQuery, 200)}`;

  const llm = await callLLM(`作为穿透式监管平台的智能助手，请解析以下自然语言查询并给出查询建议：\n${safeQuery}`);
  const latencyMs = Date.now() - startedAt;

  if (llm.ok) {
    logAICall({
      userId: user?.id ?? null,
      endpoint: "/ai/query",
      inputSummary,
      outputSummary: truncate(llm.content ?? "", 500),
      latencyMs,
      token: (llm.usage?.completion_tokens ?? 0) + (llm.usage?.prompt_tokens ?? 0),
    });
    return {
      understood: true,
      intent: "penetration_query",
      answer: llm.content,
      usage: llm.usage,
      configured: true,
    };
  }

  // 未配置或失败：返回结构化占位
  logAICall({
    userId: user?.id ?? null,
    endpoint: "/ai/query",
    inputSummary,
    outputSummary: "placeholder",
    latencyMs,
    token: 0,
  });
  return {
    understood: true,
    intent: "penetration_query",
    suggestedSql: `SELECT * FROM transactions t JOIN accounts a ON t.account_id = a.id WHERE a.org_id IN (SELECT id FROM organizations WHERE name LIKE '%${truncate(safeQuery, 30)}%')`,
    suggestedGraphQuery: `MATCH (o:org)-[:持有]->(a:account)-[:'资金流向']->(c:counterparty) WHERE o.name CONTAINS '${truncate(safeQuery, 30)}' RETURN o,a,c`,
    message: isAIConfigured()
      ? `AI 调用失败：${llm.error ?? "未知错误"}`
      : "需配置 AI_API_BASE，当前返回结构化占位响应",
    configured: false,
  };
}

/**
 * 合同违规条款审查：脱敏 → LLM。占位返回模板审查结果
 */
export async function contractReview(
  contractText: string,
  user?: JwtUser,
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const sanitized = sanitizePayload({ contractText }, user) as { contractText?: string };
  const safeText = sanitized.contractText ?? contractText;
  const inputSummary = `contractText=${truncate(safeText, 200)}`;

  const llm = await callLLM(`请审查以下合同条款是否存在违规风险（如关联交易、超额担保、越权审批、虚假贸易等）：\n${safeText}`);
  const latencyMs = Date.now() - startedAt;

  if (llm.ok) {
    logAICall({
      userId: user?.id ?? null,
      endpoint: "/ai/contract-review",
      inputSummary,
      outputSummary: truncate(llm.content ?? "", 500),
      latencyMs,
      token: (llm.usage?.completion_tokens ?? 0) + (llm.usage?.prompt_tokens ?? 0),
    });
    return { review: llm.content, usage: llm.usage, configured: true };
  }

  logAICall({
    userId: user?.id ?? null,
    endpoint: "/ai/contract-review",
    inputSummary,
    outputSummary: "placeholder",
    latencyMs,
    token: 0,
  });
  return {
    review: "（占位）合同审查报告：未发现明显违规条款，建议人工复核关联交易审批与金额阈值。",
    findings: [
      { type: "关联交易", risk: "low", desc: "未检测到显式关联方条款，需结合对手方图谱核查" },
      { type: "金额阈值", risk: "medium", desc: "建议核验是否超出授权审批层级" },
    ],
    message: isAIConfigured()
      ? `AI 调用失败：${llm.error ?? "未知错误"}`
      : "需配置 AI_API_BASE，当前返回模板审查结果",
    configured: false,
  };
}

/**
 * 风险处置报告自动生成：从 DB 取风险详情 → 脱敏 → LLM。占位返回模板报告
 */
export async function generateRiskReport(
  riskWarningId: string,
  user?: JwtUser,
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const row = queryOne<RiskWarningRow>(
    "SELECT id, title, domain, level, subject, rule, triggered_at, status, clue, raw_json FROM risk_warnings WHERE id = ?",
    [riskWarningId],
  );
  if (!row) {
    return { error: "not_found", message: "风险预警不存在" };
  }
  // 业务数据进 LLM 前先脱敏
  const payload = {
    title: row.title,
    domain: row.domain,
    level: row.level,
    subject: row.subject,
    rule: row.rule,
    triggeredAt: row.triggered_at,
    clue: row.clue,
    raw: row.raw_json,
  };
  const sanitized = sanitizePayload(payload, user) as Record<string, unknown>;
  const inputSummary = `riskWarningId=${riskWarningId}; title=${truncate(row.title, 100)}`;

  const llm = await callLLM(
    `请基于以下风险预警信息生成结构化处置报告（含风险概述、影响分析、处置建议、跟进计划）：\n${JSON.stringify(sanitized)}`,
  );
  const latencyMs = Date.now() - startedAt;

  if (llm.ok) {
    logAICall({
      userId: user?.id ?? null,
      endpoint: "/ai/risk-report",
      inputSummary,
      outputSummary: truncate(llm.content ?? "", 500),
      latencyMs,
      token: (llm.usage?.completion_tokens ?? 0) + (llm.usage?.prompt_tokens ?? 0),
    });
    return { report: llm.content, usage: llm.usage, configured: true };
  }

  logAICall({
    userId: user?.id ?? null,
    endpoint: "/ai/risk-report",
    inputSummary,
    outputSummary: "placeholder",
    latencyMs,
    token: 0,
  });
  return {
    report: `（占位）风险处置报告\n\n一、风险概述\n${row.title}（${row.domain}，${row.level}级），触发时间 ${row.triggered_at ?? ""}。\n\n二、影响分析\n${row.clue ?? ""}\n\n三、处置建议\n1. 立即核查关联账户与交易对手；\n2. 暂停后续资金流出；\n3. 启动核查工单流转。\n\n四、跟进计划\nT+1 完成现场核查，T+3 出具整改方案。`,
    riskWarningId: row.id,
    message: isAIConfigured()
      ? `AI 调用失败：${llm.error ?? "未知错误"}`
      : "需配置 AI_API_BASE，当前返回模板报告",
    configured: false,
  };
}
