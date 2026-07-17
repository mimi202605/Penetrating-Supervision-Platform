// 占位连接器基类：仅注册 spec 元数据，test/discover/read 抛 NOT_IMPLEMENTED
// 用于 14 个未实现的连接器（如 sap-bapi/sap-idoc/igix-rest/...）
import type { ConnectorSpec, StreamCatalog, ReadContext, TestResult } from "./types.js";
import type { ConnectorInstance } from "./registry.js";

export class NotImplementedConnector implements ConnectorInstance {
  readonly spec: ConnectorSpec;
  constructor(spec: ConnectorSpec) {
    this.spec = spec;
  }
  async test(_config: Record<string, unknown>): Promise<TestResult> {
    return {
      status: "offline",
      latencyMs: 0,
      error: `连接器 ${this.spec.type} 暂未实现（NOT_IMPLEMENTED）`,
    };
  }
  async discover(_config: Record<string, unknown>): Promise<StreamCatalog> {
    throw new Error(`连接器 ${this.spec.type} 的 discover 未实现`);
  }
  async *_read(_ctx: ReadContext): AsyncIterable<Record<string, unknown>> {
    throw new Error(`连接器 ${this.spec.type} 的 read 未实现`);
  }
  read(ctx: ReadContext): AsyncIterable<Record<string, unknown>> {
    return this._read(ctx);
  }
}
