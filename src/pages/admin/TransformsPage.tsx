import { useEffect, useState } from "react";
import { GitBranch, Plus, Trash2, Eye } from "lucide-react";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import Drawer from "@/components/ui/Drawer";
import { api } from "@/api";
import type { TransformType, TransformStep } from "@/api/types";

export default function TransformsPage() {
  const [types, setTypes] = useState<TransformType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TransformType | null>(null);
  const [steps, setSteps] = useState<TransformStep[]>([]);
  const [configText, setConfigText] = useState("{}");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewOut, setPreviewOut] = useState<unknown>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    api.listTransformTypes().then((t) => { setTypes(t); setLoading(false); });
  }, []);

  const addStep = () => {
    if (!selected) { showToast("请先选择 Transform 类型", "warning"); return; }
    let config = {};
    try { config = JSON.parse(configText); } catch { showToast("配置 JSON 解析失败，使用空对象", "warning"); }
    setSteps((prev) => [...prev, { id: `step-${Date.now()}`, type: selected.type, config, onError: "skip" }]);
    setConfigText("{}");
  };

  const removeStep = (id: string) => setSteps((prev) => prev.filter((s) => s.id !== id));

  const onPreview = () => {
    if (steps.length === 0) { showToast("请先添加管道步骤", "warning"); return; }
    setPreviewOpen(true);
    setPreviewLoading(true);
    const sample = { voucherNo: "V20260716001", amount: 8600000, payee: "Everwin Holdings", accountDate: "2026-07-16" };
    api.previewTransform(sample, { steps })
      .then((out) => setPreviewOut(out))
      .catch(() => showToast("预览失败", "error"))
      .finally(() => setPreviewLoading(false));
  };

  return (
    <AdminPageContainer
      title="Transform 管道"
      subtitle="数据采集运维 · 13 类 Transform 配置、管道编排、预览"
      breadcrumb="数据采集运维 / Transform 管道"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* 左：Transform 类型列表 */}
        <section className="ds-card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
            <h2 className="ds-section-title">Transform 类型</h2>
            <div className="ds-section-sub">{loading ? "加载中…" : `共 ${types.length} 类`}</div>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {types.map((t) => (
              <button key={t.type} type="button" onClick={() => setSelected(t)}
                className="w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors"
                style={{
                  background: selected?.type === t.type ? "var(--color-primary-container)" : "transparent",
                  borderBottom: "1px solid var(--color-border)",
                }}>
                <div className="min-w-0">
                  <div className="text-lead font-medium truncate" style={{ color: selected?.type === t.type ? "var(--color-primary)" : "var(--color-foreground)" }}>{t.name}</div>
                  <div className="td-mono text-caption" style={{ color: "var(--color-on-surface-variant)" }}>{t.type}</div>
                </div>
                <GitBranch size={14} style={{ color: "var(--color-on-surface-variant)" }} />
              </button>
            ))}
          </div>
        </section>

        {/* 右：管道编排 */}
        <section className="ds-card">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="ds-section-title">管道编排</h2>
            <div className="flex items-center gap-2">
              <button type="button" className="ds-btn ds-btn-secondary" onClick={onPreview}><Eye size={12} />预览</button>
              <button type="button" className="ds-btn ds-btn-primary" onClick={addStep}><Plus size={12} />添加步骤</button>
            </div>
          </div>

          {/* 当前选中类型 + 配置 */}
          <div className="mb-4 p-3 rounded-sm" style={{ background: "var(--color-surface-container)" }}>
            <div className="text-body mb-2" style={{ color: "var(--color-foreground)" }}>
              当前类型：<span className="font-medium">{selected ? selected.name : "未选择"}</span>
            </div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-on-surface-variant)" }}>步骤配置（JSON）</label>
            <textarea className="w-full ds-input min-h-[80px] font-mono text-caption" value={configText} onChange={(e) => setConfigText(e.target.value)} placeholder='{"mapping": {}, "includeOnly": false}' />
          </div>

          {/* 步骤列表 */}
          <div className="flex flex-col gap-2">
            {steps.length === 0 ? <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>暂无步骤，选择类型后点击「添加步骤」</div> : null}
            {steps.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-sm" style={{ background: "var(--color-surface-container)" }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-caption font-medium flex-shrink-0" style={{ background: "var(--color-primary)", color: "#fff" }}>{idx + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-lead font-medium" style={{ color: "var(--color-foreground)" }}>{s.type}</div>
                  <div className="td-mono text-caption truncate" style={{ color: "var(--color-on-surface-variant)" }}>{JSON.stringify(s.config)}</div>
                </div>
                <StatusTag tone="info">{s.onError}</StatusTag>
                <button type="button" className="ds-icon-btn" title="删除" onClick={() => removeStep(s.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Drawer
        open={previewOpen} onClose={() => setPreviewOpen(false)}
        title="管道预览结果" width={560}
        footer={<button type="button" className="ds-btn ds-btn-secondary" onClick={() => setPreviewOpen(false)}>关闭</button>}
      >
        {previewLoading ? <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>预览中…</div> : null}
        {!previewLoading && previewOut ? (
          <pre className="td-mono text-caption p-3 rounded-sm overflow-x-auto" style={{ background: "var(--color-surface-container)", color: "var(--color-foreground)" }}>{JSON.stringify(previewOut, null, 2)}</pre>
        ) : null}
      </Drawer>

      {toast ? <div className="fixed top-4 right-4 z-[400]"><StatusTag tone={toast.tone} dot>{toast.text}</StatusTag></div> : null}
    </AdminPageContainer>
  );
}
