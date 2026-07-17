// AI 智能体 - 风险报告生成（Task 19.4）
// 数据流：从 DB 查 risk_clues → 组装 payload → sanitizeForAI 脱敏 → callLLM 生成 markdown
// 未配/失败返回模板拼接报告（含"一、风险概述/二、影响分析/三、处置建议/四、跟进计划"四节）
import { queryAll } from "../../../db/index.js";
import { camelize } from "../../../utils/case.js";
import { sanitizeForAI } from "../sanitizer.js";
import { getEnabledPolicies } from "../sanitizer-policies.js";
import { callLLM, isAIConfigured } from "../llm-adapter.js";
import { logAICall, truncate } from "../ai-logs.js";
import type { AgentUser } from "./info-extract.js";

export interface ReportGenerateInput {
  clueIds: string[]; // 必填，至少 1 个
  template?: string; // 报告模板（默认 "standard"）
  sceneId?: string;
}

export interface ReportGenerateOutput {
  report: string; // markdown
  clueCount: number;
  configured: boolean;
  message?: string;
}

const ENDPOINT = "/ai/agents/report-generate/invoke";

/** risk_clues 数据库行（snake_case） */
interface RiskClueRow {
  id: string;
  scene_id: string;
  model_id: string;
  entity_type: string | null;
  entity_id: string | null;
  risk_level: string | null;
  risk_value: string | null;
  description: string | null;
  status: string | null;
  detected_at: string | null;
  due_at: string | null;
  assigned_to: string | null;
  org_code: string | null;
  evidence_json: string | null;
  work_order_id: string | null;
}

/** 从 DB 查询指定 clueIds 的风险线索（IN 占位符防注入） */
function fetchClues(clueIds: string[]): RiskClueRow[] {
  if (clueIds.length === 0) return [];
  const placeholders = clueIds.map(() => "?").join(",");
  return queryAll<RiskClueRow>(
    `SELECT * FROM risk_clues WHERE id IN (${placeholders})`,
    clueIds,
  );
}

/** 拼接占位模板报告（含四节，每条线索列出 riskLevel/description/orgCode/detectedAt） */
function buildPlaceholderReport(clues: RiskClueRow[]): string {
  const lines: string[] = [];
  lines.push("（占位）风险线索处置报告");
  lines.push("");
  lines.push(`共纳入 ${clues.length} 条风险线索。`);
  lines.push("");
  lines.push("一、风险概述");
  for (const c of clues) {
    lines.push(
      `- ${c.id}：${c.description ?? "（无描述）"}（${c.risk_level ?? "未知"}级，机构 ${c.org_code ?? "-"}，触发 ${c.detected_at ?? "-"}）`,
    );
  }
  lines.push("");
  lines.push("二、影响分析");
  for (const c of clues) {
    lines.push(
      `- ${c.id}：风险值 ${c.risk_value ?? "-"}，实体 ${c.entity_type ?? "-"}:${c.entity_id ?? "-"}，需结合上下游核查影响范围。`,
    );
  }
  lines.push("");
  lines.push("三、处置建议");
  lines.push("1. 立即核查关联账户与交易对手；");
  lines.push("2. 暂停后续资金流出，必要时冻结相关账户；");
  lines.push("3. 启动核查工单流转，明确责任人。");
  lines.push("");
  lines.push("四、跟进计划");
  lines.push("T+1 完成现场核查，T+3 出具整改方案，T+5 销警或转办。");
  return lines.join("\n");
}

/**
 * 风险报告生成：查线索 → 脱敏 → LLM 生成 markdown；未配/失败返回模板拼接报告
 * 全部 clueIds 查不到时返回 clueCount=0 + message（404 由路由层处理）
 */
export async function reportGenerate(
  input: ReportGenerateInput,
  user?: AgentUser,
): Promise<ReportGenerateOutput> {
  const startedAt = Date.now();
  const clueIds = input.clueIds ?? [];
  const clues = fetchClues(clueIds);
  const clueCount = clues.length;
  const template = input.template ?? "standard";

  // 组装 payload（驼峰化）→ 脱敏
  const payload = {
    template,
    sceneId: input.sceneId ?? null,
    clues: clues.map((c) => camelize(c)),
  };
  const sanitized = sanitizeForAI(payload, getEnabledPolicies(), {
    operator: user?.id ?? null,
    role: user?.role ?? null,
  });
  const inputSummary = `clueIds=${clueIds.join(",")}; clueCount=${clueCount}; template=${template}`;

  // 全部查不到：返回 clueCount=0 + message（404 由路由层处理）
  if (clueCount === 0) {
    const latencyMs = Date.now() - startedAt;
    logAICall({
      userId: user?.id ?? null,
      endpoint: ENDPOINT,
      inputSummary,
      outputSummary: "no_clues",
      latencyMs,
      token: 0,
    });
    return {
      report: "（占位）无可用风险线索，无法生成报告。",
      clueCount: 0,
      configured: isAIConfigured(),
      message: "未查询到任何风险线索",
    };
  }

  const llm = await callLLM(
    `请基于以下风险线索数据生成结构化处置报告（markdown，含"一、风险概述/二、影响分析/三、处置建议/四、跟进计划"四节）：\n${JSON.stringify(sanitized)}`,
  );
  const latencyMs = Date.now() - startedAt;

  if (llm.ok) {
    logAICall({
      userId: user?.id ?? null,
      endpoint: ENDPOINT,
      inputSummary,
      outputSummary: truncate(llm.content ?? "", 500),
      latencyMs,
      token: (llm.usage?.completion_tokens ?? 0) + (llm.usage?.prompt_tokens ?? 0),
    });
    return {
      report: llm.content ?? "",
      clueCount,
      configured: true,
    };
  }

  // 未配/失败：返回模板拼接报告
  logAICall({
    userId: user?.id ?? null,
    endpoint: ENDPOINT,
    inputSummary,
    outputSummary: "placeholder",
    latencyMs,
    token: 0,
  });
  return {
    report: buildPlaceholderReport(clues),
    clueCount,
    configured: false,
    message: isAIConfigured()
      ? `AI 调用失败：${llm.error ?? "未知错误"}`
      : "需配置 AI_API_BASE，当前返回模板报告",
  };
}
