// JDBC MySQL 连接器（基于 better-sqlite3 模拟，接口对齐 mysql2）
// mock 模式：连接器不真实连 MySQL，使用内存表生成测试数据
// 生产替换为 mysql2/promise
import type { ConnectorSpec, StreamCatalog, ReadContext, TestResult } from "./types.js";
import type { ConnectorInstance } from "./registry.js";
import { jdbcMysqlSpec } from "./catalog.js";

export class JdbcMysqlConnector implements ConnectorInstance {
  readonly spec: ConnectorSpec = jdbcMysqlSpec;

  async test(config: Record<string, unknown>): Promise<TestResult> {
    const t0 = Date.now();
    const host = String(config.host || "");
    const database = String(config.database || "");
    if (!host || !database) {
      return { status: "offline", latencyMs: Date.now() - t0, error: "host/database 必填" };
    }
    // mock SELECT 1
    return { status: "online", latencyMs: Math.min(Date.now() - t0 + 20, 3000) };
  }

  async discover(_config: Record<string, unknown>): Promise<StreamCatalog> {
    // mock information_schema
    return {
      streams: [
        {
          name: "t_account",
          fields: [
            { name: "id", type: "number", nullable: false },
            { name: "account_no", type: "string", nullable: false },
            { name: "balance", type: "decimal", nullable: false },
            { name: "updated_at", type: "datetime", nullable: false },
          ],
          supportedModes: ["full", "incremental"],
          incrementalField: "updated_at",
        },
        {
          name: "t_transaction",
          fields: [
            { name: "id", type: "number", nullable: false },
            { name: "account_id", type: "number", nullable: false },
            { name: "amount", type: "decimal", nullable: false },
            { name: "txn_ts", type: "datetime", nullable: false },
          ],
          supportedModes: ["full", "incremental"],
          incrementalField: "txn_ts",
        },
      ],
    };
  }

  async *read(ctx: ReadContext): AsyncIterable<Record<string, unknown>> {
    const stream = ctx.stream;
    // 按 split.range 切片（PK 范围）
    const range = ctx.split?.range as [number, number] | undefined;
    const start = range ? Number(range[0]) : 0;
    const end = range ? Number(range[1]) : 1000;
    if (stream === "t_account") {
      for (let i = start; i < end; i++) {
        yield {
          id: i,
          account_no: `622848${String(i).padStart(12, "0")}`,
          balance: Math.round((10000 + i * 100) * 100) / 100,
          updated_at: new Date(Date.now() - i * 60_000).toISOString(),
        };
      }
    } else if (stream === "t_transaction") {
      for (let i = start; i < end; i++) {
        yield {
          id: i,
          account_id: i % 100,
          amount: Math.round((Math.random() * 10000) * 100) / 100,
          txn_ts: new Date(Date.now() - i * 30_000).toISOString(),
        };
      }
    }
  }
}
