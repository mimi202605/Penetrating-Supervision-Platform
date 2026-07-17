// 司库系统连接器（REST mock）
// 模拟司库 REST API：payment_flow / account_balance / bill_info / guarantee_info
import type { ConnectorSpec, StreamCatalog, ReadContext, TestResult } from "./types.js";
import type { ConnectorInstance } from "./registry.js";
import { treasurySysSpec } from "./catalog.js";

export class TreasurySysConnector implements ConnectorInstance {
  readonly spec: ConnectorSpec = treasurySysSpec;

  async test(config: Record<string, unknown>): Promise<TestResult> {
    const t0 = Date.now();
    const endpoint = String(config.endpoint || "");
    const token = String(config.token || "");
    if (!endpoint || !token) {
      return { status: "offline", latencyMs: Date.now() - t0, error: "endpoint/token 必填" };
    }
    // mock GET /health
    return { status: "online", latencyMs: Math.min(Date.now() - t0 + 40, 3000) };
  }

  async discover(_config: Record<string, unknown>): Promise<StreamCatalog> {
    return {
      streams: [
        {
          name: "payment_flow",
          fields: [
            { name: "flowId", type: "string", nullable: false },
            { name: "payerOrgCode", type: "string", nullable: false },
            { name: "payeeAccount", type: "string", nullable: false },
            { name: "amount", type: "decimal", nullable: false },
            { name: "payTime", type: "datetime", nullable: false },
            { name: "payeeType", type: "string", nullable: false }, // 对公/对私
          ],
          supportedModes: ["full", "incremental"],
          incrementalField: "payTime",
        },
        {
          name: "account_balance",
          fields: [
            { name: "accountId", type: "string", nullable: false },
            { name: "orgCode", type: "string", nullable: false },
            { name: "balance", type: "decimal", nullable: false },
            { name: "asOfDate", type: "date", nullable: false },
          ],
          supportedModes: ["full"],
        },
        {
          name: "guarantee_info",
          fields: [
            { name: "guaranteeId", type: "string", nullable: false },
            { name: "guarantorOrgCode", type: "string", nullable: false },
            { name: "beneficiaryOrgCode", type: "string", nullable: false },
            { name: "amount", type: "decimal", nullable: false },
            { name: "guarantorShareRatio", type: "decimal", nullable: false },
            { name: "createdAt", type: "datetime", nullable: false },
          ],
          supportedModes: ["full", "incremental"],
          incrementalField: "createdAt",
        },
        {
          name: "bill_info",
          fields: [
            { name: "billId", type: "string", nullable: false },
            { name: "orgCode", type: "string", nullable: false },
            { name: "amount", type: "decimal", nullable: false },
            { name: "dueDate", type: "date", nullable: false },
          ],
          supportedModes: ["full", "incremental"],
          incrementalField: "dueDate",
        },
      ],
    };
  }

  async *read(ctx: ReadContext): AsyncIterable<Record<string, unknown>> {
    const stream = ctx.stream;
    const baseMs = Date.now();
    if (stream === "payment_flow") {
      // 生成 200 条支付流水，其中含重复支付、非工作时间大额对私样本
      for (let i = 0; i < 200; i++) {
        const hour = i < 20 ? 23 : 10; // 前 20 条为非工作时间
        const payeeType = i % 5 === 0 ? "对私" : "对公";
        const amount = i < 20 ? 80000 + i * 1000 : 1000 + i * 50;
        // 重复支付：每 10 条出现一次同收款方同金额
        const dupFlag = i % 10 === 0 && i > 0 ? i - 1 : i;
        yield {
          flowId: `PF${String(i + 1).padStart(8, "0")}`,
          payerOrgCode: `ORG${String(i % 10).padStart(3, "0")}`,
          payeeAccount: `622848${String(dupFlag % 10000).padStart(12, "0")}`,
          amount: Math.round(amount * 100) / 100,
          payTime: new Date(baseMs - i * 60_000).toISOString().replace(/T\d{2}:/, `T${String(hour).padStart(2, "0")}:`),
          payeeType,
        };
      }
    } else if (stream === "guarantee_info") {
      // 生成 50 条担保，部分超股比
      for (let i = 0; i < 50; i++) {
        const ratio = i % 3 === 0 ? 2.5 : 0.5; // 每 3 条有 1 条超股比
        yield {
          guaranteeId: `G${String(i + 1).padStart(6, "0")}`,
          guarantorOrgCode: `ORG${String(i % 5).padStart(3, "0")}`,
          beneficiaryOrgCode: `ORG${String(i % 7).padStart(3, "0")}`,
          amount: Math.round((1_000_000 + i * 10000) * 100) / 100,
          guarantorShareRatio: ratio,
          createdAt: new Date(baseMs - i * 3600_000).toISOString(),
        };
      }
    } else if (stream === "bill_info") {
      // 生成 30 条票据，部分即将到期
      for (let i = 0; i < 30; i++) {
        const dueOffsetDays = i % 4 === 0 ? 5 : 60; // 每 4 条有 1 条 5 天内到期
        yield {
          billId: `B${String(i + 1).padStart(6, "0")}`,
          orgCode: `ORG${String(i % 5).padStart(3, "0")}`,
          amount: Math.round((500_000 + i * 5000) * 100) / 100,
          dueDate: new Date(baseMs + dueOffsetDays * 86400_000).toISOString().slice(0, 10),
        };
      }
    } else if (stream === "account_balance") {
      for (let i = 0; i < 20; i++) {
        yield {
          accountId: `ACC${String(i + 1).padStart(6, "0")}`,
          orgCode: `ORG${String(i % 5).padStart(3, "0")}`,
          balance: Math.round((1_000_000 + i * 100000) * 100) / 100,
          asOfDate: new Date(baseMs).toISOString().slice(0, 10),
        };
      }
    }
  }
}
