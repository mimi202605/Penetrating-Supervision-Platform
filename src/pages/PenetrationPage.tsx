import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Building2, ChevronRight, ChevronDown, Network } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import Segmented from "@/components/ui/Segmented";
import StatusTag from "@/components/ui/StatusTag";
import { api } from "@/api";

type PenDimension = "subject" | "fund" | "contract" | "project";

interface TreeNode {
  id: string;
  name: string;
  type: string;
  level: number;
  metrics: { assets: string; revenue: string; risk: number };
  children?: TreeNode[];
}

const dimensionLabels: Record<PenDimension, string> = {
  subject: "主体穿透",
  fund: "资金穿透",
  contract: "合同穿透",
  project: "项目穿透",
};

export default function PenetrationPage() {
  const [params, setParams] = useSearchParams();
  const [dimension, setDimension] = useState<PenDimension>("subject");
  const [keyword, setKeyword] = useState(params.get("q") ?? "新兴铸管");
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [selected, setSelected] = useState<TreeNode | null>(null);

  useEffect(() => {
    api.getPenetrationTree().then((t) => {
      setTree(t as TreeNode);
      setSelected(t as TreeNode);
    }).catch(() => {});
  }, []);

  // URL 参数 q 变化时同步 keyword（顶栏搜索跳转过来时也能更新关键字）
  useEffect(() => {
    const q = params.get("q");
    if (q !== null && q !== keyword) setKeyword(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(keyword ? { q: keyword } : {});
  };

  const flattenResults = useMemo(() => {
    if (!tree) return [];
    const lowerKeyword = keyword.toLowerCase();
    const results: TreeNode[] = [];
    const walk = (n: TreeNode) => {
      if (
        n.name.toLowerCase().includes(lowerKeyword) ||
        n.type.toLowerCase().includes(lowerKeyword)
      )
        results.push(n);
      n.children?.forEach(walk);
    };
    walk(tree);
    return results;
  }, [tree, keyword]);

  return (
    <PageContainer
      title="穿透查询"
      subtitle="智慧监督中心 · 全级次组织 / 全链条业务 / 全过程时间 / 全要素对象穿透"
      breadcrumb="智慧监督中心 / 穿透查询"
    >
      <div className="flex flex-col gap-5">
        {/* 搜索区 */}
        <section className="ds-card">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Segmented<PenDimension>
              value={dimension}
              onChange={setDimension}
              options={[
                { value: "subject", label: "主体穿透" },
                { value: "fund", label: "资金穿透" },
                { value: "contract", label: "合同穿透" },
                { value: "project", label: "项目穿透" },
              ]}
            />
            <span
              className="text-body"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              当前维度：{dimensionLabels[dimension]}
            </span>
          </div>
          <form onSubmit={onSearch} className="flex items-center gap-2">
            <div className="ds-input flex-1 max-w-[480px]">
              <Search size={14} style={{ color: "var(--color-on-surface-variant)" }} />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="输入主体/资金/合同/项目关键字进行穿透查询"
              />
            </div>
            <button type="submit" className="ds-btn ds-btn-primary">
              穿透查询
            </button>
          </form>
          {keyword && flattenResults.length > 0 ? (
            <div
              className="mt-3 text-caption"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              命中 <b style={{ color: "var(--color-foreground)" }}>{flattenResults.length}</b> 条结果，已自动定位至首条
            </div>
          ) : null}
        </section>

        {/* 树 + 详情 */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
          {/* 树 */}
          <section className="ds-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="ds-section-title">层级下钻</h2>
              <span className="ds-section-sub">集团 → 板块 → 二级 → 三级 → 凭证/流水</span>
            </div>
            {tree ? <TreeView node={tree} selected={selected} onSelect={setSelected} /> : null}
          </section>

          {/* 详情 */}
          <section className="ds-card">
            <h2 className="ds-section-title mb-3">详情</h2>
            {selected ? <NodeDetail node={selected} /> : (
              <div className="text-center py-12" style={{ color: "var(--color-on-surface-variant)" }}>
                <Network size={32} className="mx-auto mb-2" style={{ opacity: 0.5 }} />
                选择左侧节点查看详情
              </div>
            )}
          </section>
        </div>
      </div>
    </PageContainer>
  );
}

function TreeView({
  node,
  depth = 0,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth?: number;
  selected: TreeNode | null;
  onSelect: (n: TreeNode) => void;
}) {
  return <TreeRow node={node} depth={depth} selected={selected} onSelect={onSelect} />;
}

function TreeRow({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: TreeNode | null;
  onSelect: (n: TreeNode) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isSelected = selected?.id === node.id;

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1.5 px-2 rounded-sm cursor-pointer transition-colors hover:bg-[var(--state-hover)]"
        style={{ paddingLeft: depth * 16 + 8, background: isSelected ? "var(--color-primary-container)" : undefined }}
        onClick={() => {
          onSelect(node);
          if (hasChildren) setOpen((v) => !v);
        }}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown size={14} style={{ color: "var(--color-on-surface-variant)" }} />
          ) : (
            <ChevronRight size={14} style={{ color: "var(--color-on-surface-variant)" }} />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <Building2
          size={14}
          style={{
            color: node.level <= 2 ? "var(--color-primary)" : "var(--color-on-surface-variant)",
            flexShrink: 0,
          }}
        />
        <span
          className="text-lead truncate"
          style={{ color: isSelected ? "var(--color-primary)" : "var(--color-foreground)", fontWeight: isSelected ? 500 : 400 }}
        >
          {node.name}
        </span>
        <span
          className="text-caption ml-auto px-1.5 py-0.5 rounded-sm flex-shrink-0"
          style={{ background: "var(--color-surface-container)", color: "var(--color-on-surface-variant)" }}
        >
          {node.type}
        </span>
      </div>
      {hasChildren && open ? (
        <div>
          {node.children!.map((c) => (
            <TreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NodeDetail({ node }: { node: TreeNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div
          className="text-caption mb-1"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          节点名称
        </div>
        <div
          className="text-h3 font-medium"
          style={{ color: "var(--color-foreground)" }}
        >
          {node.name}
        </div>
        <div
          className="text-body mt-0.5"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          {node.type} · 第 {node.level} 级
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {([
          { label: "资产规模", value: node.metrics.assets },
          { label: "营业收入", value: node.metrics.revenue },
          { label: "风险评分", value: String(node.metrics.risk) },
        ] as const).map((m) => (
          <div
            key={m.label}
            className="rounded-sm p-2.5 flex flex-col gap-1"
            style={{ background: "var(--color-surface-container)" }}
          >
            <span className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>
              {m.label}
            </span>
            <span
              className="text-h3 font-semibold leading-none"
              style={{ color: "var(--color-foreground)" }}
            >
              {m.value}
            </span>
          </div>
        ))}
      </div>

      <div>
        <div
          className="text-caption mb-2"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          风险等级
        </div>
        {node.metrics.risk >= 25 ? (
          <StatusTag tone="error" dot>高风险</StatusTag>
        ) : node.metrics.risk >= 10 ? (
          <StatusTag tone="warning" dot>中风险</StatusTag>
        ) : (
          <StatusTag tone="success" dot>低风险</StatusTag>
        )}
      </div>

      <div>
        <div
          className="text-caption mb-2"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          下级节点
        </div>
        <div className="text-body" style={{ color: "var(--color-foreground)" }}>
          {node.children?.length ?? 0} 个直接下级
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button className="ds-btn ds-btn-primary flex-1">导出审计证据链</button>
        <button className="ds-btn ds-btn-secondary">关联图谱</button>
      </div>
    </div>
  );
}
