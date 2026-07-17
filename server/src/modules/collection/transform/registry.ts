// Transform 注册表：路由 type → handler；提供 listTransformTypes 供前端渲染
import type { TransformHandler, TransformType, TransformTypeSpec } from "./types.js";
import { basicHandlers } from "./handlers-basic.js";
import { dataHandlers } from "./handlers-data.js";
import { scriptHandlers } from "./handlers-script.js";
import { regulatoryHandlers } from "./handlers-regulatory.js";

const HANDLERS = new Map<TransformType, TransformHandler>();

/** 注册 handler */
export function registerTransformHandler(handler: TransformHandler): void {
  if (HANDLERS.has(handler.type)) {
    throw new Error(`Transform handler 已注册: ${handler.type}`);
  }
  HANDLERS.set(handler.type, handler);
}

/** 启动时注册全部 13 类 */
let initialized = false;
export function registerAllTransforms(): void {
  if (initialized) return;
  for (const h of [...basicHandlers, ...dataHandlers, ...scriptHandlers, ...regulatoryHandlers]) {
    registerTransformHandler(h);
  }
  initialized = true;
}

/** 取 handler */
export function getTransformHandler(type: TransformType): TransformHandler {
  registerAllTransforms();
  const h = HANDLERS.get(type);
  if (!h) throw new Error(`未知 Transform 类型: ${type}`);
  return h;
}

/** 列出全部 13 类 Transform + 配置 schema（供前端表单渲染） */
export function listTransformTypes(): TransformTypeSpec[] {
  registerAllTransforms();
  return ALL_TRANSFORM_SPECS;
}

// 13 类 Transform 元数据（前端表单 JsonSchema）
const ALL_TRANSFORM_SPECS: TransformTypeSpec[] = [
  {
    type: "field-mapping",
    displayName: "字段映射",
    category: "basic",
    description: "重命名/筛选字段。mapping: {src→dst}；includeOnly=true 仅保留映射字段",
    configSchema: {
      type: "object",
      properties: {
        mapping: { type: "object", description: "源字段→目标字段", additionalProperties: { type: "string" } },
        includeOnly: { type: "boolean", default: false },
      },
    },
  },
  {
    type: "type-cast",
    displayName: "类型转换",
    category: "basic",
    description: "字段类型转换：number/boolean/date/decimal",
    configSchema: {
      type: "object",
      properties: {
        fields: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              target: { type: "string", enum: ["number", "boolean", "date", "decimal"] },
              format: { type: "string", description: "date: YYYY-MM-DD; decimal: 0.00" },
            },
          },
        },
      },
    },
  },
  {
    type: "clean",
    displayName: "数据清洗",
    category: "data-quality",
    description: "trim/defaults/regex 替换",
    configSchema: {
      type: "object",
      properties: {
        trim: { type: "array", items: { type: "string" } },
        defaults: { type: "object", additionalProperties: true },
        replace: {
          type: "array",
          items: {
            type: "object",
            properties: { field: { type: "string" }, pattern: { type: "string" }, replacement: { type: "string" } },
          },
        },
      },
    },
  },
  {
    type: "dedup",
    displayName: "主键去重",
    category: "data-quality",
    description: "按 keys 主键内存去重；window>0 仅保留最近 N 条窗口",
    configSchema: {
      type: "object",
      properties: {
        keys: { type: "array", items: { type: "string" } },
        window: { type: "integer", default: 0, description: "0=无窗口" },
      },
      required: ["keys"],
    },
  },
  {
    type: "filter",
    displayName: "表达式过滤",
    category: "data-quality",
    description: "基于 expr-eval 表达式过滤；返回 false 丢弃",
    configSchema: {
      type: "object",
      properties: { expr: { type: "string", description: "如 amount > 100 && status == 'active'" } },
      required: ["expr"],
    },
  },
  {
    type: "mask",
    displayName: "字段脱敏",
    category: "security",
    description: "strategy=fixed 全部星号；keep-edges 保留首尾 N 位",
    configSchema: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              strategy: { type: "string", enum: ["fixed", "keep-edges"] },
              keepPrefix: { type: "integer" },
              keepSuffix: { type: "integer" },
            },
          },
        },
      },
    },
  },
  {
    type: "flatten",
    displayName: "嵌套展开",
    category: "basic",
    description: "把嵌套数组展开为多条扁平记录（金蝶 FEntry）；mode=spread|first",
    configSchema: {
      type: "object",
      properties: {
        field: { type: "string" },
        prefix: { type: "string", default: "" },
        mode: { type: "string", enum: ["spread", "first"], default: "spread" },
      },
      required: ["field"],
    },
  },
  {
    type: "enrich",
    displayName: "维表富化",
    category: "basic",
    description: "按 lookupField 关联维表，把维表字段追加到主记录；mode=left|inner",
    configSchema: {
      type: "object",
      properties: {
        lookupField: { type: "string" },
        lookupTable: { type: "object", description: "{key: {field:value}}" },
        fields: { type: "object", additionalProperties: { type: "string" } },
        mode: { type: "string", enum: ["left", "inner"], default: "left" },
      },
      required: ["lookupField", "lookupTable", "fields"],
    },
  },
  {
    type: "script",
    displayName: "脚本（vm2 沙箱）",
    category: "basic",
    description: "vm2 沙箱内执行自定义 JS；禁用 require/process；超时 5s",
    configSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "如 return { ...record, _ts: 1 }" },
        timeout: { type: "integer", default: 5000 },
      },
      required: ["code"],
    },
  },
  {
    type: "sql",
    displayName: "SQL（alasql）",
    category: "basic",
    description: "alasql SELECT 单条入单条出；表名 ? 占位",
    configSchema: {
      type: "object",
      properties: { sql: { type: "string", description: "如 SELECT * FROM ? WHERE amount > 100" } },
      required: ["sql"],
    },
  },
  {
    type: "entity-resolve",
    displayName: "实体消歧",
    category: "regulatory",
    description: "按 org_code+name 归一为同一 entityId",
    configSchema: {
      type: "object",
      properties: {
        orgCodeField: { type: "string", default: "orgCode" },
        nameField: { type: "string", default: "name" },
        outputField: { type: "string", default: "entityId" },
        mode: { type: "string", enum: ["strict", "fuzzy"], default: "strict" },
      },
    },
  },
  {
    type: "relationship-extract",
    displayName: "关系抽取",
    category: "regulatory",
    description: "从记录抽取节点+边写入图谱邻接表",
    configSchema: {
      type: "object",
      properties: {
        nodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              idField: { type: "string" },
              labelField: { type: "string" },
              type: { type: "string", enum: ["account", "counterparty", "org", "person"] },
            },
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fromField: { type: "string" },
              toField: { type: "string" },
              label: { type: "string" },
              weightField: { type: "string" },
            },
          },
        },
      },
    },
  },
  {
    type: "evidence-snapshot",
    displayName: "证据快照",
    category: "regulatory",
    description: "命中 condition 时冻结 record 快照到 ctx.evidence",
    configSchema: {
      type: "object",
      properties: {
        ruleId: { type: "string" },
        condition: { type: "string", description: "expr-eval 表达式，留空 + alwaysSnapshot=true 总是快照" },
        alwaysSnapshot: { type: "boolean", default: false },
      },
    },
  },
];
