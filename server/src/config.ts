// 全局配置：从环境变量读取，提供默认值
// 所有可配置项集中在此，便于运维与环境隔离

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === "" ? fallback : raw;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

export const config = {
  // 服务监听端口
  port: num("PORT", 7077),
  // JWT 签名密钥（生产环境必须通过环境变量覆盖）
  jwtSecret: str("JWT_SECRET", "dev-secret-change-me"),
  // SQLite 数据库文件路径
  dbPath: str("DB_PATH", "./data/supervision.db"),
  // AI 适配器（OpenAI 兼容协议），未配置则返回占位响应
  aiApiBase: str("AI_API_BASE", ""),
  aiApiKey: str("AI_API_KEY", ""),
  aiModel: str("AI_MODEL", "gpt-4o-mini"),
  // CORS 允许来源，逗号分隔；* 表示全部
  corsOrigin: str("CORS_ORIGIN", "*"),
  // 运行环境
  nodeEnv: str("NODE_ENV", "development"),
  isDev: str("NODE_ENV", "development") === "development",
  // JWT 有效期
  jwtTtl: str("JWT_TTL", "8h"),
  // 限流配置
  rateLimitMax: num("RATE_LIMIT_MAX", 120),
  rateLimitWindow: str("RATE_LIMIT_WINDOW", "1 minute"),
  // 是否在启动时执行种子数据
  seedOnBoot: bool("SEED_ON_BOOT", true),
} as const;

export type AppConfig = typeof config;
