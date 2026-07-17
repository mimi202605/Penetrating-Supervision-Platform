// SAP OData 连接器
// mock 模式：不真实调用 SAP Gateway，返回符合契约的占位数据
import type { ConnectorSpec, StreamCatalog, ReadContext, TestResult } from "./types.js";
import type { ConnectorInstance } from "./registry.js";
import { sapODataSpec } from "./catalog.js";

export class SapODataConnector implements ConnectorInstance {
  readonly spec: ConnectorSpec = sapODataSpec;

  async test(config: Record<string, unknown>): Promise<TestResult> {
    const t0 = Date.now();
    const endpoint = String(config.endpoint || "");
    const username = String(config.username || "");
    if (!endpoint || !username) {
      return { status: "offline", latencyMs: Date.now() - t0, error: "endpoint/username 必填" };
    }
    return { status: "online", latencyMs: Math.min(Date.now() - t0 + 80, 3000) };
  }

  async discover(_config: Record<string, unknown>): Promise<StreamCatalog> {
    return {
      streams: [
        {
          name: "MaterialSet",
          fields: [
            { name: "MaterialNumber", type: "string", nullable: false },
            { name: "Description", type: "string", nullable: true },
            { name: "MaterialGroup", type: "string", nullable: true },
            { name: "LastChangeDate", type: "datetime", nullable: false },
          ],
          supportedModes: ["full", "incremental"],
          incrementalField: "LastChangeDate",
        },
        {
          name: "SalesOrderSet",
          fields: [
            { name: "SalesOrderID", type: "string", nullable: false },
            { name: "CustomerID", type: "string", nullable: false },
            { name: "NetValue", type: "decimal", nullable: false },
            { name: "CreatedAt", type: "datetime", nullable: false },
          ],
          supportedModes: ["full", "incremental"],
          incrementalField: "CreatedAt",
        },
      ],
    };
  }

  async *read(ctx: ReadContext): AsyncIterable<Record<string, unknown>> {
    const stream = ctx.stream;
    const count = ctx.mode === "incremental" ? 20 : 100;
    const baseTs = (ctx.checkpoint?.LastChangeDate as string) || "2026-01-01T00:00:00";
    const baseMs = Date.parse(baseTs) || Date.now();
    for (let i = 0; i < count; i++) {
      const ts = new Date(baseMs + i * 60_000).toISOString();
      if (stream === "MaterialSet") {
        yield {
          MaterialNumber: `M${String(i + 1).padStart(8, "0")}`,
          Description: `物料 ${i + 1}`,
          MaterialGroup: `G${i % 5}`,
          LastChangeDate: ts,
        };
      } else if (stream === "SalesOrderSet") {
        yield {
          SalesOrderID: `SO${String(i + 1).padStart(8, "0")}`,
          CustomerID: `C${String(i + 1).padStart(6, "0")}`,
          NetValue: Math.round((1000 + i * 100) * 100) / 100,
          CreatedAt: ts,
        };
      }
    }
  }
}
