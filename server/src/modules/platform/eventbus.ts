// 统一事件总线：基于 Node events.EventEmitter 的进程内单例
// 对应方案中的 RocketMQ 等价（三中心异步解耦），预留 BullMQ 升级
import { EventEmitter } from "node:events";
import { logger } from "../../utils/logger.js";

/** 系统事件类型 */
export type PlatformEvent =
  | "risk.warning.created" // 风险预警生成
  | "workorder.advanced" // 工单流转
  | "collection.failed" // 采集失败
  | "collection.quality.issue"; // 数据质量问题

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // 三中心多消费者
  }

  /** 发布事件 */
  override emit(event: PlatformEvent | string, ...args: unknown[]): boolean {
    logger.debug({ event }, "事件总线 emit");
    return super.emit(event, ...args);
  }

  /** 订阅事件 */
  override on(event: PlatformEvent | string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }
}

/** 事件总线单例 */
export const eventBus = new EventBus();

/** 注册三中心默认事件消费者（在 main.ts 启动序列中调用） */
export function registerEventBusConsumers(): void {
  // 风险告警自动派单：high 级别风险预警自动创建核查工单
  eventBus.on("risk.warning.created", (payload: unknown) => {
    logger.info({ payload }, "[EventBus] 收到 risk.warning.created，触发自动派单（占位）");
    // 实际派单逻辑在 dispatch 模块（Task 后续）实现
  });
  eventBus.on("workorder.advanced", (payload: unknown) => {
    logger.info({ payload }, "[EventBus] 收到 workorder.advanced");
  });
  eventBus.on("collection.failed", (payload: unknown) => {
    logger.warn({ payload }, "[EventBus] 收到 collection.failed，触发采集告警");
  });
  eventBus.on("collection.quality.issue", (payload: unknown) => {
    logger.warn({ payload }, "[EventBus] 收到 collection.quality.issue，触发质量告警");
  });
  logger.info("事件总线消费者已注册");
}
