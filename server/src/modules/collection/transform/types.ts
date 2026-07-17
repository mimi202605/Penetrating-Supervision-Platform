// Transform 管道类型定义（NiFi Processor 等价）
// 13 类 Transform 的统一签名：每类支持 init/apply/flush，可流式处理
// apply 返回：单 record（透传/修改）、null（过滤）、record[]（一进多出，如 flatten）

/** 13 类 Transform 类型枚举 */
export type TransformType =
  | "field-mapping"
  | "type-cast"
  | "clean"
  | "dedup"
  | "filter"
  | "mask"
  | "flatten"
  | "enrich"
  | "script"
  | "sql"
  | "entity-resolve"
  | "relationship-extract"
  | "evidence-snapshot";

/** 单个 Transform 步骤配置 */
export interface TransformStep {
  id: string;                   // 步骤唯一 ID（用于审计/脏数据定位）
  type: TransformType;          // Transform 类型
  config: Record<string, unknown>; // 该类型的配置参数
  onError?: "skip" | "fail" | "quarantine"; // 单步错误策略，默认 skip
}

/** Transform 管道 */
export interface TransformPipeline {
  steps: TransformStep[];
  errorLimit?: { rate?: number; count?: number }; // 任务级错误阈值，超限抛 ErrorLimitExceeded
}

/** Transform 上下文（运行时元信息） */
export interface TransformContext {
  taskId?: string;
  runId?: string;
  sceneId?: string;
  modelId?: string;
  sourceId?: string;
  streamName?: string;
  /** 命中的证据数组（evidence-snapshot 写入） */
  evidence?: Array<{ ruleId?: string; snapshot: Record<string, unknown>; ts: string }>;
}

/** Transform 处理器状态（任意结构，由 handler 自行定义） */
export type TransformState = Record<string, unknown>;

/** apply 返回类型：单 record / null（过滤）/ record[]（一进多出） */
export type ApplyResult =
  | Record<string, unknown>
  | null
  | Record<string, unknown>[];

/** Transform 处理器接口 */
export interface TransformHandler {
  type: TransformType;
  /** 初始化状态（如加载维表、初始化去重 set） */
  init?(config: Record<string, unknown>, ctx: TransformContext): TransformState;
  /** 处理单条记录 */
  apply(
    record: Record<string, unknown>,
    state: TransformState,
    config: Record<string, unknown>,
    ctx: TransformContext,
  ): ApplyResult | Promise<ApplyResult>;
  /** 流结束时调用（如 dedup 末尾不再发射，enrich 无需） */
  flush?(state: TransformState, config: Record<string, unknown>, ctx: TransformContext): Record<string, unknown>[];
}

/** Transform 类型元信息（供前端动态渲染表单） */
export interface TransformTypeSpec {
  type: TransformType;
  displayName: string;
  category: "basic" | "data-quality" | "security" | "regulatory";
  description: string;
  /** 配置字段 JsonSchema（前端按此渲染） */
  configSchema: Record<string, unknown>;
}

/** 错误阈值超限 */
export class ErrorLimitExceeded extends Error {
  constructor(
    public readonly rate: number,
    public readonly count: number,
    public readonly limit: { rate?: number; count?: number },
  ) {
    super(`Transform 错误率超限：rate=${rate}, count=${count}, limit=${JSON.stringify(limit)}`);
    this.name = "ErrorLimitExceeded";
  }
}

/** 单步错误（被 onError 捕获，不抛出） */
export class TransformStepError extends Error {
  constructor(
    public readonly stepId: string,
    message: string,
    public readonly record: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TransformStepError";
  }
}
