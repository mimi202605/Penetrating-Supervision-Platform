// 连接器目录：预置全部 20 个连接器 spec 元数据
// 6 个实现（kingdee-eas-openapi/sap-odata/jdbc-mysql/cdc-mysql/treasury-sys/file-csv）
// 14 个占位（spec 完整，实现待后续）
import type { ConnectorSpec } from "./types.js";

// ============= 6 个已实现连接器 spec =============

export const kingdeeEasOpenApiSpec: ConnectorSpec = {
  type: "kingdee-eas-openapi",
  displayName: "金蝶 EAS Cloud OpenAPI",
  category: "erp",
  capabilities: ["full", "incremental", "discover"],
  auth: "token",
  connectionSpec: {
    type: "object",
    required: ["endpoint", "dcCode", "username", "password"],
    properties: {
      endpoint: { type: "string", title: "EAS 服务地址", order: 1, description: "如 http://eas.example.com" },
      dcCode: { type: "string", title: "数据中心编码", order: 2 },
      username: { type: "string", title: "用户名", order: 3 },
      password: { type: "string", title: "密码", order: 4, airbyte_secret: true },
      l2: { type: "integer", title: "数据库类型", default: 2, description: "2=Oracle", order: 5 },
    },
  },
  secretFields: ["password"],
  version: "1.0.0",
};

export const sapODataSpec: ConnectorSpec = {
  type: "sap-odata",
  displayName: "SAP OData",
  category: "erp",
  capabilities: ["full", "incremental", "discover"],
  auth: "basic",
  connectionSpec: {
    type: "object",
    required: ["endpoint", "username", "password"],
    properties: {
      endpoint: { type: "string", title: "OData 服务地址", order: 1, description: "如 https://sap.example.com/sap/opu/odata/sap/" },
      username: { type: "string", order: 2 },
      password: { type: "string", order: 3, airbyte_secret: true },
      client: { type: "string", title: "SAP Client", order: 4 },
      svcPath: { type: "string", title: "服务路径", order: 5 },
    },
  },
  secretFields: ["password"],
  version: "1.0.0",
};

export const jdbcMysqlSpec: ConnectorSpec = {
  type: "jdbc-mysql",
  displayName: "MySQL (JDBC)",
  category: "db",
  capabilities: ["full", "incremental", "discover"],
  auth: "basic",
  connectionSpec: {
    type: "object",
    required: ["host", "port", "database", "username", "password"],
    properties: {
      host: { type: "string", order: 1 },
      port: { type: "integer", default: 3306, order: 2 },
      database: { type: "string", order: 3 },
      username: { type: "string", order: 4 },
      password: { type: "string", order: 5, airbyte_secret: true },
    },
  },
  secretFields: ["password"],
  version: "1.0.0",
};

export const cdcMysqlSpec: ConnectorSpec = {
  type: "cdc-mysql",
  displayName: "MySQL CDC (binlog)",
  category: "db",
  capabilities: ["cdc", "schema-evolution"],
  auth: "basic",
  connectionSpec: {
    type: "object",
    required: ["host", "port", "username", "password"],
    properties: {
      host: { type: "string", order: 1 },
      port: { type: "integer", default: 3306, order: 2 },
      username: { type: "string", order: 3 },
      password: { type: "string", order: 4, airbyte_secret: true },
      serverId: { type: "integer", title: "复制 server_id", order: 5 },
    },
  },
  secretFields: ["password"],
  version: "1.0.0",
};

export const treasurySysSpec: ConnectorSpec = {
  type: "treasury-sys",
  displayName: "司库系统",
  category: "saas",
  capabilities: ["full", "incremental", "discover"],
  auth: "token",
  connectionSpec: {
    type: "object",
    required: ["endpoint", "token"],
    properties: {
      endpoint: { type: "string", title: "司库 API 地址", order: 1 },
      token: { type: "string", order: 2, airbyte_secret: true },
      orgCode: { type: "string", title: "默认组织编码", order: 3 },
    },
  },
  secretFields: ["token"],
  version: "1.0.0",
};

export const fileCsvSpec: ConnectorSpec = {
  type: "file-csv",
  displayName: "CSV 文件",
  category: "file",
  capabilities: ["full", "discover"],
  auth: "none",
  connectionSpec: {
    type: "object",
    required: ["path"],
    properties: {
      path: { type: "string", title: "文件路径", order: 1, description: "本地绝对路径或 SFTP sftp://host/path" },
      delimiter: { type: "string", default: ",", order: 2 },
      encoding: { type: "string", default: "utf-8", order: 3 },
      hasHeader: { type: "boolean", default: true, order: 4 },
    },
  },
  secretFields: [],
  version: "1.0.0",
};

// ============= 14 个占位连接器 spec =============

