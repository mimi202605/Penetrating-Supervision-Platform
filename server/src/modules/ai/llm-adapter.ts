// 人工智能与数据脱敏 - 可插拔 LLM 适配器（LangChain 等价）
// 若 config.AI_API_BASE 未配置：callLLM 返回占位 {ok:false, reason:'not_configured', placeholder:true}
// 若已配置：fetch(AI_API_BASE + '/chat/completions')，OpenAI 兼容格式，Bearer 鉴权
// 注：callLLM 内部不再脱敏，由 ai-service 在调用前 sanitizeForAI
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";

/** LLM 调用结果 */
export interface LLMResult {
  ok: boolean;
  /** 未配置时的占位标记 */
  placeholder?: boolean;
  /** 失败原因：not_configured / error */
  reason?: string;
  /** 成功时的内容 */
  content?: string;
  /** 成功时的 token 用量 */
  usage?: { prompt_tokens: number; completion_tokens: number };
  /** 失败时的错误信息 */
  error?: string;
}

/** AI 是否已配置（AI_API_BASE 非空） */
export function isAIConfigured(): boolean {
  return config.aiApiBase.trim() !== "";
}

/** 脱敏显示 endpoint（隐藏 host 后路径与 query，保留协议+host） */
function maskEndpoint(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    return `${u.protocol}//${u.host}/***`;
  } catch {
    return "***";
  }
}

/** AI 适配器健康状态 */
export function getAIHealth(): {
  configured: boolean;
  provider: string;
  endpoint: string;
  model: string;
} {
  return {
    configured: isAIConfigured(),
    provider: isAIConfigured() ? "openai-compatible" : "none",
    endpoint: isAIConfigured() ? maskEndpoint(config.aiApiBase) : "",
    model: config.aiModel,
  };
}

/**
 * 调用 LLM：OpenAI 兼容协议
 * 入参 prompt 必须由调用方先行脱敏（sanitizeForAI），此处不再脱敏
 */
export async function callLLM(prompt: string): Promise<LLMResult> {
  if (!isAIConfigured()) {
    return { ok: false, reason: "not_configured", placeholder: true };
  }
  const url = config.aiApiBase.replace(/\/$/, "") + "/chat/completions";
  const startedAt = Date.now();
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      logger.warn({ status: resp.status, text: text.slice(0, 200) }, "LLM 调用 HTTP 异常");
      return { ok: false, reason: "error", error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
    const latency = Date.now() - startedAt;
    logger.debug({ latency, tokens: usage.completion_tokens }, "LLM 调用完成");
    return { ok: true, content, usage };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "LLM 调用异常");
    return { ok: false, reason: "error", error: (err as Error).message };
  }
}
