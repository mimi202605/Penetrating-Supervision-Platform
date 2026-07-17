// Transform 试运行：输入样本 + pipeline，返回 TransformResult（不入库）
import { runTransformSync } from "./engine.js";
import type { TransformPipeline, TransformContext } from "./types.js";

export interface PreviewRequest {
  sample: Record<string, unknown>[];
  pipeline: TransformPipeline;
  ctx?: Partial<TransformContext>;
}

/** 试运行：同步返回输出 + 脏数据 + 证据，不写库 */
export async function runPreview(req: PreviewRequest) {
  const ctx: TransformContext = {
    taskId: req.ctx?.taskId || "preview",
    runId: `preview-${Date.now()}`,
    sceneId: req.ctx?.sceneId,
    modelId: req.ctx?.modelId,
    sourceId: req.ctx?.sourceId,
    streamName: req.ctx?.streamName,
    evidence: [],
  };
  return runTransformSync(req.sample, req.pipeline, ctx);
}
