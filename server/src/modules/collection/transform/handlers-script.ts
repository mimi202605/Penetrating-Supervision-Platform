// 2 类脚本 Transform：script（vm2 沙箱）/ sql（alasql）
import type { TransformHandler } from "./types.js";
import { TransformStepError } from "./types.js";
import { VM } from "vm2";
import alasql from "alasql";

// ===================== script =====================
// 自定义脚本（vm2 沙箱）。config: { code: 'return { ...record, _ts: 1 }', timeout?: 5000 }
// 沙箱内禁用 require/process；脚本以 record 为入参，return 一个 record 或 null
export const scriptHandler: TransformHandler = {
  type: "script",
  init(config) {
    const code = String(config.code || "");
    const timeout = Number(config.timeout) || 5000;
    if (!code) throw new TransformStepError("script", "script 缺少 code 配置", {});
    return { code, timeout };
  },
  apply(record, state, _config, ctx) {
    const code = state.code as string;
    const timeout = state.timeout as number;
    const vm = new VM({
      timeout,
      sandbox: {
        record,
        ctx,
        // 显式不暴露 require/process/console
      },
      eval: false,
    });
    try {
      // 包装为函数调用，避免直接 eval
      const fn = vm.run(`(function(record, ctx) { ${code} })`);
      const result = fn(record, ctx);
      if (result === null || result === undefined) return null;
      if (typeof result !== "object") {
        throw new TransformStepError("script", "脚本须返回 object 或 null", record);
      }
      return result as Record<string, unknown>;
    } catch (err) {
      const msg = (err as Error).message || String(err);
      // vm2 沙箱违规/超时统一抛 TransformStepError
      throw new TransformStepError("script", `脚本执行失败: ${msg}`, record);
    }
  },
};

// ===================== sql =====================
// alasql SQL Transform。config: { sql: 'SELECT * FROM ? WHERE amount > 100' }
// 单条 record 包装为 [record] 喂入 alasql，返回首行（或多行）
export const sqlHandler: TransformHandler = {
  type: "sql",
  init(config) {
    const sql = String(config.sql || "");
    if (!sql) throw new TransformStepError("sql", "sql 缺少 sql 配置", {});
    return { sql };
  },
  apply(record, state) {
    const sql = state.sql as string;
    try {
      const rows = alasql(sql, [[record]]) as unknown[];
      if (!Array.isArray(rows) || rows.length === 0) return null;
      // 单条入 → 单条出（取首行）
      return rows[0] as Record<string, unknown>;
    } catch (err) {
      throw new TransformStepError("sql", `SQL 执行失败: ${(err as Error).message}`, record);
    }
  },
};

export const scriptHandlers: TransformHandler[] = [scriptHandler, sqlHandler];
