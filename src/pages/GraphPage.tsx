import { useEffect, useMemo, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, RefreshCw } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import StatusTag from "@/components/ui/StatusTag";
import { api } from "@/api";
import type { GraphNode, GraphEdge } from "@/api/types";

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}

const typeColorMap: Record<GraphNode["type"], string> = {
  org: "#1664ff",
  account: "#7ccd94",
  counterparty: "#f0a50f",
  person: "#ff706d",
};

const typeLabelMap: Record<GraphNode["type"], string> = {
  org: "组织",
  account: "账户",
  counterparty: "交易对手",
  person: "人员",
};

const VIEW_W = 960;
const VIEW_H = 560;

export default function GraphPage() {
  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const loadGraph = () => {
    api.getGraph().then(({ nodes: ns, edges: es }) => {
      // 简易圆形布局（避免引入额外图谱库）
      const placed = ns.map((n, i) => {
        // 中心节点 + 圆环
        if (i === 0) return { ...n, x: VIEW_W / 2, y: VIEW_H / 2 };
        const ring = Math.floor((i - 1) / 6);
        const idx = (i - 1) % 6;
        const radius = 130 + ring * 110;
        const angle = (idx / 6) * Math.PI * 2 + ring * 0.3;
        return {
          ...n,
          x: VIEW_W / 2 + Math.cos(angle) * radius,
          y: VIEW_H / 2 + Math.sin(angle) * radius * 0.7,
        };
      });
      setNodes(placed);
      setEdges(es);
    }).catch(() => {});
  };

  useEffect(() => {
    loadGraph();
  }, []);

  const nodeMap = useMemo(() => {
    const m = new Map<string, PositionedNode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  const highlightedNodeIds = useMemo(() => {
    if (!hovered && !selected) return null;
    const target = hovered ?? selected;
    if (!target) return null;
    const set = new Set<string>([target]);
    edges.forEach((e) => {
      if (e.source === target) set.add(e.target);
      if (e.target === target) set.add(e.source);
    });
    return set;
  }, [hovered, selected, edges]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selected) ?? null,
    [nodes, selected],
  );

  const relatedEdges = useMemo(() => {
    if (!selected) return [];
    return edges.filter((e) => e.source === selected || e.target === selected);
  }, [edges, selected]);

  return (
    <PageContainer
      title="关系图谱"
      subtitle="智慧监督中心 · 账户 - 交易对手 - 组织 - 人员 多维关联溯源"
      breadcrumb="智慧监督中心 / 关系图谱"
      actions={
        <>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            className="ds-icon-btn"
            aria-label="缩小"
          >
            <ZoomOut size={16} />
          </button>
          <span
            className="text-caption min-w-[36px] text-center"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
            className="ds-icon-btn"
            aria-label="放大"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="ds-icon-btn"
            aria-label="重置"
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            onClick={loadGraph}
            className="ds-icon-btn"
            aria-label="刷新"
          >
            <RefreshCw size={16} />
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* 图谱画布 */}
        <section className="ds-card p-0 overflow-hidden">
          <div
            className="relative w-full"
            style={{
              height: 600,
              background:
                "radial-gradient(ellipse at center, var(--color-surface-container) 0%, var(--color-bg) 80%)",
            }}
          >
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="w-full h-full"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 200ms ease-out" }}
            >
              {/* 边 */}
              {edges.map((e, i) => {
                const s = nodeMap.get(e.source);
                const t = nodeMap.get(e.target);
                if (!s || !t) return null;
                const active = highlightedNodeIds
                  ? highlightedNodeIds.has(e.source) && highlightedNodeIds.has(e.target)
                  : true;
                return (
                  <g key={i} opacity={active ? 1 : 0.15} style={{ transition: "opacity 200ms" }}>
                    <line
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke="var(--color-border)"
                      strokeWidth={e.weight && e.weight >= 2 ? 1.6 : 1}
                      strokeDasharray={e.weight && e.weight >= 2 ? "0" : "4 3"}
                    />
                    {e.label ? (
                      <text
                        x={(s.x + t.x) / 2}
                        y={(s.y + t.y) / 2 - 4}
                        fill="var(--color-on-surface-variant)"
                        fontSize="10"
                        textAnchor="middle"
                        style={{ pointerEvents: "none" }}
                      >
                        {e.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              {/* 节点 */}
              {nodes.map((n) => {
                const active = highlightedNodeIds ? highlightedNodeIds.has(n.id) : true;
                const isSel = selected === n.id;
                const r = n.type === "org" ? 24 : 18;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    opacity={active ? 1 : 0.3}
                    style={{ cursor: "pointer", transition: "opacity 200ms" }}
                    onMouseEnter={() => setHovered(n.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected(n.id)}
                  >
                    <circle
                      r={r}
                      fill={typeColorMap[n.type]}
                      opacity={0.18}
                    />
                    <circle
                      r={r - 4}
                      fill="var(--color-surface)"
                      stroke={typeColorMap[n.type]}
                      strokeWidth={isSel ? 2.5 : 1.5}
                    />
                    <text
                      y={r + 12}
                      fill="var(--color-foreground)"
                      fontSize="11"
                      fontWeight={isSel ? 600 : 400}
                      textAnchor="middle"
                      style={{ pointerEvents: "none" }}
                    >
                      {n.label.length > 10 ? n.label.slice(0, 10) + "…" : n.label}
                    </text>
                    {n.meta ? (
                      <text
                        y={r + 24}
                        fill="var(--color-on-surface-variant)"
                        fontSize="9"
                        textAnchor="middle"
                        style={{ pointerEvents: "none" }}
                      >
                        {n.meta}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
          {/* 图例 */}
          <div
            className="flex items-center gap-4 px-4 py-2 border-t flex-wrap"
            style={{ borderColor: "var(--color-border)" }}
          >
            {(["org", "account", "counterparty", "person"] as const).map((t) => (
              <span
                key={t}
                className="flex items-center gap-1.5 text-caption"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: typeColorMap[t] }}
                />
                {typeLabelMap[t]}
              </span>
            ))}
            <span
              className="text-caption ml-auto"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              提示：点击节点查看详情，悬停高亮关联
            </span>
          </div>
        </section>

        {/* 详情面板 */}
        <section className="ds-card">
          <h2 className="ds-section-title mb-3">节点详情</h2>
          {selectedNode ? (
            <div className="flex flex-col gap-4">
              <div>
                <div
                  className="text-h3 font-medium mb-1"
                  style={{ color: "var(--color-foreground)" }}
                >
                  {selectedNode.label}
                </div>
                <StatusTag tone="info">{typeLabelMap[selectedNode.type]}</StatusTag>
              </div>
              {selectedNode.meta ? (
                <div
                  className="p-2.5 rounded-sm text-lead td-mono"
                  style={{
                    background: "var(--color-surface-container)",
                    color: "var(--color-foreground)",
                  }}
                >
                  {selectedNode.meta}
                </div>
              ) : null}
              <div>
                <div
                  className="text-caption mb-2"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  关联关系（{relatedEdges.length}）
                </div>
                <div className="flex flex-col gap-2">
                  {relatedEdges.map((e, i) => {
                    const otherId = e.source === selectedNode.id ? e.target : e.source;
                    const other = nodeMap.get(otherId);
                    if (!other) return null;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded-sm cursor-pointer hover:bg-[var(--state-hover)]"
                        style={{ background: "var(--color-surface-container)" }}
                        onClick={() => setSelected(otherId)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: typeColorMap[other.type] }}
                          />
                          <span
                            className="text-body truncate"
                            style={{ color: "var(--color-foreground)" }}
                          >
                            {other.label}
                          </span>
                        </div>
                        {e.label ? (
                          <span
                            className="text-caption ml-2 flex-shrink-0"
                            style={{ color: "var(--color-on-surface-variant)" }}
                          >
                            {e.label}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div
              className="text-center py-12 text-body"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              点击图谱节点查看详情
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
