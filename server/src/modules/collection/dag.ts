// DAG 拓扑排序：按 depends_on 串行触发依赖链
import { queryAll, queryOne } from "../../db/index.js";
import { logger } from "../../utils/logger.js";
import { runTask } from "./runtime.js";

interface TaskDep {
  id: string;
  depends_on: string | null;
  enabled: number;
}

/** 拓扑排序：返回按依赖顺序的任务 ID 数组（依赖在前） */
export function topoSort(tasks: TaskDep[]): string[] {
  const map = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const result: string[] = [];
  const visiting = new Set<string>();

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      logger.warn({ taskId: id }, "检测到循环依赖，跳过");
      return;
    }
    visiting.add(id);
    const t = map.get(id);
    if (t?.depends_on) {
      try {
        const deps = JSON.parse(t.depends_on) as string[];
        for (const d of deps) {
          if (map.has(d)) visit(d);
        }
      } catch {
        // depends_on 不是 JSON 数组，跳过
      }
    }
    visiting.delete(id);
    visited.add(id);
    result.push(id);
  }

  for (const t of tasks) visit(t.id);
  return result;
}

/** 加载所有启用任务（用于 DAG 排序） */
function loadEnabledTasks(): TaskDep[] {
  return queryAll<TaskDep>(
    "SELECT id, depends_on, enabled FROM collection_tasks WHERE enabled = 1",
  );
}

/** 按 DAG 串行执行：根任务触发后，等其完成后递归触发下游 */
export async function runDag(rootTaskId: string): Promise<void> {
  const tasks = loadEnabledTasks();
  const map = new Map(tasks.map((t) => [t.id, t]));

  // 收集 root 任务及其下游（BFS 反向：先找到所有 depends_on 包含 root 的任务）
  const downstream = (id: string): string[] => {
    const result: string[] = [];
    for (const t of tasks) {
      if (t.depends_on) {
        try {
          const deps = JSON.parse(t.depends_on) as string[];
          if (deps.includes(id)) result.push(t.id);
        } catch {
          // ignore
        }
      }
    }
    return result;
  };

  async function runRecursive(taskId: string): Promise<void> {
    if (!map.has(taskId)) {
      logger.warn({ taskId }, "DAG 任务不存在或未启用，跳过");
      return;
    }
    const result = await runTask(taskId);
    if (result.status !== "success") {
      logger.warn(
        { taskId, status: result.status, error: result.error },
        "DAG 节点失败，停止下游触发",
      );
      return;
    }
    // 触发下游
    const children = downstream(taskId);
    for (const child of children) {
      await runRecursive(child);
    }
  }

  await runRecursive(rootTaskId);
}

/** 校验任务依赖图无环（启动时调用） */
export function validateDag(): { hasCycle: boolean; cyclicTasks: string[] } {
  const tasks = loadEnabledTasks();
  const map = new Map(tasks.map((t) => [t.id, t]));
  const cyclic: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string, path: string[]): boolean {
    if (visited.has(id)) return false;
    if (visiting.has(id)) {
      // 找到环
      const cycleStart = path.indexOf(id);
      for (const p of path.slice(cycleStart)) cyclic.push(p);
      cyclic.push(id);
      return true;
    }
    visiting.add(id);
    path.push(id);
    const t = map.get(id);
    if (t?.depends_on) {
      try {
        const deps = JSON.parse(t.depends_on) as string[];
        for (const d of deps) {
          if (map.has(d) && visit(d, path)) return true;
        }
      } catch {
        // ignore
      }
    }
    visiting.delete(id);
    path.pop();
    visited.add(id);
    return false;
  }

  for (const t of tasks) {
    if (visit(t.id, [])) {
      return { hasCycle: true, cyclicTasks: [...new Set(cyclic)] };
    }
  }
  return { hasCycle: false, cyclicTasks: [] };
}

void queryOne;
