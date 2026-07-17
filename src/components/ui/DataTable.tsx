import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  title: ReactNode;
  /** 渲染单元格：接收行数据，返回 ReactNode */
  render?: (row: T, idx: number) => ReactNode;
  /** 单元格 class，用于覆盖宽度/对齐/粘性列 */
  className?: string;
  /** 表头 class */
  headClassName?: string;
  /** 是否首列粘性（横向滚动时） */
  sticky?: boolean;
  /** 列宽 */
  width?: number | string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** 行 key 取值函数 */
  rowKey: (row: T, idx: number) => string;
  /** 行点击 */
  onRowClick?: (row: T, idx: number) => void;
  /** 空态文案 */
  empty?: ReactNode;
  /** 表格容器 class */
  className?: string;
  /** 行 class 计算 */
  rowClassName?: (row: T, idx: number) => string;
}

export default function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  empty = "暂无数据",
  className,
  rowClassName,
}: DataTableProps<T>) {
  return (
    <div className={cn("ds-table-wrap", className)}>
      <table className="ds-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(col.sticky && "sticky-col", col.headClassName)}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-center"
                style={{ color: "var(--color-on-surface-variant)", padding: "32px" }}
              >
                {empty}
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={rowKey(row, idx)}
                onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
                className={cn(
                  onRowClick && "cursor-pointer",
                  rowClassName?.(row, idx),
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(col.sticky && "sticky-col", col.className)}
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.render ? col.render(row, idx) : (row as Record<string, ReactNode>)[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
