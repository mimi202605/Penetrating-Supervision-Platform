// RBAC：角色→权限映射、路由前置钩子、行级数据权限（按组织层级过滤）
import type { FastifyReply, FastifyRequest } from "fastify";
import { queryAll } from "../../db/index.js";

/** 系统角色 */
export type Role = "admin" | "group_admin" | "inspector" | "duty_officer" | "leader";

/** 接口权限粒度 */
export type Permission =
  | "risk:read"
  | "risk:write"
  | "workorder:read"
  | "workorder:advance"
  | "rule:read"
  | "rule:write"
  | "collection:read"
  | "collection:write"
  | "graph:read"
  | "penetration:read"
  | "audit:read"
  | "sanitizer:read"
  | "sanitizer:write"
  | "ai:invoke"
  | "system:admin"
  | "dashboard:read";

/** 角色→权限映射（admin 全权，leader 只读全局，group_admin 本单位及下级） */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "risk:read", "risk:write", "workorder:read", "workorder:advance",
    "rule:read", "rule:write", "collection:read", "collection:write",
    "graph:read", "penetration:read", "audit:read", "sanitizer:read",
    "sanitizer:write", "ai:invoke", "system:admin", "dashboard:read",
  ],
  group_admin: [
    "risk:read", "workorder:read", "workorder:advance", "rule:read",
    "collection:read", "graph:read", "penetration:read", "dashboard:read",
  ],
  inspector: [
    "risk:read", "workorder:read", "workorder:advance", "rule:read",
    "graph:read", "penetration:read", "dashboard:read",
  ],
  duty_officer: [
    "risk:read", "workorder:read", "dashboard:read", "collection:read",
  ],
  leader: [
    "risk:read", "workorder:read", "rule:read", "collection:read",
    "graph:read", "penetration:read", "audit:read", "dashboard:read",
  ],
};

/** 判断角色是否具备某权限 */
export function hasPermission(role: string, perm: Permission): boolean {
  return (ROLE_PERMISSIONS[role as Role] || []).includes(perm);
}

/** 路由前置钩子：要求请求者角色在允许列表内（需先经 authenticate） */
export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as { role?: string } | undefined;
    if (!user || !user.role) {
      reply.code(401).send({ error: "unauthorized", message: "未认证", statusCode: 401 });
      return;
    }
    if (!roles.includes(user.role as Role)) {
      reply.code(403).send({ error: "forbidden", message: "角色无权访问该接口", statusCode: 403 });
      return;
    }
  };
}

/** 路由前置钩子：要求具备某权限 */
export function requirePermission(perm: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as { role?: string } | undefined;
    if (!user || !user.role) {
      reply.code(401).send({ error: "unauthorized", message: "未认证", statusCode: 401 });
      return;
    }
    if (!hasPermission(user.role, perm)) {
      reply.code(403).send({ error: "forbidden", message: "无该操作权限", statusCode: 403 });
      return;
    }
  };
}

/**
 * 行级数据权限：返回用户可见的组织 ID 列表
 * - admin / leader：返回全部组织（集团视角）
 * - group_admin：仅本单位及下级（递归子树）
 * - 其他角色：返回全部（业务上由上层模块按需再过滤）
 */
export function filterByOrgScope(userId: string, orgId: string | null): string[] {
  // 取全部组织，构建父子关系
  const orgs = queryAll<{ id: string; parent_id: string | null; level: number }>(
    "SELECT id, parent_id, level FROM organizations",
  );
  if (orgs.length === 0) return [];
  // 集团级（level=1）视为全量可见
  const self = orgs.find((o) => o.id === orgId);
  if (!orgId || !self || self.level === 1) {
    return orgs.map((o) => o.id);
  }
  // 递归收集子树
  const childrenMap = new Map<string, string[]>();
  for (const o of orgs) {
    if (o.parent_id) {
      const arr = childrenMap.get(o.parent_id) || [];
      arr.push(o.id);
      childrenMap.set(o.parent_id, arr);
    }
  }
  const visible: string[] = [orgId];
  const stack = [orgId];
  while (stack.length) {
    const cur = stack.pop()!;
    const kids = childrenMap.get(cur) || [];
    for (const k of kids) {
      visible.push(k);
      stack.push(k);
    }
  }
  void userId; // 预留：未来按用户精细授权
  return visible;
}
