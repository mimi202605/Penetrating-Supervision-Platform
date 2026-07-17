import { useEffect, useState } from "react";
import { Layers, Power, Link2 } from "lucide-react";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import Stat from "@/components/ui/Stat";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import { api } from "@/api";
import type { RegulatoryScene, LinkageRule } from "@/api/types";

export default function ScenesPage() {
  const [scenes, setScenes] = useState<RegulatoryScene[]>([]);
  const [rules, setRules] = useState<LinkageRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabledSet, setEnabledSet] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    Promise.all([api.listRegulatoryScenes(), api.listLinkageRules()])
      .then(([s, r]) => {
        setScenes(s);
        setRules(r);
        setEnabledSet(new Set(s.filter((x) => x.status === "online").map((x) => x.id)));
        setLoading(false);
      })
      .catch(() => { setLoading(false); showToast("加载失败", "error"); });
  }, []);

  const toggle = (s: RegulatoryScene) => {
    const willEnable = !enabledSet.has(s.id);
    setEnabledSet((prev) => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
      return next;
    });
    showToast(`「${s.name}」已${willEnable ? "启用" : "停用"}`, "info");
  };

  const rulesForScene = (sceneId: string) => rules.filter((r) => r.sceneId === sceneId);

  return (
    <AdminPageContainer
      title="监管场景"
      subtitle="监管配置 · 5 类 finance-risk 场景实例、启停、关联规则"
      breadcrumb="监管配置 / 监管场景"
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={<Layers size={16} strokeWidth={1.5} />} label="场景总数" value={scenes.length} countUp decimals={0} trend={{ text: "finance-risk", tone: "info" }} />
          <Stat icon={<Power size={16} strokeWidth={1.5} />} label="已启用" value={enabledSet.size} countUp decimals={0} trend={{ text: "在线", tone: "success" }} />
          <Stat icon={<Link2 size={16} strokeWidth={1.5} />} label="关联规则" value={rules.length} countUp decimals={0} trend={{ text: "联查", tone: "info" }} />
          <Stat icon={<Layers size={16} strokeWidth={1.5} />} label="已停用" value={scenes.length - enabledSet.size} countUp decimals={0} trend={{ text: "—", tone: "stop" }} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? <div className="ds-card text-body" style={{ color: "var(--color-on-surface-variant)" }}>加载中…</div> : null}
          {scenes.map((s) => {
            const enabled = enabledSet.has(s.id);
            const relRules = rulesForScene(s.id);
            return (
              <div key={s.id} className="ds-card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lead font-medium" style={{ color: "var(--color-foreground)" }}>{s.name}</span>
                      {enabled ? <StatusTag tone="success" dot>启用</StatusTag> : <StatusTag tone="stop" dot>停用</StatusTag>}
                    </div>
                    <div className="td-mono text-caption mt-1" style={{ color: "var(--color-on-surface-variant)" }}>{s.id} · {s.domain}</div>
                  </div>
                  <button type="button" className="ds-btn ds-btn-secondary" onClick={() => toggle(s)}>
                    <Power size={12} />{enabled ? "停用" : "启用"}
                  </button>
                </div>
                {s.description ? <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{s.description}</div> : null}
                <div className="mt-auto">
                  <div className="text-caption mb-1.5" style={{ color: "var(--color-on-surface-variant)" }}>关联联查规则（{relRules.length}）</div>
                  <div className="flex flex-wrap gap-1.5">
                    {relRules.length === 0 ? <span className="text-caption" style={{ color: "var(--color-on-surface-variant)" }}>无</span> : null}
                    {relRules.map((r) => <StatusTag key={r.id} tone="info">{r.name}</StatusTag>)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {toast ? <div className="fixed top-4 right-4 z-[400]"><StatusTag tone={toast.tone} dot>{toast.text}</StatusTag></div> : null}
    </AdminPageContainer>
  );
}
