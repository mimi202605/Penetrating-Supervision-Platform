// AI 智能体 - 文本比对（Task 19.3）
// 本地实现 cosine 相似度（词频向量）+ LCS diff（动态规划），不需要 LLM 也能跑
// 可选 LLM 增强：若 isAIConfigured，调 callLLM 分析差异并补充说明
// 但 similarity 与 diff 始终用本地计算结果
import { sanitizeForAI } from "../sanitizer.js";
import { getEnabledPolicies } from "../sanitizer-policies.js";
import { callLLM, isAIConfigured } from "../llm-adapter.js";
import { logAICall, truncate } from "../ai-logs.js";
import type { AgentUser } from "./info-extract.js";

export interface TextCompareInput {
  textA: string;
  textB: string;
  mode?: "cosine" | "diff" | "both"; // 默认 both
}

export interface DiffSegment {
  type: "add" | "del" | "eq";
  text: string;
}

export interface TextCompareOutput {
  similarity: number; // 0-1 cosine 相似度
  diff: DiffSegment[]; // LCS diff 片段
  configured: boolean;
  message?: string;
}

const ENDPOINT = "/ai/agents/text-compare/invoke";

/** 分词：ASCII 字母数字连成一个 token，中文逐字成 token（中文无空格分词，逐字以保证相似度可比） */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fa5]/g) ?? [];
}

/** 词频向量 */
function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

/** cosine 相似度：词频向量点积 / (|a| * |b|) */
function cosineSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const va = termFrequency(ta);
  const vb = termFrequency(tb);
  let dot = 0;
  for (const [k, v] of va) {
    const w = vb.get(k);
    if (w) dot += v * w;
  }
  let normA = 0;
  for (const v of va.values()) normA += v * v;
  let normB = 0;
  for (const v of vb.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** LCS diff：标准动态规划（以字符为粒度，对中文友好），返回合并后的差异片段序列 */
function lcsDiff(a: string, b: string): DiffSegment[] {
  const aChars = Array.from(a);
  const bChars = Array.from(b);
  const m = aChars.length;
  const n = bChars.length;
  // dp[i][j] = aChars[0..i) 与 bChars[0..j) 的 LCS 长度
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aChars[i - 1] === bChars[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  // 回溯生成 diff 序列（倒序收集后翻转）
  const reversed: DiffSegment[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aChars[i - 1] === bChars[j - 1]) {
      reversed.push({ type: "eq", text: aChars[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1]! >= dp[i - 1][j]!)) {
      reversed.push({ type: "add", text: bChars[j - 1]! });
      j--;
    } else {
      reversed.push({ type: "del", text: aChars[i - 1]! });
      i--;
    }
  }
  // 合并相邻同类型片段，输出可读 diff
  const segments: DiffSegment[] = [];
  for (let k = reversed.length - 1; k >= 0; k--) {
    const seg = reversed[k]!;
    const last = segments[segments.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      segments.push({ type: seg.type, text: seg.text });
    }
  }
  return segments;
}

/**
 * 文本比对：本地计算 cosine 相似度 + LCS diff，可选 LLM 增强差异说明
 */
export async function textCompare(
  input: TextCompareInput,
  user?: AgentUser,
): Promise<TextCompareOutput> {
  const startedAt = Date.now();
  // 入参脱敏
  const sanitized = sanitizeForAI(input, getEnabledPolicies(), {
    operator: user?.id ?? null,
    role: user?.role ?? null,
  }) as TextCompareInput;
  const safeA = sanitized.textA ?? input.textA;
  const safeB = sanitized.textB ?? input.textB;
  const mode = input.mode ?? "both";
  const inputSummary = `textA=${truncate(safeA, 100)}; textB=${truncate(safeB, 100)}; mode=${mode}`;

  // 本地计算 cosine 相似度
  const similarity =
    mode === "diff" ? 0 : Math.round(cosineSimilarity(safeA, safeB) * 1000) / 1000;
  // 本地计算 LCS diff
  const diff = mode === "cosine" ? [] : lcsDiff(safeA, safeB);

  let outputSummary = `similarity=${similarity}; diff_segments=${diff.length}`;
  let message: string | undefined;
  let token = 0;

  // 可选 LLM 增强：若已配置，让 LLM 分析差异并补充说明（similarity 与 diff 仍用本地结果）
  if (isAIConfigured()) {
    const llm = await callLLM(
      `请简要分析以下两段文本的差异要点（cosine 相似度 ${similarity}），指出关键不同：\n文本A：${safeA}\n文本B：${safeB}`,
    );
    if (llm.ok) {
      message = llm.content ?? undefined;
      token = (llm.usage?.completion_tokens ?? 0) + (llm.usage?.prompt_tokens ?? 0);
      if (message) outputSummary = truncate(message, 500);
    }
  }

  const latencyMs = Date.now() - startedAt;
  logAICall({
    userId: user?.id ?? null,
    endpoint: ENDPOINT,
    inputSummary,
    outputSummary,
    latencyMs,
    token,
  });

  return {
    similarity,
    diff,
    configured: isAIConfigured(),
    message,
  };
}
