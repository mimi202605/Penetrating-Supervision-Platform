// 数据采集中心 - 数据质量校验（Great Expectations 等价）
// 5 类校验规则：非空 / 值域 / 长度 / 跨表一致 / 日期合法
// 模拟：随机生成 0-2 条 data_quality_issues，并通过事件总线告警
import { execute } from "../../db/index.js";
import { eventBus } from "../platform/eventbus.js";
import { logger } from "../../utils/logger.js";

/** 5 类校验规则元信息（用于随机生成质量问题） */
const QUALITY_RULES = [
  { field: "amount", rule: "非空校验", severity: "high", detail: "金额字段存在空值" },
  { field: "account_no", rule: "值域校验", severity: "medium", detail: "账号格式不在合法值域" },
  { field: "name", rule: "长度校验", severity: "low", detail: "字段长度超出阈值" },
  { field: "org_id", rule: "跨表一致校验", severity: "high", detail: "组织ID在主数据表中不存在" },
  { field: "ts", rule: "日期合法校验", severity: "medium", detail: "交易时间格式非法" },
] as const;

/**
 * 运行数据质量校验（Great Expectations 等价）
 * 模拟：随机生成 0-2 条 data_quality_issues，并 emit collection.quality.issue 事件
 * @param taskId 采集任务ID
 * @param records 本次采集记录数
 */
export function runQualityCheck(taskId: string, records: number): void {
  // 模拟：70% 概率无问题，30% 概率产生 1-2 条问题
  const issueCount = Math.random() < 0.3 ? Math.floor(Math.random() * 2) + 1 : 0;
  for (let i = 0; i < issueCount; i++) {
    const r = QUALITY_RULES[Math.floor(Math.random() * QUALITY_RULES.length)];
    execute(
      "INSERT INTO data_quality_issues (task_id, field, rule, severity, detail) VALUES (?, ?, ?, ?, ?)",
      [taskId, r.field, r.rule, r.severity, `${r.detail}（采样记录 ${records} 条）`],
    );
    eventBus.emit("collection.quality.issue", {
      taskId,
      field: r.field,
      rule: r.rule,
      severity: r.severity,
      detail: r.detail,
    });
    logger.warn({ taskId, rule: r.rule, field: r.field }, "数据质量校验发现问题");
  }
  logger.debug({ taskId, issueCount }, "数据质量校验完成");
}
