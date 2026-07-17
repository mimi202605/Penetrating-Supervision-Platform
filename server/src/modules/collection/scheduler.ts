// 数据采集中心 - 采集任务调度器（DolphinScheduler 等价，基于 node-cron）
// 启动时读取全部 collection_tasks，按 schedule 注册 cron，每次触发调用 runtime.runTaskSync
// 同时启动 T+5 巡检线程：每 5min 扫 risk_clues 中 due_at < now AND status='pending' → emit T+5 通报事件
import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { queryAll, queryOne } from "../../db/index.js";
import { logger } from "../../utils/logger.js";
import { runTaskSync } from "./runtime.js";
import { eventBus } from "../platform/eventbus.js";
import { validateDag } from "./dag.js";

/** 已注册的调度任务实例（用于优雅关闭） */
let scheduledTasks: ScheduledTask[] = [];
let t5Inspector: ScheduledTask | null = null;

/** 将采集任务的 schedule 解析为 cron 表达式 */
function resolveCronExpr(schedule: string): string | null {
  // 实时 CDC 任务用每分钟调度
  if (schedule === "实时") {
    return "*/1 * * * *";
  }
  // 其他任务用原 schedule，需通过 cron 校验
  if (cron.validate(schedule)) {
    return schedule;
  }
  return null;
}

/**
 * 启动采集任务调度器
 * 读取全部 enabled=1 collection_tasks，按 schedule 注册 cron，每次触发执行 runtime.runTaskSync
 * - schedule='实时' 的 CDC 任务用 "每分钟 1 次" 的 cron 表达式（/1 分钟）跑
 * - 其他用原 schedule 表达式
 * - 启动时校验 DAG 无环
 */
export function registerCollectionScheduler(): void {
  // DAG 校验
  const dagCheck = validateDag();
  if (dagCheck.hasCycle) {
    logger.error(
      { cyclicTasks: dagCheck.cyclicTasks },
      "采集任务 DAG 检测到循环依赖，循环内的任务将被跳过",
    );
  }

  const tasks = queryAll<{ id: string; name: string; mode: string; schedule: string; enabled: number }>(
    "SELECT id, name, mode, schedule, enabled FROM collection_tasks WHERE enabled = 1",
  );
  // 先停止旧的（幂等）
  stopScheduler();
  for (const t of tasks) {
    const expr = resolveCronExpr(t.schedule);
    if (!expr) {
      logger.warn(
        { taskId: t.id, schedule: t.schedule },
        "采集任务调度表达式无效，跳过注册",
      );
      continue;
    }
    const task = cron.schedule(expr, () => {
      logger.debug({ taskId: t.id, name: t.name, cron: expr }, "cron 触发采集任务");
      try {
        runTaskSync(t.id);
      } catch (err) {
        logger.error({ taskId: t.id, err }, "采集任务执行异常");
      }
    });
    scheduledTasks.push(task);
    logger.info({ taskId: t.id, name: t.name, cron: expr }, "采集任务调度已注册");
  }
  logger.info({ count: scheduledTasks.length }, "采集调度器启动完成");

  // T+5 巡检：每 5min 扫 risk_clues 中 due_at < now AND status='pending' → emit 通报事件
  t5Inspector = cron.schedule("*/5 * * * *", () => {
    try {
      const overdue = queryAll<{ id: string; clue_id: string; due_at: string }>(
        "SELECT id, clue_id, due_at FROM risk_clues WHERE status = 'pending' AND due_at < datetime('now')",
      );
      if (overdue.length > 0) {
        logger.warn(
          { count: overdue.length, sample: overdue.slice(0, 3) },
          "T+5 巡检：发现超期未处置风险线索",
        );
        for (const r of overdue) {
          eventBus.emit("risk.clue.overdue", { clueId: r.clue_id, dueAt: r.due_at });
        }
      }
    } catch (err) {
      logger.debug({ err: (err as Error).message }, "T+5 巡检执行异常（risk_clues 表可能未建）");
    }
  });
  logger.info("T+5 风险线索超期巡检线程已启动（每 5 分钟）");
}

/** 停止所有采集调度任务（供 main 优雅关闭） */
export function stopScheduler(): void {
  for (const t of scheduledTasks) {
    t.stop();
  }
  scheduledTasks = [];
  if (t5Inspector) {
    t5Inspector.stop();
    t5Inspector = null;
  }
  logger.info("采集调度器已停止");
}
