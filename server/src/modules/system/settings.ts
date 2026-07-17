// 系统模块 - 系统配置（主题/风险阈值/信创配置位/AI 状态）
// 采用内存常量默认值（与 config.aiApiBase 联动），PUT 需 admin 角色
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { requireRole } from "../platform/rbac.js";
import { recordAudit } from "../platform/audit.js";
import { config } from "../../config.js";

/** 系统配置结构 */
interface SystemSettings {
  theme: "dark" | "light";
  riskThresholds: {
    high: number; // 高风险阈值（如资产负债率 70%）
    medium: number;
    low: number;
  };
  xinChuang: {
    enabled: boolean;
    os: string; // 信创操作系统适配
    db: string; // 国产数据库适配（预留）
  };
  ai: {
    configured: boolean;
    provider: string;
    model: string;
    endpoint: string; // 脱敏显示
  };
}

/** 端点脱敏：仅保留 scheme + host，隐藏路径与 key */
function maskEndpoint(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "已配置（格式异常）";
  }
}

/** 内存默认配置（PUT 可覆盖子字段） */
const settings: SystemSettings = {
  theme: "dark",
  riskThresholds: { high: 70, medium: 40, low: 20 },
  xinChuang: { enabled: true, os: "麒麟/统信", db: "达梦/人大金仓（预留）" },
  ai: {
    configured: config.aiApiBase !== "",
    provider: "OpenAI 兼容",
    model: config.aiModel,
    endpoint: config.aiApiBase ? maskEndpoint(config.aiApiBase) : "未配置",
  },
};

/** 从请求中提取当前用户ID */
function userIdOf(request: FastifyRequest): string | null {
  return (request.user as { id?: string } | undefined)?.id ?? null;
}

/** 注册系统配置路由 */
export const registerSystemSettings: FastifyPluginAsync = async (app, _opts) => {
  app.addHook("preHandler", app.authenticate);

  // GET /system/settings - 返回系统配置
  app.get("/system/settings", async (_request, reply) => {
    reply.send({ ...settings });
  });

  // PUT /system/settings - 更新配置（需 admin）
  app.put(
    "/system/settings",
    { preHandler: [requireRole("admin")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Partial<SystemSettings>;
      // 顶层字段合并
      if (body.theme) settings.theme = body.theme;
      // 子对象合并
      if (body.riskThresholds) {
        settings.riskThresholds = { ...settings.riskThresholds, ...body.riskThresholds };
      }
      if (body.xinChuang) {
        settings.xinChuang = { ...settings.xinChuang, ...body.xinChuang };
      }
      if (body.ai) {
        settings.ai = { ...settings.ai, ...body.ai };
      }
      recordAudit({
        userId: userIdOf(request),
        action: "update",
        target: "/system/settings",
        ip: request.ip || null,
        detail: body,
      });
      reply.send({ ...settings });
    },
  );
};
