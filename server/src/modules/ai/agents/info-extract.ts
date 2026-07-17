// AI 智能体 - 信息抽取（Task 19.2）
// 数据流：sanitizeForAI 脱敏 → callLLM → 解析 JSON 输出
// 未配 LLM 或调用失败时返回结构化占位 {fields:{}, confidence:0, configured:false}
import { sanitizeForAI } from "../sanitizer.js";
import { getEnabledPolicies } from "../sanitizer-policies.js";
import { callLLM, isAIConfigured } from "../llm-adapter.js";
import { logAICall, truncate } from "../ai-logs.js";

/** 智能体调用用户上下文（脱敏审计用） */
export interface AgentUser {
  id?: string;
  role?: string;
}

export interface InfoExtractInput {
  text: string; // 必填
  fields?: string[]; // 期望抽取字段名
  sceneId?: string; // 场景上下文
}

export interface InfoExtractOutput {
  fields: Record<string, unknown>; // 抽取结果
  confidence: number; // 0-1
  configured: boolean; // LLM 是否已配
  message?: string;
}

const ENDPOINT = "/ai/agents/info-extract/invoke";

/**
 * 尽力解析 LLM 返回的 JSON 对象：去除 markdown 代码围栏，失败时尝试提取首个 {...} 子串
 * 解析失败返回 null
 */
function tryParseJSONObject(content: string): Record<string, unknown> | null {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const v = JSON.parse(cleaned) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  } catch {
    // 尝试提取首个 {...} 子串再解析
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const v = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          return v as Record<string, unknown>;
        }
      } catch {
        // 忽略
      }
    }
    return null;
  }
}

/**
 * 信息抽取：脱敏 → 调 LLM 抽取字段 → 解析 JSON 输出
 * 未配/失败返回占位 {fields:{}, confidence:0, configured:false, message}
 */
export async function infoExtract(
  input: InfoExtractInput,
  user?: AgentUser,
): Promise<InfoExtractOutput> {
  const startedAt = Date.now();
  // 入参脱敏（业务数据进 LLM 前必经 sanitizeForAI）
  const sanitized = sanitizeForAI(input, getEnabledPolicies(), {
    operator: user?.id ?? null,
    role: user?.role ?? null,
  }) as InfoExtractInput;
  const safeText = sanitized.text ?? input.text;
  const fields = sanitized.fields ?? input.fields ?? [];
  const inputSummary = `text=${truncate(safeText, 200)}; fields=${fields.join(",")}`;

  const prompt = `请从以下文本抽取字段，并以 JSON 对象返回（键为字段名，值为抽取值）。\n期望字段：${fields.length ? fields.join("、") : "（自动识别关键信息）"}\n场景：${input.sceneId ?? "通用"}\n文本：\n${safeText}\n\n仅输出 JSON 对象，不要多余说明。`;

  const llm = await callLLM(prompt);
  const latencyMs = Date.now() - startedAt;

  if (llm.ok) {
    const parsed = tryParseJSONObject(llm.content ?? "");
    logAICall({
      userId: user?.id ?? null,
      endpoint: ENDPOINT,
      inputSummary,
      outputSummary: truncate(parsed ? JSON.stringify(parsed) : (llm.content ?? ""), 500),
      latencyMs,
      token: (llm.usage?.completion_tokens ?? 0) + (llm.usage?.prompt_tokens ?? 0),
    });
    if (parsed) {
      return { fields: parsed, confidence: 0.85, configured: true };
    }
    // LLM 返回非 JSON：原样回退到 fields.raw
    return {
      fields: { raw: llm.content ?? "" },
      confidence: 0.3,
      configured: true,
    };
  }

  // 未配置或失败：返回占位
  logAICall({
    userId: user?.id ?? null,
    endpoint: ENDPOINT,
    inputSummary,
    outputSummary: "placeholder",
    latencyMs,
    token: 0,
  });
  return {
    fields: {},
    confidence: 0,
    configured: false,
    message: isAIConfigured()
      ? `AI 调用失败：${llm.error ?? "未知错误"}`
      : "需配置 AI_API_BASE，当前返回占位响应",
  };
}
