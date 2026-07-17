import { useEffect, useMemo, useState } from "react";
import {
  Shield, Plus, Search, Filter, Play, Pause, Download, Pencil,
} from "lucide-react";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import Stat from "@/components/ui/Stat";
import Card from "@/components/ui/Card";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import Drawer from "@/components/ui/Drawer";
import { api } from "@/api";
import type { MaskingRule, MaskingEvent, MaskingAlgorithm } from "@/api/types";

// 算法标签映射（中文 + tone）
const algorithmMeta: Record<MaskingAlgorithm, { label: string; tone: TagTone }> = {
  mask: { label: "掩码", tone: "info" },
  hash: { label: "哈希", tone: "warning" },
  replace: { label: "替换", tone: "info" },
  encrypt: { label: "加密", tone: "error" },
};

interface FormState {
  name: string;
  field: string;
  algorithm: MaskingAlgorithm;
  pattern: string;
  sourceId: string;
  sourceName: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  name: "", field: "", algorithm: "mask", pattern: "", sourceId: "", sourceName: "", enabled: true,
};

export default function MaskingPage() {
  const [rules, setRules] = useState<MaskingRule[]>([]);
  const [events, setEvents] = useState<MaskingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [algoFilter, setAlgoFilter] = useState<string>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MaskingRule | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    try {
      const [r, e] = await Promise.all([api.listMaskingRules(), api.listMaskingEvents()]);
      setRules(r);
      setEvents(e);
    } catch {
      showToast("加载失败", "error");
    } finally {
      setLoading(false);
    }
  }

  // 关键逻辑：按关键字 + 脱敏算法筛选
  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (algoFilter !== "all" && r.algorithm !== algoFilter) return false;
      if (!keyword) return true;
      return r.name.includes(keyword) || r.field.includes(keyword);
    });
  }, [rules, keyword, algoFilter]);

  // KPI：规则总数 / 已启用 / 绑定来源数 / 今日触发次数
  const kpi = useMemo(() => ({
    total: rules.length,
    enabled: rules.filter((r) => r.enabled).length,
    sources: new Set(rules.map((r) => r.sourceId).filter(Boolean)).size,
    todayHits: events.reduce((s, e) => s + e.count, 0),
  }), [rules, events]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDrawerOpen(true);
  }
  function openEdit(r: MaskingRule) {
    setEditing(r);
    setForm({
      name: r.name, field: r.field, algorithm: r.algorithm, pattern: r.pattern,
      sourceId: r.sourceId ?? "", sourceName: r.sourceName ?? "", enabled: r.enabled,
    });
    setDrawerOpen(true);
  }

  async function onSubmit() {
    if (!form.name.trim() || !form.field.trim()) {
      showToast("规则名称与字段路径必填", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        field: form.field.trim(),
        algorithm: form.algorithm,
        pattern: form.pattern.trim(),
        sourceId: form.sourceId.trim() || undefined,
        sourceName: form.sourceName.trim() || undefined,
        enabled: form.enabled,
      };
      await api.createMaskingRule(payload);
      showToast(editing ? "脱敏规则已更新" : "脱敏规则已创建", "success");
      setDrawerOpen(false);
      await load();
    } catch {
      showToast("保存失败", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function onToggle(r: MaskingRule) {
    try {
      await api.toggleMaskingRule(r.id, !r.enabled);
      showToast(r.enabled ? "已禁用" : "已启用", "info");
      await load();
    } catch {
      showToast("操作失败", "error");
    }
  }

  return (
    <AdminPageContainer
      title="脱敏规则配置"
      subtitle="监管配置 · 字段级脱敏 / 来源绑定 / 触发审计"
      breadcrumb="监管配置 / 脱敏规则"
      actions={
        <>
          <button type="button" className="ds-btn ds-btn-secondary" onClick={() => showToast("导出已开始", "info")}><Download size={14} />导出规则</button>
          <button type="button" className="ds-btn ds-btn-primary" onClick={openCreate}><Plus size={14} />新建规则</button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* KPI 行 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={<Shield size={16} strokeWidth={1.5} />} label="规则总数" value={kpi.total} countUp decimals={0} trend={{ text: "字段级", tone: "info" }} />
          <Stat icon={<Shield size={16} strokeWidth={1.5} />} label="已启用" value={kpi.enabled} countUp decimals={0} trend={{ text: "生效中", tone: "success" }} />
          <Stat icon={<Shield size={16} strokeWidth={1.5} />} label="绑定来源" value={kpi.sources} countUp decimals={0} trend={{ text: "数据源", tone: "info" }} />
          <Stat icon={<Shield size={16} strokeWidth={1.5} />} label="触发次数" value={kpi.todayHits} countUp decimals={0} trend={{ text: "累计", tone: "info" }} />
        </div>

        {/* 顶部筛选条 */}
        <div className="flex items-center gap-2">
          <div className="ds-input flex-1 max-w-[280px]">
            <Search size={14} style={{ color: "var(--color-on-surface-variant)" }} />
            <input type="text" placeholder="搜索规则名 / 字段路径" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
          <div className="ds-input">
            <Filter size={14} style={{ color: "var(--color-on-surface-variant)" }} />
            <select value={algoFilter} onChange={(e) => setAlgoFilter(e.target.value)}>
              <option value="all">全部方式</option>
              {Object.entries(algorithmMeta).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <span className="ds-section-sub ml-auto">{loading ? "加载中…" : `共 ${filtered.length} 条`}</span>
        </div>

        {/* 规则卡片墙 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((r) => {
            const m = algorithmMeta[r.algorithm];
            return (
              <div key={r.id} className="ds-card p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Shield size={16} style={{ color: "var(--color-primary)" }} />
                    <span className="text-lead font-medium truncate" style={{ color: "var(--color-foreground)" }}>{r.name}</span>
                  </div>
                  {r.enabled ? <StatusTag tone="success" dot>启用</StatusTag> : <StatusTag tone="stop" dot>停用</StatusTag>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusTag tone={m.tone}>{m.label}</StatusTag>
                  <span className="td-mono text-caption" style={{ color: "var(--color-on-surface-variant)" }}>{r.field}</span>
                </div>
                {r.pattern ? <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{r.pattern}</div> : null}
                <div className="text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
                  绑定来源：{r.sourceName ?? r.sourceId ?? "未绑定"}
                </div>
                <div className="flex items-center justify-end gap-1 mt-auto pt-1">
                  <button type="button" className="ds-icon-btn" title={r.enabled ? "禁用" : "启用"} onClick={() => onToggle(r)}>
                    {r.enabled ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button type="button" className="ds-icon-btn" title="编辑" onClick={() => openEdit(r)}><Pencil size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 脱敏事件审计表 */}
        <Card title="脱敏事件审计（近 50 条）" padding="none">
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>触发时间</th><th>规则</th><th>来源</th><th>命中字段</th><th>触发次数</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr><td colSpan={5} className="text-center" style={{ color: "var(--color-on-surface-variant)", padding: "32px" }}>暂无事件</td></tr>
                ) : null}
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="td-mono text-caption">{e.appliedAt}</td>
                    <td>{e.ruleName}</td>
                    <td className="td-mono text-caption">{e.sourceId}</td>
                    <td className="td-mono">{e.field}</td>
                    <td className="td-mono">{e.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 新建/编辑抽屉 */}
      <Drawer
        open={drawerOpen} onClose={() => setDrawerOpen(false)}
        title={editing ? `编辑脱敏规则 · ${editing.name}` : "新建脱敏规则"} width={520}
        footer={
          <>
            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setDrawerOpen(false)}>取消</button>
            <button type="button" className="ds-btn ds-btn-primary" disabled={submitting} onClick={onSubmit}>
              {submitting ? "保存中…" : editing ? "保存" : "新建"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
              规则名称 <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <input type="text" className="ds-input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：身份证号脱敏" />
          </div>
          <div>
            <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
              字段路径（点分隔） <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <input type="text" className="ds-input w-full td-mono" value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} placeholder="如：entity.idCardNo" />
          </div>
          <div>
            <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>脱敏算法</label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(algorithmMeta) as [MaskingAlgorithm, { label: string; tone: TagTone }][]).map(([k, v]) => (
                <button key={k} type="button"
                  className={`ds-btn ${form.algorithm === k ? "ds-btn-primary" : "ds-btn-secondary"}`}
                  onClick={() => setForm({ ...form, algorithm: k })}>{v.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>脱敏规则说明</label>
            <input type="text" className="ds-input w-full" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="如：保留前4后4，中间*号" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>绑定来源 ID</label>
              <input type="text" className="ds-input w-full td-mono" value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })} placeholder="如：DS-002" />
            </div>
            <div>
              <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>来源名称</label>
              <input type="text" className="ds-input w-full" value={form.sourceName} onChange={(e) => setForm({ ...form, sourceName: e.target.value })} placeholder="如：司库 MySQL 主库" />
            </div>
          </div>
          <div>
            <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>状态</label>
            <div className="flex gap-2">
              {([true, false] as const).map((s) => (
                <button key={String(s)} type="button" onClick={() => setForm({ ...form, enabled: s })}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-body"
                  style={{
                    background: form.enabled === s ? "var(--color-primary)" : "var(--color-surface-container)",
                    color: form.enabled === s ? "#fff" : "var(--color-foreground)",
                    border: "1px solid var(--color-border)", fontWeight: form.enabled === s ? 500 : 400,
                  }}>{s ? "启用" : "停用"}</button>
              ))}
            </div>
          </div>
        </div>
      </Drawer>

      {toast ? <div className="fixed top-4 right-4 z-[400]"><StatusTag tone={toast.tone} dot>{toast.text}</StatusTag></div> : null}
    </AdminPageContainer>
  );
}
