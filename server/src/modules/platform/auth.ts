// 鉴权：JWT 登录/登出、密码工具、authenticate 装饰器（Keycloak 等价）
import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import jwtPlugin from "@fastify/jwt";
import { z } from "zod";
import { config } from "../../config.js";
import { queryOne } from "../../db/index.js";
import { recordAudit } from "./audit.js";
import { logger } from "../../utils/logger.js";

/** 密码哈希：dev 环境存明文，生产应替换为 bcrypt */
export function hashPassword(plain: string): string {
  // 生产环境应：return bcrypt.hashSync(plain, 10)
  return plain;
}

/** 密码校验：dev 环境直接比对明文 */
export function verifyPassword(plain: string, stored: string): boolean {
  return plain === stored;
}

/** JWT payload */
export interface JwtUser {
  id: string;
  username: string;
  role: string;
  name: string | null;
  org_id: string | null;
}

/**
 * 在 app 实例上注册 @fastify/jwt 并装饰 fastify.authenticate
 * 须在路由注册前于根实例调用
 */
export async function setupAuth(app: FastifyInstance): Promise<void> {
  await app.register(jwtPlugin, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtTtl },
  });

  // authenticate 装饰器：校验 Authorization: Bearer <token>，挂载 req.user
  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify();
      } catch {
        reply.code(401).send({
          error: "unauthorized",
          message: "无效或过期的令牌",
          statusCode: 401,
        });
      }
    },
  );
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

/** 鉴权路由插件：POST /auth/login、POST /auth/logout */
export const registerAuthRoutes: FastifyPluginCallback = (app, _opts, done) => {
  // 登录
  app.post("/auth/login", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({
        error: "bad_request",
        message: "用户名/密码不能为空",
        statusCode: 400,
      });
      return;
    }
    const { username, password } = parsed.data;
    const row = queryOne<{ id: string; username: string; password_hash: string; role: string; name: string | null; org_id: string | null }>(
      "SELECT id, username, password_hash, role, name, org_id FROM users WHERE username = ?",
      [username],
    );
    const ok = row && verifyPassword(password, row.password_hash);
    // 登录审计（成功/失败均记录）
    recordAudit({
      userId: row?.id ?? null,
      action: "login",
      target: "/auth/login",
      ip: request.ip || null,
      detail: { username, success: !!ok },
    });
    if (!row || !ok) {
      reply.code(401).send({
        error: "invalid_credentials",
        message: "用户名或密码错误",
        statusCode: 401,
      });
      return;
    }
    const user: JwtUser = {
      id: row.id,
      username: row.username,
      role: row.role,
      name: row.name,
      org_id: row.org_id,
    };
    const token = app.jwt.sign(user);
    logger.info({ userId: user.id, role: user.role }, "用户登录成功");
    reply.send({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        org_id: user.org_id,
      },
    });
  });

  // 登出：客户端丢弃 token，服务端记录审计（需携带有效 token 以识别操作人）
  app.post("/auth/logout", { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request.user as JwtUser | undefined) ?? undefined;
    recordAudit({
      userId: user?.id ?? null,
      action: "logout",
      target: "/auth/logout",
      ip: request.ip || null,
      detail: { username: user?.username ?? null },
    });
    reply.send({ success: true });
  });

  done();
};
