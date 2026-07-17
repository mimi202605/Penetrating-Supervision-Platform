// AI 智能体编排（Task 19.5）- LangGraph 等价状态图
// 首批预置 1 个工作流：contract-review = [info-extract, graph-build, report-generate]
// 每节点取上一节点 output 作为本节点 input（首个节点用 input 参数），调对应 agent 实现
// 任一节点抛错则后续节点 status="skipped"，最终 status="failed" 或 "partial"（若有节点成功）
// graph-build 暂未实现（implemented=false），返回 {nodes:[], edges:[]} 占位结构，status="success"
import { logAICall, truncate } from "../ai-logs.js";
import { infoExtract, type AgentUser, type InfoExtractInput } from "./info-extract.js";
import { textCompare, type TextCompareInput } from "./text-compare.js";
import { reportGenerate, type ReportGenerateInput } from "./report-generate.js";

export type WorkflowNodeStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface WorkflowNodeResult {
  node: string;
  status: WorkflowNodeStatus;
  output?: unknown;
  error?: string;
  latencyMs: number;
}

export interface OrchestrateInput {
  workflow: string; // 工作流名，如 "contract-review"
  input: Record<string, unknown>; // 工作流入参
}

export interface OrchestrateOutput {
  workflow: string;
  status: "success" | "failed" | "partial";
  nodes: WorkflowNodeResult[];
  finalOutput?: unknown;
  totalLatencyMs: number;
}

const ENDPOINT = "/ai/agents/orchestrate";

/** 工作流注册表：workflow 名 → 节点序列 */
const WORKFLOWS = new Map<string, string[]>([
  ["contract-review", ["info-extract", "graph-build", "report-generate"]],
]);

/** 列出全部工作流名 */
export function listWorkflows(): string[] {
  return Array.from(WORKFLOWS.keys());
}

/** 取工作流节点序列，未找到返回 null */
export function getWorkflow(name: string): string[] | null {
  return WORKFLOWS.get(name) ?? null;
}

/** 执行单个节点：根据节点 id 调对应 agent 实现，未实现节点抛错由上层捕获 */
async function runNode(
  node: string,
  input: unknown,
  user: AgentUser | undefined,
): Promise<unknown> {
  switch (node) {
    case "info-extract":
      return await infoExtract(input as InfoExtractInput, user);
    case "text-compare":
      return await textCompare(input as TextCompareInput, user);
    case "report-generate":
      return await reportGenerate(input as ReportGenerateInput, user);
    case "graph-build":
      // 暂未实现（implemented=false）：返回占位邻接表结构，status=success（占位输出不算失败）
      return { nodes: [], edges: [] };
    default:
      throw new Error(`节点未实现：${node}`);
  }
}

/**
 * 工作流编排：按节点序列顺序执行，链式传递 output→input
 * 工作流不存在返回 status="failed"；任一节点抛错后续跳过，整体为 "failed" 或 "partial"
 */
export async function orchestrate(
  input: OrchestrateInput,
  user?: AgentUser,
): Promise<OrchestrateOutput> {
  const startedAt = Date.now();
  const nodes = WORKFLOWS.get(input.workflow);

  // 工作流不存在
  if (!nodes) {
    const latencyMs = Date.now() - startedAt;
    logAICall({
      userId: user?.id ?? null,
      endpoint: ENDPOINT,
      inputSummary: `workflow=${input.workflow}`,
      outputSummary: "workflow_not_found",
      latencyMs,
      token: 0,
    });
    return {
      workflow: input.workflow,
      status: "failed",
      nodes: [],
      totalLatencyMs: latencyMs,
    };
  }

  const results: WorkflowNodeResult[] = [];
  let currentNodeInput: unknown = input.input;
  let hadSuccess = false;
  let failed = false;

  for (const node of nodes) {
    // 上游已失败：后续节点跳过
    if (failed) {
      results.push({ node, status: "skipped", latencyMs: 0 });
      continue;
    }
    const nodeStart = Date.now();
    try {
      const output = await runNode(node, currentNodeInput, user);
      results.push({
        node,
        status: "success",
        output,
        latencyMs: Date.now() - nodeStart,
      });
      currentNodeInput = output;
      hadSuccess = true;
    } catch (err) {
      results.push({
        node,
        status: "failed",
        error: (err as Error).message,
        latencyMs: Date.now() - nodeStart,
      });
      failed = true;
    }
  }

  const totalLatencyMs = Date.now() - startedAt;
  // finalOutput 取最后一个成功节点的 output
  const lastSuccess = [...results].reverse().find((r) => r.status === "success");
  const status: OrchestrateOutput["status"] = failed
    ? hadSuccess
      ? "partial"
      : "failed"
    : "success";

  logAICall({
    userId: user?.id ?? null,
    endpoint: ENDPOINT,
    inputSummary: `workflow=${input.workflow}; nodes=${nodes.join(",")}`,
    outputSummary: truncate(
      `status=${status}; nodes=${results.map((r) => `${r.node}:${r.status}`).join(",")}`,
      500,
    ),
    latencyMs: totalLatencyMs,
    token: 0,
  });

  return {
    workflow: input.workflow,
    status,
    nodes: results,
    finalOutput: lastSuccess?.output,
    totalLatencyMs,
  };
}
