import { useEffect, useState } from "react";
import { SlidersHorizontal, Play, FlaskConical } from "lucide-react";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import Stat from "@/components/ui/Stat";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import Drawer from "@/components/ui/Drawer";
import { api } from "@/api";
import type { LinkageRule } from "@/api/types";

export default function RulesModelsPage() {
  const [rules, setRules] = useState<LinkageRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [testOpen, setTestOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<LinkageRule | null>(null);
  const [entryEntity, setEntryEntity] = useState("");
  const [testResult, setTestResult] = useState<unknown>(null);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    api.listLinkageRules().then((r) => { setRules(r); setLoading(false); });
  }, []);

  // 模型数 = scene 数（5），从监管场景派生展示
  const [modelCount] = useState(5);

  const openTest = (r: LinkageRule) => {
    setTestTarget(r);
    setEntryEntity("");
    setTestResult(null);
    setTestOpen(true);
  };

  const onTest = () => {
    if (!testTarget || !entryEntity.trim()) { showToast("请输入入口实体", "warning"); return; }
    setTesting(true);
    api.executeLinkageRule(testTarget.id, entryEntity.trim())
      .then((res) => { setTestResult(res); showToast("联查测试完成", "success"); })
      .catch(() => showToast("测试失败", "error"))
      .finally(() => setTesting(false));
  };

  const columns: Column<LinkageRule>[] = [
    { key: "name", title: "规则", sticky: true, render: (r) => (
      <div>
        <div className="font-medium" style={{ color: "var(--color-foreground)" }}>{r.name}</div>
        <div className="td-mono text-caption" style={{ color: "var(--color-on-surface-variant)" }}>{r.id}</div>
      </div>
    ) },
    { key: "sceneId", title: "场景", render: (r) => <span className="td-mono text-caption">{r.sceneId ?? "—"}</span> },
    { key: "drillPath", title: "穿透路径", render: (r) => (
      <div className="flex items-center gap-1">
        {r.drillPath.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            <StatusTag tone="info">{p}</StatusTag>
            {i < r.drillPath.length - 1 ? <span style={{ color: "var(--color-on-surface-variant)" }}>→</span> : null}
          </span>
        ))}
      </div>
    ) },
    { key: "description", title: "说明", render: (r) => <span className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{r.description ?? "—"}</span> },
    { key: "actions", title: "操作", render: (r) => (
      <button type="button" className="ds-btn ds-btn-secondary" onClick={() => openTest(r)}><FlaskConical size={12} />在线测试</button>
    ) },
  ];

  return (
    <AdminPageContainer
      title="规则与模型"
      subtitle="监管配置 · 10 条联查规则 + 5 个监管模型，在线联查测试"
      breadcrumb="监管配置 / 规则与模型"
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={<SlidersHorizontal size={16} strokeWidth={1.5} />} label="联查规则" value={rules.length} countUp decimals={0} trend={{ text: "10 条", tone: "info" }} />
          <Stat icon={<Play size={16} strokeWidth={1.5} />} label="监管模型" value={modelCount} countUp decimals={0} trend={{ text: "finance-risk", tone: "info" }} />
          <Stat icon={<FlaskConical size={16} strokeWidth={1.5} />} label="可测试" value={rules.length} countUp decimals={0} trend={{ text: "在线", tone: "success" }} />
          <Stat icon={<SlidersHorizontal size={16} strokeWidth={1.5} />} label="穿透层级" value={4} countUp decimals={0} trend={{ text: "ADS→ODS", tone: "info" }} />
        </div>

        <section className="ds-card">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="ds-section-title">联查规则列表</h2>
            <span className="ds-section-sub">{loading ? "加载中…" : `共 ${rules.length} 条`}</span>
          </div>
          <DataTable columns={columns} data={rules} rowKey={(r) => r.id} empty="暂无规则" />
        </section>
      </div>

      <Drawer
        open={testOpen} onClose={() => setTestOpen(false)}
        title={testTarget ? `联查测试 · ${testTarget.name}` : "联查测试"} width={520}
        footer={
          <>
            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setTestOpen(false)}>关闭</button>
            <button type="button" className="ds-btn ds-btn-primary" disabled={testing} onClick={onTest}><Play size={14} />{testing ? "测试中…" : "执行联查"}</button>
          </>
        }
      >
        {testTarget ? (
          <div className="flex flex-col gap-4">
            <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{testTarget.description ?? "—"}</div>
            <div>
              <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>入口实体（ADS 层指标 ID）</label>
              <input type="text" className="ds-input w-full" value={entryEntity} onChange={(e) => setEntryEntity(e.target.value)} placeholder="如：ads-dup-pay" />
            </div>
            <div className="text-caption" style={{ color: "var(--color-on-surface-variant)" }}>穿透路径：{testTarget.drillPath.join(" → ")}</div>
            {testResult ? (
              <div>
                <div className="text-body mb-2" style={{ color: "var(--color-foreground)" }}>联查结果链：</div>
                <pre className="td-mono text-caption p-3 rounded-sm overflow-x-auto" style={{ background: "var(--color-surface-container)", color: "var(--color-foreground)" }}>{JSON.stringify(testResult, null, 2)}</pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      {toast ? <div className="fixed top-4 right-4 z-[400]"><StatusTag tone={toast.tone} dot>{toast.text}</StatusTag></div> : null}
    </AdminPageContainer>
  );
}
