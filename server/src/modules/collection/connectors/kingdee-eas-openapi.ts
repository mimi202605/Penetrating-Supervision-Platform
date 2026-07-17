// 金蝶 EAS Cloud OpenAPI 连接器
// mock 模式：不真实调用 EAS，返回符合契约的占位数据
// 生产替换为 fetch('/eas/v2/auth/login') + 真实分页
import type { ConnectorSpec, StreamCatalog, ReadContext, TestResult } from "./types.js";
import type { ConnectorInstance } from "./registry.js";
import { kingdeeEasOpenApiSpec } from "./catalog.js";

export class KingdeeEasOpenApiConnector implements ConnectorInstance {
  readonly spec: ConnectorSpec = kingdeeEasOpenApiSpec;

  async test(config: Record<string, unknown>): Promise<TestResult> {
    const t0 = Date.now();
    const endpoint = String(config.endpoint || "");
    const username = String(config.username || "");
    const password = String(config.password || "");
    if (!endpoint || !username || !password) {
      return { status: "offline", latencyMs: Date.now() - t0, error: "endpoint/username/password 必填" };
    }
    // mock：直接视为登录成功
    return { status: "online", latencyMs: Math.min(Date.now() - t0 + 50, 3000) };
  }

  async discover(_config: Record<string, unknown>): Promise<StreamCatalog> {
    return {
      streams: [
        {
          name: "customer",
          fields: [
            { name: "FNumber", type: "string", nullable: false },
            { name: "FName", type: "string", nullable: false },
            { name: "FTaxNumber", type: "string", nullable: true },
            { name: "FModifiedAt", type: "datetime", nullable: false },
          ],
          supportedModes: ["full", "incremental"],
          incrementalField: "FModifiedAt",
        },
        {
          name: "supplier",
          fields: [
            { name: "FNumber", type: "string", nullable: false },
            { name: "FName", type: "string", nullable: false },
            { name: "FBankAccount", type: "string", nullable: true },
            { name: "FModifiedAt", type: "datetime", nullable: false },
          ],
          supportedModes: ["full", "incremental"],
          incrementalField: "FModifiedAt",
        },
        {
          name: "material",
          fields: [
            { name: "FNumber", type: "string", nullable: false },
            { name: "FName", type: "string", nullable: false },
            { name: "FGroup", type: "string", nullable: true },
            { name: "FModifiedAt", type: "datetime", nullable: false },
          ],
          supportedModes: ["full", "incremental"],
          incrementalField: "FModifiedAt",
        },
        {
          name: "voucher",
          fields: [
            { name: "FVoucherNumber", type: "string", nullable: false },
            { name: "FBookedAt", type: "date", nullable: false },
            { name: "FEntry", type: "json", nullable: false },
            { name: "FModifiedAt", type: "datetime", nullable: false },
          ],
          supportedModes: ["full", "incremental"],
          incrementalField: "FModifiedAt",
        },
      ],
    };
  }

  async *read(ctx: ReadContext): AsyncIterable<Record<string, unknown>> {
    const stream = ctx.stream;
    const mode = ctx.mode;
    // mock：按 stream 生成 100 条占位记录
    const baseTs = (ctx.checkpoint?.lastModifiedAt as string) || "2026-01-01T00:00:00";
    const baseTsMs = Date.parse(baseTs) || Date.now();
    const count = mode === "incremental" ? 20 : 100;
    for (let i = 0; i < count; i++) {
      const ts = new Date(baseTsMs + i * 60_000).toISOString();
      if (stream === "customer" || stream === "supplier" || stream === "material") {
        yield {
          FNumber: `${stream.toUpperCase()}-${String(i + 1).padStart(4, "0")}`,
          FName: `${stream === "customer" ? "客户" : stream === "supplier" ? "供应商" : "物料"}-${i + 1}`,
          FModifiedAt: ts,
          ...(stream === "customer" ? { FTaxNumber: `91${String(i).padStart(15, "0")}` } : {}),
          ...(stream === "supplier" ? { FBankAccount: `622848${String(i).padStart(12, "0")}` } : {}),
          ...(stream === "material" ? { FGroup: `G${i % 5}` } : {}),
        };
      } else if (stream === "voucher") {
        // 金蝶凭证含嵌套 entry 数组，验证 flatten transform
        yield {
          FVoucherNumber: `V-${String(i + 1).padStart(6, "0")}`,
          FBookedAt: new Date(baseTsMs + i * 86_400_000).toISOString().slice(0, 10),
          FModifiedAt: ts,
          FEntry: [
            { FAccount: "1001", FDebit: 1000 + i, FCredit: 0 },
            { FAccount: "1002", FDebit: 0, FCredit: 1000 + i },
          ],
        };
      }
    }
  }
}