export const placeholderSpecs: ConnectorSpec[] = [
  {
    type: "kingdee-eas-ws",
    displayName: "金蝶 EAS WebService (SOAP)",
    category: "erp",
    capabilities: ["full", "incremental"],
    auth: "basic",
    connectionSpec: {
      type: "object",
      required: ["endpoint", "dcCode", "username", "password"],
      properties: {
        endpoint: { type: "string", order: 1 },
        dcCode: { type: "string", order: 2 },
        username: { type: "string", order: 3 },
        password: { type: "string", order: 4, airbyte_secret: true },
      },
    },
    secretFields: ["password"],
  },
  {
    type: "sap-bapi",
    displayName: "SAP BAPI/RFC",
    category: "erp",
    capabilities: ["full", "incremental"],
    auth: "basic",
    connectionSpec: {
      type: "object",
      required: ["ashost", "sysnr", "client", "user", "passwd"],
      properties: {
        ashost: { type: "string", title: "SAP 应用服务器", order: 1 },
        sysnr: { type: "string", title: "实例号", order: 2 },
        client: { type: "string", order: 3 },
        user: { type: "string", order: 4 },
        passwd: { type: "string", order: 5, airbyte_secret: true },
        lang: { type: "string", default: "ZH", order: 6 },
      },
    },
    secretFields: ["passwd"],
  },
  {
    type: "sap-idoc",
    displayName: "SAP IDoc",
    category: "erp",
    capabilities: ["cdc"],
    auth: "cert",
    connectionSpec: {
      type: "object",
      required: ["gateway", "programId"],
      properties: {
        gateway: { type: "string", order: 1 },
        programId: { type: "string", order: 2 },
        certPath: { type: "string", order: 3, airbyte_secret: true },
      },
    },
    secretFields: ["certPath"],
  },
  {
    type: "igix-rest",
    displayName: "浪潮 iGIX REST",
    category: "erp",
    capabilities: ["full", "incremental", "discover"],
    auth: "token",
    connectionSpec: {
      type: "object",
      required: ["endpoint", "token"],
      properties: { endpoint: { type: "string", order: 1 }, token: { type: "string", order: 2, airbyte_secret: true } },
    },
    secretFields: ["token"],
  },
  {
    type: "finance-shared",
    displayName: "财务共享平台",
    category: "saas",
    capabilities: ["full", "incremental"],
    auth: "token",
    connectionSpec: {
      type: "object",
      required: ["endpoint", "token"],
      properties: { endpoint: { type: "string", order: 1 }, token: { type: "string", order: 2, airbyte_secret: true } },
    },
    secretFields: ["token"],
  },
  {
    type: "hr-system",
    displayName: "人力资源系统",
    category: "saas",
    capabilities: ["full", "incremental", "discover"],
    auth: "token",
    connectionSpec: {
      type: "object",
      required: ["endpoint", "token"],
      properties: { endpoint: { type: "string", order: 1 }, token: { type: "string", order: 2, airbyte_secret: true } },
    },
    secretFields: ["token"],
  },
  {
    type: "salary-mgmt",
    displayName: "薪酬福利管理",
    category: "saas",
    capabilities: ["full", "incremental"],
    auth: "token",
    connectionSpec: {
      type: "object",
      required: ["endpoint", "token"],
      properties: { endpoint: { type: "string", order: 1 }, token: { type: "string", order: 2, airbyte_secret: true } },
    },
    secretFields: ["token"],
  },
  {
    type: "finance-acc",
    displayName: "财务核算 (JDBC)",
    category: "db",
    capabilities: ["full", "incremental", "discover"],
    auth: "basic",
    connectionSpec: {
      type: "object",
      required: ["host", "port", "database", "username", "password"],
      properties: {
        host: { type: "string", order: 1 },
        port: { type: "integer", order: 2 },
        database: { type: "string", order: 3 },
        username: { type: "string", order: 4 },
        password: { type: "string", order: 5, airbyte_secret: true },
        dbType: { type: "string", default: "oracle", order: 6 },
      },
    },
    secretFields: ["password"],
  },
  {
    type: "tax-social",
    displayName: "税务与社保",
    category: "saas",
    capabilities: ["full"],
    auth: "token",
    connectionSpec: {
      type: "object",
      required: ["endpoint", "token"],
      properties: { endpoint: { type: "string", order: 1 }, token: { type: "string", order: 2, airbyte_secret: true } },
    },
    secretFields: ["token"],
  },
  {
    type: "project-mgmt",
    displayName: "项目管理平台",
    category: "saas",
    capabilities: ["full", "incremental"],
    auth: "token",
    connectionSpec: {
      type: "object",
      required: ["endpoint", "token"],
      properties: { endpoint: { type: "string", order: 1 }, token: { type: "string", order: 2, airbyte_secret: true } },
    },
    secretFields: ["token"],
  },
  {
    type: "contract-sys",
    displayName: "合同系统",
    category: "saas",
    capabilities: ["full", "incremental"],
    auth: "token",
    connectionSpec: {
      type: "object",
      required: ["endpoint", "token"],
      properties: { endpoint: { type: "string", order: 1 }, token: { type: "string", order: 2, airbyte_secret: true } },
    },
    secretFields: ["token"],
  },
  {
    type: "procurement",
    displayName: "采购管理平台",
    category: "saas",
    capabilities: ["full", "incremental"],
    auth: "token",
    connectionSpec: {
      type: "object",
      required: ["endpoint", "token"],
      properties: { endpoint: { type: "string", order: 1 }, token: { type: "string", order: 2, airbyte_secret: true } },
    },
    secretFields: ["token"],
  },
  {
    type: "e-bidding",
    displayName: "电子招标平台",
    category: "saas",
    capabilities: ["full", "incremental"],
    auth: "token",
    connectionSpec: {
      type: "object",
      required: ["endpoint", "token"],
      properties: { endpoint: { type: "string", order: 1 }, token: { type: "string", order: 2, airbyte_secret: true } },
    },
    secretFields: ["token"],
  },
  {
    type: "external-credit",
    displayName: "外部工商 (天眼查/企查查)",
    category: "saas",
    capabilities: ["full"],
    auth: "token",
    connectionSpec: {
      type: "object",
      required: ["endpoint", "token"],
      properties: { endpoint: { type: "string", order: 1 }, token: { type: "string", order: 2, airbyte_secret: true } },
    },
    secretFields: ["token"],
  },
];

// 全部 20 个 spec（6 实现 + 14 占位）
export const ALL_SPECS: ConnectorSpec[] = [
  kingdeeEasOpenApiSpec,
  sapODataSpec,
  jdbcMysqlSpec,
  cdcMysqlSpec,
  treasurySysSpec,
  fileCsvSpec,
  ...placeholderSpecs,
];
