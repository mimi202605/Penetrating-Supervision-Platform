// 连接器 registry：SeaTunnel Source 等价抽象 + Airbyte Connector Catalog 等价
// 每个连接器声明 spec（JsonSchema）+ capabilities + secretFields，前端按 spec 动态渲染表单
import type { ConnectorSpec } from "./types.js";

// 连接器实例接口（实现 test/discover/read）
export type { ConnectorSpec, StreamCatalog, StreamField, ReadContext, TestResult } from "./types.js";
export { isSecretField } from "./types.js";

import { NotImplementedConnector } from "./base.js";

// 连接器实例注册表
export interface ConnectorInstance {
  readonly spec: ConnectorSpec;
  test(config: Record<string, unknown>): Promise<import("./types.ts").TestResult>;
  discover(config: Record<string, unknown>): Promise<import("./types.ts").StreamCatalog>;
  read(ctx: import("./types.ts").ReadContext): AsyncIterable<Record<string, unknown>>;
}

const REGISTRY = new Map<string, ConnectorInstance>();

/** 注册连接器实例 */
export function registerConnector(instance: ConnectorInstance): void {
  const type = instance.spec.type;
  if (REGISTRY.has(type)) {
    throw new Error(`连接器已注册: ${type}`);
  }
  REGISTRY.set(type, instance);
}

/** 占位注册（仅 spec 元数据，test/discover/read 抛 NOT_IMPLEMENTED） */
export function registerPlaceholder(spec: ConnectorSpec): void {
  registerConnector(new NotImplementedConnector(spec));
}

/** 获取连接器实例 */
export function getConnector(type: string): ConnectorInstance {
  const inst = REGISTRY.get(type);
  if (!inst) {
    throw new Error(`未知连接器类型: ${type}`);
  }
  return inst;
}

/** 列出全部连接器 spec（按 category 分组） */
export function listConnectors(): ConnectorSpec[] {
  return Array.from(REGISTRY.values()).map((i) => i.spec);
}

/** 按分类列出 */
export function listConnectorsByCategory(): Record<string, ConnectorSpec[]> {
  const out: Record<string, ConnectorSpec[]> = {};
  for (const inst of REGISTRY.values()) {
    const cat = inst.spec.category;
    if (!out[cat]) out[cat] = [];
    out[cat].push(inst.spec);
  }
  return out;
}
