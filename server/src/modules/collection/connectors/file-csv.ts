// CSV 文件连接器（基于 papaparse，真实实现）
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import Papa from "papaparse";
import type { ConnectorSpec, StreamCatalog, ReadContext, TestResult } from "./types.js";
import type { ConnectorInstance } from "./registry.js";
import { fileCsvSpec } from "./catalog.js";

export class FileCsvConnector implements ConnectorInstance {
  readonly spec: ConnectorSpec = fileCsvSpec;

  async test(config: Record<string, unknown>): Promise<TestResult> {
    const t0 = Date.now();
    const path = String(config.path || "");
    if (!path) {
      return { status: "offline", latencyMs: Date.now() - t0, error: "path 必填" };
    }
    try {
      await access(path);
      return { status: "online", latencyMs: Date.now() - t0 };
    } catch (err) {
      return { status: "offline", latencyMs: Date.now() - t0, error: (err as Error).message };
    }
  }

  async discover(config: Record<string, unknown>): Promise<StreamCatalog> {
    const path = String(config.path || "");
    const hasHeader = config.hasHeader !== false;
    if (!path) return { streams: [] };
    // 读取首行解析列
    return new Promise((resolve, reject) => {
      const stream = createReadStream(path, { encoding: (config.encoding as BufferEncoding) || "utf-8" });
      const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
        header: hasHeader,
        skipEmptyLines: true,
      });
      let fields: Array<{ name: string; type: string; nullable: boolean }> = [];
      parser.on("data", (row: Record<string, unknown>) => {
        fields = Object.keys(row).map((n) => ({ name: n, type: "string", nullable: true }));
        parser.end();
      });
      stream.on("data", (chunk) => parser.write(chunk));
      stream.on("end", () => {
        parser.end();
      });
      parser.on("end", () => {
        resolve({
          streams: [
            {
              name: path.split("/").pop() || "file",
              fields,
              supportedModes: ["full"],
            },
          ],
        });
      });
      stream.on("error", reject);
      parser.on("error", reject);
    });
  }

  async *read(ctx: ReadContext): AsyncIterable<Record<string, unknown>> {
    const path = String(ctx.config.path || "");
    const hasHeader = ctx.config.hasHeader !== false;
    const delimiter = (ctx.config.delimiter as string) || ",";
    // 按 split.range（行号范围）切片
    const range = ctx.split?.range as [number, number] | undefined;
    const startLine = range ? Number(range[0]) : 0;
    const endLine = range ? Number(range[1]) : Number.MAX_SAFE_INTEGER;
    const stream = createReadStream(path, { encoding: (ctx.config.encoding as BufferEncoding) || "utf-8" });
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, { header: hasHeader, skipEmptyLines: true, delimiter });
    let lineNo = 0;
    const queue: Array<Record<string, unknown>> = [];
    let resolveWait: (() => void) | null = null;
    let done = false;
    parser.on("data", (row: Record<string, unknown>) => {
      lineNo++;
      if (lineNo < startLine) return;
      if (lineNo > endLine) {
        done = true;
        parser.end();
        stream.destroy();
        if (resolveWait) resolveWait();
        return;
      }
      queue.push(row);
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    });
    parser.on("error", () => {
      done = true;
      if (resolveWait) resolveWait();
    });
    stream.on("data", (chunk) => parser.write(chunk));
    stream.on("end", () => {
      parser.end();
    });
    stream.on("error", () => {
      done = true;
      if (resolveWait) resolveWait();
    });
    parser.on("end", () => {
      done = true;
      if (resolveWait) resolveWait();
    });
    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((r) => {
          resolveWait = r;
        });
      }
      while (queue.length > 0) {
        yield queue.shift()!;
      }
    }
  }
}
