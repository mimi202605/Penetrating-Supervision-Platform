// MySQL CDC 连接器（binlog 模拟）
// mock 模式：不真实订阅 binlog，按 id 范围增量拉取，checkpoint 记录 last_pk/binlog_file/position
import type { ConnectorSpec, StreamCatalog, ReadContext, TestResult } from "./types.js";
import type { ConnectorInstance } from "./registry.js";
import { cdcMysqlSpec } from "./catalog.js";

export class CdcMysqlConnector implements ConnectorInstance {
  readonly spec: ConnectorSpec = cdcMysqlSpec;

  async test(config: Record<string, unknown>): Promise<TestResult> {
    const t0 = Date.now();
    const host = String(config.host || "");
    if (!host) {
      return { status: "offline", latencyMs: Date.now() - t0, error: "host 必填" };
    }
    // mock SHOW MASTER STATUS
    return { status: "online", latencyMs: Math.min(Date.now() - t0 + 30, 3000) };
  }

  async discover(_config: Record<string, unknown>): Promise<StreamCatalog> {
    return {
      streams: [
        {
          name: "t_payment",
          fields: [
            { name: "id", type: "number", nullable: false },
            { name: "payer_account", type: "string", nullable: false },
            { name: "payee_account", type: "string", nullable: false },
            { name: "amount", type: "decimal", nullable: false },
            { name: "pay_time", type: "datetime", nullable: false },
          ],
          supportedModes: ["cdc"],
        },
      ],
    };
  }

  async *read(ctx: ReadContext): AsyncIterable<Record<string, unknown>> {
    const stream = ctx.stream;
    // CDC：从 checkpoint.last_pk 开始，按 id 范围增量拉取
    const lastPk = Number(ctx.checkpoint?.last_pk ?? 0);
    // mock：每次最多读 500 条
    const end = lastPk + 500;
    if (stream === "t_payment") {
      for (let i = lastPk + 1; i <= end; i++) {
        const hour = (i * 3) % 24;
        yield {
          id: i,
          payer_account: `622848${String(i % 10000).padStart(12, "0")}`,
          payee_account: `622848${String((i * 7) % 10000).padStart(12, "0")}`,
          amount: Math.round((Math.random() * 100000 + 100) * 100) / 100,
          // 部分非工作时间大额对私支付（命中 m-fin-private-pay-001 模型）
          pay_time: new Date(Date.now() - (end - i) * 60_000).toISOString().replace(/T\d{2}:/, `T${String(hour).padStart(2, "0")}:`),
        };
      }
    }
  }
}
