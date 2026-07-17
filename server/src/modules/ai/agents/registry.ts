// AI 智能体注册表（Task 19.1）：16 类智能体 spec 元数据
// 对齐穿透式监管平台场景：抽取 / 比对 / 生成 / 分析 / 变换
// implemented=true 表示已有实现，可经 POST /ai/agents/:id/invoke 调用
// protocol：mcp（模型上下文协议）/ a2a（智能体间通信）/ internal（平台内部）

export type AgentCategory = "extract" | "compare" | "generate" | "analyze" | "transform";
export type AgentProtocol = "mcp" | "a2a" | "internal";
export type AgentModel = "llm" | "local" | "hybrid";

export interface AgentSpec {
  id: string; // 如 "info-extract"
  name: string; // 中文名
  category: AgentCategory;
  capabilities: string[]; // 能力标签
  inputSchema: string; // 入参 JSON schema 描述（简短字符串）
  outputSchema: string; // 出参 JSON schema 描述
  protocol: AgentProtocol;
  model: AgentModel; // "llm" | "local" | "hybrid"
  description: string;
  implemented: boolean; // 3 个 true，13 个 false
}

/** 16 类智能体元数据（前 3 个已实现） */
export const AGENTS: AgentSpec[] = [
  {
    id: "info-extract",
    name: "信息抽取",
    category: "extract",
    capabilities: ["文本抽取", "字段提取", "结构化"],
    inputSchema: "{text:string, fields?:string[], sceneId?:string}",
    outputSchema: "{fields:object, confidence:number, configured:boolean}",
    protocol: "internal",
    model: "llm",
    description: "从文本/表格抽取结构化字段",
    implemented: true,
  },
  {
    id: "text-compare",
    name: "文本比对",
    category: "compare",
    capabilities: ["查重", "差异比对", "相似度"],
    inputSchema: "{textA:string, textB:string, mode?:'cosine'|'diff'|'both'}",
    outputSchema: "{similarity:number, diff:DiffSegment[], configured:boolean}",
    protocol: "internal",
    model: "hybrid",
    description: "标书查重/阴阳合同，cosine 相似度 + LCS diff",
    implemented: true,
  },
  {
    id: "report-generate",
    name: "风险报告生成",
    category: "generate",
    capabilities: ["报告生成", "markdown", "线索汇总"],
    inputSchema: "{clueIds:string[], template?:string, sceneId?:string}",
    outputSchema: "{report:string, clueCount:number, configured:boolean}",
    protocol: "internal",
    model: "llm",
    description: "输入 clueIds 生成 markdown 风险处置报告",
    implemented: true,
  },
  {
    id: "entity-resolve",
    name: "实体归一",
    category: "transform",
    capabilities: ["实体对齐", "主体归一", "跨系统"],
    inputSchema: "{entities:object[], rules?:object}",
    outputSchema: "{resolved:object[], duplicates:object[]}",
    protocol: "a2a",
    model: "hybrid",
    description: "跨系统主体归一",
    implemented: false,
  },
  {
    id: "relationship-extract",
    name: "关系抽取",
    category: "extract",
    capabilities: ["关系抽取", "三元组", "图谱"],
    inputSchema: "{text:string, entityTypes?:string[]}",
    outputSchema: "{triples:Array<{subject,predicate,object}>}",
    protocol: "internal",
    model: "llm",
    description: "抽取实体间关系",
    implemented: false,
  },
  {
    id: "anomaly-detect",
    name: "异常检测",
    category: "analyze",
    capabilities: ["异常检测", "统计", "离群点"],
    inputSchema: "{series:number[], method?:'zscore'|'iqr'}",
    outputSchema: "{anomalies:Array<{index,score}>}",
    protocol: "internal",
    model: "local",
    description: "统计异常检测",
    implemented: false,
  },
  {
    id: "risk-assess",
    name: "风险评估",
    category: "analyze",
    capabilities: ["风险评估", "等级判定", "评分"],
    inputSchema: "{clueId:string, factors?:object}",
    outputSchema: "{level:string, score:number, reasons:string[]}",
    protocol: "a2a",
    model: "hybrid",
    description: "风险等级评估",
    implemented: false,
  },
  {
    id: "evidence-collect",
    name: "证据收集",
    category: "extract",
    capabilities: ["证据快照", "取证", "存证"],
    inputSchema: "{clueId:string, sources?:string[]}",
    outputSchema: "{evidence:Array<{type,ref,hash}>}",
    protocol: "internal",
    model: "local",
    description: "证据快照收集",
    implemented: false,
  },
  {
    id: "graph-build",
    name: "图谱构建",
    category: "transform",
    capabilities: ["图谱构建", "邻接表", "实体关系"],
    inputSchema: "{entities:object[], relations:object[]}",
    outputSchema: "{nodes:object[], edges:object[]}",
    protocol: "internal",
    model: "local",
    description: "构建邻接表",
    implemented: false,
  },
  {
    id: "sentiment-analysis",
    name: "情感分析",
    category: "analyze",
    capabilities: ["情感分析", "舆情", "极性"],
    inputSchema: "{text:string}",
    outputSchema: "{sentiment:string, score:number}",
    protocol: "mcp",
    model: "llm",
    description: "舆情情感分析",
    implemented: false,
  },
  {
    id: "nlu-classify",
    name: "意图分类",
    category: "analyze",
    capabilities: ["意图分类", "NLU", "槽位"],
    inputSchema: "{text:string, intents?:string[]}",
    outputSchema: "{intent:string, slots:object, confidence:number}",
    protocol: "mcp",
    model: "llm",
    description: "自然语言意图分类",
    implemented: false,
  },
  {
    id: "summarization",
    name: "摘要生成",
    category: "generate",
    capabilities: ["摘要", "压缩", "要点"],
    inputSchema: "{text:string, maxTokens?:number}",
    outputSchema: "{summary:string}",
    protocol: "mcp",
    model: "llm",
    description: "长文本摘要",
    implemented: false,
  },
  {
    id: "translation",
    name: "翻译",
    category: "transform",
    capabilities: ["翻译", "中英互译"],
    inputSchema: "{text:string, target:'zh'|'en'}",
    outputSchema: "{translation:string}",
    protocol: "mcp",
    model: "llm",
    description: "中英互译",
    implemented: false,
  },
  {
    id: "ocr-extract",
    name: "OCR识别",
    category: "extract",
    capabilities: ["OCR", "图片识别", "票据"],
    inputSchema: "{imageBase64:string}",
    outputSchema: "{text:string, regions:object[]}",
    protocol: "internal",
    model: "local",
    description: "图片文字识别",
    implemented: false,
  },
  {
    id: "data-quality",
    name: "数据质量校验",
    category: "analyze",
    capabilities: ["数据质量", "完整性", "校验"],
    inputSchema: "{records:object[], rules?:object[]}",
    outputSchema: "{valid:boolean, issues:object[]}",
    protocol: "internal",
    model: "local",
    description: "数据完整性校验",
    implemented: false,
  },
  {
    id: "compliance-check",
    name: "合规检查",
    category: "analyze",
    capabilities: ["合规检查", "监管", "规则"],
    inputSchema: "{subject:object, rules?:object[]}",
    outputSchema: "{compliant:boolean, violations:object[]}",
    protocol: "a2a",
    model: "hybrid",
    description: "监管合规检查",
    implemented: false,
  },
];

/** 列出全部智能体 spec（返回副本，避免外部修改内部数组） */
export function listAgents(): AgentSpec[] {
  return AGENTS.slice();
}

/** 按 id 取单个智能体 spec，未找到返回 null */
export function getAgent(id: string): AgentSpec | null {
  return AGENTS.find((a) => a.id === id) ?? null;
}
