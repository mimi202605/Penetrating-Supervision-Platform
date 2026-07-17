// 数据库连接与初始化
// 使用 better-sqlite3（MIT）承载 ODS/DWD/DWS/ADS 分层数仓语义
// 若 better-sqlite3 原生编译不可用，降级到 Node 22+ 内置的 node:sqlite
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, "schema.sql");

// 统一的数据库接口（屏蔽 better-sqlite3 / node:sqlite 差异）
export interface DbStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}
export interface DbConnection {
  exec(sql: string): void;
  prepare(sql: string): DbStatement;
  pragma(str: string): unknown;
  close(): void;
}

// node:sqlite 类型（仅类型，编译期擦除）
type NodeSqliteDatabase = import("node:sqlite").DatabaseSync;
type NodeSqliteStatement = import("node:sqlite").StatementSync;

// 动态加载：优先 better-sqlite3，失败降级 node:sqlite
async function openDatabase(dbPath: string): Promise<DbConnection> {
  const absPath = resolve(process.cwd(), dbPath);
  // 自动创建数据目录
  mkdirSync(dirname(absPath), { recursive: true });
  try {
    const mod = (await import("better-sqlite3")) as unknown as {
      default: new (path: string, opts?: Record<string, unknown>) => BetterSqlite3Db;
    };
    const Database = mod.default;
    const raw = new Database(absPath, { fileMustExist: false });
    // 适配为统一接口
    return {
      exec: (sql) => raw.exec(sql),
      prepare: (sql) => adaptBetterStatement(raw.prepare(sql)),
      pragma: (str) => raw.pragma(str),
      close: () => raw.close(),
    };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "better-sqlite3 不可用，降级到 node:sqlite",
    );
    const { DatabaseSync } = await import("node:sqlite");
    const raw: NodeSqliteDatabase = new DatabaseSync(absPath);
    return {
      exec: (sql) => {
        raw.exec(sql);
      },
      prepare: (sql) => adaptNodeStatement(raw.prepare(sql)),
      pragma: (str) => {
        raw.exec(`PRAGMA ${str};`);
      },
      close: () => raw.close(),
    };
  }
}

// better-sqlite3 内部类型
interface BetterSqlite3Db {
  exec(sql: string): void;
  prepare(sql: string): BetterSqlite3Stmt;
  pragma(str: string): unknown;
  close(): void;
}
interface BetterSqlite3Stmt {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}
function adaptBetterStatement(stmt: BetterSqlite3Stmt): DbStatement {
  return stmt;
}

// node:sqlite 适配：统一返回 DbStatement，changes 归一为 number
function adaptNodeStatement(stmt: NodeSqliteStatement): DbStatement {
  // 转为宽松签名，接受 unknown 参数（运行时由 SQLite 自行校验类型）
  const s = stmt as {
    all: (...p: unknown[]) => unknown[];
    get: (...p: unknown[]) => unknown;
    run: (...p: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
  };
  return {
    all: (...p) => s.all(...p),
    get: (...p) => s.get(...p),
    run: (...p) => {
      const r = s.run(...p);
      return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
    },
  };
}

let _db: DbConnection | null = null;

/** 获取数据库实例（单例） */
export async function getDb(): Promise<DbConnection> {
  if (_db) return _db;
  _db = await openDatabase(config.dbPath);
  // 开启 WAL 与外键
  _db.exec("PRAGMA journal_mode = WAL;");
  _db.exec("PRAGMA foreign_keys = ON;");
  _db.exec("PRAGMA synchronous = NORMAL;");
  return _db;
}

/** 同步获取数据库实例（须先经 getDb 初始化） */
export function db(): DbConnection {
  if (!_db) {
    throw new Error("数据库尚未初始化，请先调用 getDb()/initDb()");
  }
  return _db;
}

/** 建表：读取 schema.sql 并执行 */
export async function initSchema(): Promise<void> {
  const conn = await getDb();
  const sql = readFileSync(SCHEMA_PATH, "utf-8");
  conn.exec(sql);
  logger.info("数据库 schema 已就绪");
}

// ===================== 查询辅助 =====================

/** 执行查询，返回全部行（驼峰化） */
export function queryAll<T = unknown>(sql: string, params: unknown[] = []): T[] {
  return db().prepare(sql).all(...params) as T[];
}

/** 执行查询，返回首行（驼峰化） */
export function queryOne<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

/** 执行写操作，返回 changes/lastInsertRowid */
export function execute(
  sql: string,
  params: unknown[] = [],
): { changes: number; lastInsertRowid: number | bigint } {
  return db().prepare(sql).run(...params);
}

/** 事务封装 */
export function transaction<T>(fn: () => T): T {
  // better-sqlite3 提供同步事务；node:sqlite 暂以 BEGIN/COMMIT 手动包裹
  const conn = db();
  conn.exec("BEGIN;");
  try {
    const r = fn();
    conn.exec("COMMIT;");
    return r;
  } catch (e) {
    conn.exec("ROLLBACK;");
    throw e;
  }
}
