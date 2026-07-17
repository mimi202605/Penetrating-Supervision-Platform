// 数据采集中心 - 采集任务调度器（DolphinScheduler 等价，基于 node-cron）
// 启动时读取全部 collection_tasks，按 schedule 注册 cron，每分钟/原表达式触发 runCollectionTask
import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { queryAll } from "../../db/index.js";
import { logger } from "../../utils/logger.js";
import { runCollectionTask } from "./tasks.js";

/** 已注册的调度任务实例（用于优雅关闭） */
let scheduledTasks: ScheduledTask[] = [];

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
 * 读取全部 collection_tasks，按 schedule 注册 cron，每次触发执行 runCollectionTask
 * - schedule='实时' 的 CDC 任务用 "每分钟 1 次" 的 cron 表达式（/1 分钟）跑
 * - 其他用原 schedule 表达式
 */
export function registerCollectionScheduler(): void {
  const tasks = queryAll<{ id: string; name: string; mode: string; schedule: string }>(
    "SELECT id, name, mode, schedule FROM collection_tasks",
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
        runCollectionTask(t.id);
      } catch (err) {
        logger.error({ taskId: t.id, err }, "采集任务执行异常");
      }
    });
    scheduledTasks.push(task);
    logger.info({ taskId: t.id, name: t.name, cron: expr }, "采集任务调度已注册");
  }
  logger.info({ count: scheduledTasks.length }, "采集调度器启动完成");
}

/** 停止所有采集调度任务（供 main 优雅关闭） */
export function stopScheduler(): void {
  for (const t of scheduledTasks) {
    t.stop();
  }
  scheduledTasks = [];
  logger.info("采集调度器已停止");
}
