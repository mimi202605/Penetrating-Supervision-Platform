// 连接器类型定义（spec 契约）
// 对齐 Airbyte Connector Catalog：JsonSchema spec + capabilities + secretFields

export type ConnectorCategory = "erp" | "db" | "file" | "mq" | "saas";
export type ConnectorCapability = "full" | "incremental" | "cdc" | "discover" | "schema-evolution";
export type ConnectorAuth = "basic" | "token" | "oauth2" | "cert" | "none";

/** 连接器规格（前端按 connectionSpec JsonSchema 动态渲染表单） */
export interface ConnectorSpec {
  type: string; // kingdee-eas-openapi / sap-bapi / jdbc-mysql / ...
  displayName: string;
  category: ConnectorCategory;
  capabilities: ConnectorCapability[];
  auth: ConnectorAuth;
  connectionSpec: object; // JsonSchema，含 properties.required/order/airbyte_secret
  secretFields: string[];
  icon?: string;
  version?: string;
}

/** 数据流字段定义 */
export interface StreamField {
  name: string;
  type: string; // string/number/boolean/date/datetime/decimal/json
  nullable: boolean;
}

/** 数据流目录（discover 返回） */
export interface StreamCatalog {
  streams: Array<{
    name: string; // salary_records / payment_flow / ...
    fields: StreamField[];
    supportedModes: Array<"full" | "incremental" | "cdc">;
    incrementalField?: string; // 增量水位线字段
  }>;
}

/** 读取上下文 */
export interface ReadContext {
  config: Record<string, unknown>;
  stream: string;
  mode: "full" | "incremental" | "cdc";
  checkpoint?: Record<string, unknown>; // 断点
  filter?: string;
  split?: { id: string; range: [unknown, unknown] }; // 分片范围
}

/** 测试连接结果 */
export interface TestResult {
  status: "online" | "offline" | "degraded";
  latencyMs: number;
  error?: string;
}

/** 判断字段是否为 secret（基于 spec.connectionSchema 的 airbyte_secret 标记） */
export function isSecretField(spec: ConnectorSpec, fieldName: string): boolean {
  return spec.secretFields.includes(fieldName);
}
