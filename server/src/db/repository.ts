// 通用仓储辅助：分页/过滤/排序 + 驼峰转换
// 数据库列 snake_case，API 返回统一驼峰
import { camelize } from "../utils/case.js";
import { db, queryAll, queryOne } from "./index.js";

/** 分页参数 */
export interface PageQuery {
  page?: number; // 从 1 开始
  pageSize?: number;
}

/** 过滤条件片段：{ 列名: 值 } 等值过滤 */
export type FilterMap = Record<string, unknown>;

/** 排序参数：形如 "created_at:desc" / "name:asc" */
export type SortSpec = string;

/** 允许排序的白名单（防止 SQL 注入） */
function resolveSort(tableAlias: string, sort?: SortSpec, allowed: string[] = []): string {
  if (!sort) return "";
  const [field, dirRaw] = sort.split(":");
  const dir = (dirRaw || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  if (!allowed.includes(field)) return "";
  const col = tableAlias ? `${tableAlias}.${field}` : field;
  return `ORDER BY ${col} ${dir}`;
}

/** 构建 WHERE 子句（等值过滤），返回 { sql, params } */
export function buildWhere(
  filters: FilterMap,
  opts: { like?: string[] } = {},
): { sql: string; params: unknown[] } {
  const like = opts.like || [];
  const clauses: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    if (like.includes(key)) {
      clauses.push(`${key} LIKE ?`);
      params.push(`%${String(value)}%`);
    } else {
      clauses.push(`${key} = ?`);
      params.push(value);
    }
  }
  if (clauses.length === 0) return { sql: "", params: [] };
  return { sql: "WHERE " + clauses.join(" AND "), params };
}

/** 分页查询结果 */
export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 通用分页查询（返回驼峰化结果）
 * @param table 表名
 * @param opts 过滤/排序/分页/可见字段
 */
export function paginate<T = unknown>(opts: {
  table: string;
  filters?: FilterMap;
  likeFields?: string[];
  sort?: SortSpec;
  sortWhitelist?: string[];
  page?: number;
  pageSize?: number;
  select?: string;
  extraWhere?: { sql: string; params: unknown[] };
}): PaginatedResult<T> {
  const {
    table,
    filters = {},
    likeFields = [],
    sort,
    sortWhitelist = [],
    page = 1,
    pageSize = 20,
    select = "*",
    extraWhere,
  } = opts;

  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.max(1, Math.min(200, Math.floor(pageSize)));
  const offset = (safePage - 1) * safeSize;

  const where = buildWhere(filters, { like: likeFields });
  const whereParts: string[] = [];
  const whereParams: unknown[] = [];
  if (where.sql) {
    whereParts.push(where.sql.replace(/^WHERE /, ""));
    whereParams.push(...where.params);
  }
  if (extraWhere?.sql) {
    whereParts.push(extraWhere.sql.replace(/^WHERE /, ""));
    whereParams.push(...extraWhere.params);
  }
  const whereClause = whereParts.length ? "WHERE " + whereParts.join(" AND ") : "";

  const orderClause = resolveSort("", sort, sortWhitelist);
  const limitClause = `LIMIT ? OFFSET ?`;

  const listSql = `SELECT ${select} FROM ${table} ${whereClause} ${orderClause} ${limitClause}`;
  const countSql = `SELECT COUNT(*) AS total FROM ${table} ${whereClause}`;

  const rows = queryAll<Record<string, unknown>>(listSql, [...whereParams, safeSize, offset]);
  const totalRow = queryOne<{ total: number }>(countSql, whereParams);
  const total = totalRow?.total ?? 0;

  return {
    list: rows.map((r) => camelize<T>(r)),
    total,
    page: safePage,
    pageSize: safeSize,
    totalPages: Math.max(1, Math.ceil(total / safeSize)),
  };
}

/** 单表插入（INSERT OR IGNORE），values 为列→值 */
export function insertOrIgnore(table: string, values: Record<string, unknown>): void {
  const cols = Object.keys(values);
  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
  db().prepare(sql).run(...cols.map((c) => values[c]));
}

/** 单表插入（INSERT OR REPLACE），values 为列→值 */
export function insertOrReplace(table: string, values: Record<string, unknown>): void {
  const cols = Object.keys(values);
  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
  db().prepare(sql).run(...cols.map((c) => values[c]));
}

/** 按主键删除 */
export function deleteById(table: string, id: string): number {
  const r = db().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return r.changes;
}
