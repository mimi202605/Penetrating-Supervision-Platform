// 健康检查与 Prometheus 指标暴露（HertzBeat 等价）
import type { FastifyInstance, FastifyPluginCallback } from "fastify";

// ===================== 内存计数器 =====================
// 简易进程内计数器，供 /metrics 暴露（生产可替换 prom-client）
export const metrics = {
  httpRequestsTotal: 0,
  riskEvaluationsTotal: 0,
  workorderAdvanceTotal: 0,
  collectionRunsTotal: 0,
  collectionFailuresTotal: 0,
  aiCallsTotal: 0,
};

export function incHttp(): void {
  metrics.httpRequestsTotal += 1;
}
export function incRiskEvaluation(): void {
  metrics.riskEvaluationsTotal += 1;
}
export function incWorkorderAdvance(): void {
  metrics.workorderAdvanceTotal += 1;
}
export function incCollectionRun(): void {
  metrics.collectionRunsTotal += 1;
}
export function incCollectionFailure(): void {
  metrics.collectionFailuresTotal += 1;
}
export function incAiCall(): void {
  metrics.aiCallsTotal += 1;
}

const startedAt = Date.now();

/** 健康检查与指标路由插件：/health、/metrics（不在 /api/v1 前缀下，便于探活） */
export const registerHealthRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/health", async (_req, reply) => {
    reply.send({
      status: "ok",
      centers: {
        collection: "running",
        monitoring: "running",
        dispatch: "running",
      },
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  app.get("/metrics", async (_req, reply) => {
    const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
    const lines: string[] = [
      "# HELP http_requests_total HTTP 请求总数",
      "# TYPE http_requests_total counter",
      `http_requests_total ${metrics.httpRequestsTotal}`,
      "# HELP risk_evaluations_total 规则推理评估总数",
      "# TYPE risk_evaluations_total counter",
      `risk_evaluations_total ${metrics.riskEvaluationsTotal}`,
      "# HELP workorder_advance_total 工单流转总数",
      "# TYPE workorder_advance_total counter",
      `workorder_advance_total ${metrics.workorderAdvanceTotal}`,
      "# HELP collection_runs_total 采集任务执行总数",
      "# TYPE collection_runs_total counter",
      `collection_runs_total ${metrics.collectionRunsTotal}`,
      "# HELP collection_failures_total 采集失败总数",
      "# TYPE collection_failures_total counter",
      `collection_failures_total ${metrics.collectionFailuresTotal}`,
      "# HELP ai_calls_total AI 调用总数",
      "# TYPE ai_calls_total counter",
      `ai_calls_total ${metrics.aiCallsTotal}`,
      "# HELP process_uptime_seconds 进程运行时长",
      "# TYPE process_uptime_seconds gauge",
      `process_uptime_seconds ${uptimeSec}`,
    ];
    reply.type("text/plain; version=0.0.4; charset=utf-8").send(lines.join("\n") + "\n");
  });

  done();
};

/** 暴露给其他模块注册时使用的辅助（避免循环依赖时直接拿 app） */
export function bindHealthRoutes(app: FastifyInstance): void {
  app.register(registerHealthRoutes);
}
