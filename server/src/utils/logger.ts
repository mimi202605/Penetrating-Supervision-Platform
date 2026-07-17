// 统一日志：基于 pino，开发环境启用 pino-pretty 美化输出
import pino from "pino";
import { config } from "../config.js";

const isPretty = config.isDev;

export const logger = pino(
  isPretty
    ? {
        level: process.env.LOG_LEVEL || "info",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }
    : {
        level: process.env.LOG_LEVEL || "info",
      },
);

export type Logger = typeof logger;
