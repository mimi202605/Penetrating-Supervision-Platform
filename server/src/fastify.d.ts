// Fastify 类型增强：自定义 authenticate 装饰器与 @fastify/jwt 的 payload/user 类型
import type { FastifyReply, FastifyRequest } from "fastify";
import type { JwtUser } from "./modules/platform/auth.js";

declare module "fastify" {
  interface FastifyInstance {
    // 自定义鉴权装饰器：校验 JWT 并挂载 req.user
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser; // sign 时传入的 payload 类型
    user: JwtUser; // jwtVerify 后 request.user 的类型
  }
}
