// 服务启动入口
// 启动序列：initDb(建表+种子) → loadEnabledPolicies(脱敏策略) → 注册 EventBus 监听
//        → registerDispatchListeners(自动派单) → registerCollectionScheduler(采集 cron)
//        → app.listen(7077) → 注册 SIGTERM/SIGINT 优雅关闭
import cron from "node-cron";
import { config } from "./config.js";
import { buildApp } from "./app.js";
import { db, getDb, initSchema } from "./db/index.js";
import { seedDatabase } from "./db/seed.js";
import { seedRegulatory } from "./db/seed-regulatory.js";
import { eventBus, registerEventBusConsumers } from "./modules/platform/eventbus.js";
import { registerDispatchListeners } from "./modules/dispatch/listeners.js";
import { registerRiskListeners } from "./modules/risk/listeners.js";
import { registerRegulatoryModelListener } from "./modules/monitoring/rule-engine.js";
import { registerCollectionScheduler, stopScheduler } from "./modules/collection/scheduler.js";
import { loadEnabledPolicies } from "./modules/ai/sanitizer-policies.js";
import { incCollectionRun } from "./health.js";
import { logger } from "./utils/logger.js";

/** 数据库初始化：建表 + 种子灌入 */
async function initDb(): Promise<void> {
  await getDb(); // 打开连接（自动建目录、开 WAL）
  await initSchema();
  if (config.seedOnBoot) {
    seedDatabase();
    seedRegulatory();
  }
}

/** 注册心跳 cron 调度（每分钟模拟一次采集调度运行，用于 /metrics 计数） */
function registerCronJobs(): cron.ScheduledTask[] {
  const tasks: cron.ScheduledTask[] = [];
  // 心跳采集任务：每分钟模拟一次采集调度运行
  tasks.push(
    cron.schedule("*/1 * * * *", () => {
      incCollectionRun();
      logger.debug("cron 心跳：采集调度运行 +1");
    }),
  );
  logger.info("心跳 cron 调度已注册");
  return tasks;
}

/** 关闭数据库连接（幂等：未初始化则跳过） */
function closeDb(): void {
  try {
    db().close();
    logger.info("数据库连接已关闭");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "关闭数据库失败（可能尚未初始化）");
  }
}

async function start(): Promise<void> {
  try {
    // 1. 数据库初始化（建表 + 种子，幂等）
    await initDb();
    logger.info({ dbPath: config.dbPath }, "数据库初始化完成");

    // 2. 加载 AI 脱敏策略到内存（spec 顺序：initDb 后）
    try {
      loadEnabledPolicies();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "加载脱敏策略失败（将在首次调用时懒加载）");
    }

    // 3. 注册事件总线消费者（平台默认消费者）
    registerEventBusConsumers();

    // 4. 注册调度指挥中心事件监听（high 风险预警自动派单）
    registerDispatchListeners();

    // 4b. 注册风险闭环事件监听（V2 Task 14：monitoring.rule.hit → risk_clues → 自动派单 → T+5 通报）
    registerRiskListeners();

    // 4c. 注册监管模型评估桥接（V2 Task 16：collection.task.done → evaluateRegulatoryModel → monitoring.rule.hit）
    registerRegulatoryModelListener();

    // 5. 注册心跳 cron（采集调度计数）
    const cronTasks = registerCronJobs();

    // 6. 注册采集任务调度器（按 collection_tasks.schedule 注册 cron，DolphinScheduler 等价）
    registerCollectionScheduler();

    // 7. 构建应用并监听
    const app = await buildApp();
    await app.listen({ port: config.port, host: "0.0.0.0" });
    logger.info(
      { port: config.port, env: config.nodeEnv },
      "🚀 穿透式监管平台后端已启动",
    );

    // 8. 优雅退出：停止 cron/采集调度 → 清空事件总线 → 关闭 Fastify → 关闭 DB → 退出
    // 防重入：用户连按 Ctrl+C 时第二次调用直接退出，避免 closeDb 漏执行
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) {
        // 第二次信号：强制退出
        process.exit(1);
      }
      shuttingDown = true;
      logger.info({ signal }, "收到退出信号，正在关闭服务");
      cronTasks.forEach((t) => t.stop());
      stopScheduler();
      eventBus.removeAllListeners();
      try {
        await app.close();
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "关闭 Fastify 失败");
      } finally {
        // 无论 app.close 是否抛错都要关闭 DB，避免连接泄漏
        closeDb();
      }
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (err) {
    logger.error({ err }, "服务启动失败");
    process.exit(1);
  }
}

void start();
