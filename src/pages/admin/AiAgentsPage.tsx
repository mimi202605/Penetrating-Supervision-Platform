import { useEffect, useMemo, useState } from "react";
import { Bot, Play, Cpu } from "lucide-react";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import Stat from "@/components/ui/Stat";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import Drawer from "@/components/ui/Drawer";
import { api } from "@/api";
import type { Agent, AgentCategory } from "@/api/types";

const CATEGORY_LABELS: Record<AgentCategory | "all", string> = {
  all: "全部", extract: "抽取", compare: "比对", generate: "生成", analyze: "分析", transform: "转换",
};
const CATEGORY_ORDER: (AgentCategory | "all")[] = ["all", "extract", "compare", "generate", "analyze", "transform"];

export default function AiAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<AgentCategory | "all">("all");
  const [invokeOpen, setInvokeOpen] = useState(false);
  const [invokeTarget, setInvokeTarget] = useState<Agent | null>(null);
  const [inputText, setInputText] = useState("{}");
  const [invokeResult, setInvokeResult] = useState<unknown>(null);
  const [invoking, setInvoking] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    api.listAgents().then((a) => { setAgents(a); setLoading(false); });
  }, []);

  const implemented = agents.filter((a) => a.implemented);
  const filtered = useMemo(() => category === "all" ? agents : agents.filter((a) => a.category === category), [agents, category]);

  const openInvoke = (a: Agent) => {
    setInvokeTarget(a);
    setInputText("{}");
    setInvokeResult(null);
    setInvokeOpen(true);
  };

  const onInvoke = () => {
    if (!invokeTarget) return;
    let input: Record<string, unknown> = {};
    try { input = JSON.parse(inputText) as Record<string, unknown>; } catch { showToast("输入 JSON 解析失败", "warning"); return; }
    setInvoking(true);
    api.invokeAgent(invokeTarget.id, input)
      .then((res) => { setInvokeResult(res); showToast("调用完成（Mock 占位）", "success"); })
      .catch(() => showToast("调用失败", "error"))
      .finally(() => setInvoking(false));
  };

  return (
    <AdminPageContainer
      title="AI 智能体"
      subtitle="监管配置 · 16 类智能体注册表，3 已实现可调用测试"
      breadcrumb="监管配置 / AI 智能体"
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={<Bot size={16} strokeWidth={1.5} />} label="智能体总数" value={agents.length} countUp decimals={0} trend={{ text: "16 类", tone: "info" }} />
          <Stat icon={<Cpu size={16} strokeWidth={1.5} />} label="已实现" value={implemented.length} countUp decimals={0} trend={{ text: "可调用", tone: "success" }} />
          <Stat icon={<Bot size={16} strokeWidth={1.5} />} label="规划中" value={agents.length - implemented.length} countUp decimals={0} trend={{ text: "占位", tone: "stop" }} />
          <Stat icon={<Cpu size={16} strokeWidth={1.5} />} label="协议类型" value={3} countUp decimals={0} trend={{ text: "MCP/A2A/internal", tone: "info" }} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {CATEGORY_ORDER.map((cat) => {
            const count = cat === "all" ? agents.length : agents.filter((a) => a.category === cat).length;
            const active = category === cat;
            return (
              <button key={cat} type="button" onClick={() => setCategory(cat)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-body"
                style={{ background: active ? "var(--color-primary)" : "var(--color-surface-container)", color: active ? "#fff" : "var(--color-foreground)", border: "1px solid var(--color-border)", fontWeight: active ? 500 : 400 }}>
                {CATEGORY_LABELS[cat]}<span className="text-caption px-1 rounded-sm" style={{ background: active ? "rgba(255,255,255,0.2)" : "var(--color-surface-container-high)" }}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>加载中…</div> : null}
          {filtered.map((a) => (
            <div key={a.id} className="ds-card p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lead font-medium truncate" style={{ color: "var(--color-foreground)" }}>{a.name}</span>
                    {a.implemented ? <StatusTag tone="success">已实现</StatusTag> : <StatusTag tone="stop">规划中</StatusTag>}
                  </div>
                  <div className="td-mono text-caption mt-1" style={{ color: "var(--color-on-surface-variant)" }}>{a.id} · {a.protocol} · {a.model}</div>
                </div>
              </div>
              {a.description ? <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{a.description}</div> : null}
              <div className="flex flex-wrap gap-1.5">{a.capabilities.map((c) => <StatusTag key={c} tone="info">{c}</StatusTag>)}</div>
              <div className="mt-auto pt-1">
                <button type="button" className="ds-btn ds-btn-primary w-full" disabled={!a.implemented} onClick={() => openInvoke(a)}>
                  <Play size={12} />{a.implemented ? "调用测试" : "未实现"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Drawer
        open={invokeOpen} onClose={() => setInvokeOpen(false)}
        title={invokeTarget ? `调用测试 · ${invokeTarget.name}` : "调用测试"} width={560}
        footer={
          <>
            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setInvokeOpen(false)}>关闭</button>
            <button type="button" className="ds-btn ds-btn-primary" disabled={invoking} onClick={onInvoke}><Play size={14} />{invoking ? "调用中…" : "执行调用"}</button>
          </>
        }
      >
        {invokeTarget ? (
          <div className="flex flex-col gap-4">
            <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{invokeTarget.description ?? "—"}</div>
            <div className="grid grid-cols-2 gap-3 text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
              <div>输入 Schema：<span className="td-mono">{invokeTarget.inputSchema}</span></div>
              <div>输出 Schema：<span className="td-mono">{invokeTarget.outputSchema}</span></div>
            </div>
            <div>
              <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>输入（JSON）</label>
              <textarea className="w-full ds-input min-h-[100px] font-mono text-caption" value={inputText} onChange={(e) => setInputText(e.target.value)} />
            </div>
            {invokeResult ? (
              <div>
                <div className="text-body mb-2" style={{ color: "var(--color-foreground)" }}>调用结果：</div>
                <pre className="td-mono text-caption p-3 rounded-sm overflow-x-auto" style={{ background: "var(--color-surface-container)", color: "var(--color-foreground)" }}>{JSON.stringify(invokeResult, null, 2)}</pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      {toast ? <div className="fixed top-4 right-4 z-[400]"><StatusTag tone={toast.tone} dot>{toast.text}</StatusTag></div> : null}
    </AdminPageContainer>
  );
}
