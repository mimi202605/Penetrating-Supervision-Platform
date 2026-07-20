import { useEffect, useMemo, useState } from "react";
import {
  Cable,
  Plus,
  Zap,
  Search as SearchIcon,
  X,
  Database,
  CheckCircle2,
  AlertCircle,
  FolderTree,
} from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import Stat from "@/components/ui/Stat";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import Progress from "@/components/ui/Progress";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Drawer from "@/components/ui/Drawer";
import { api } from "@/api";
import type {
  Connector,
  ConnectorCategory,
  DataSource,
  StreamCatalog,
} from "@/api/types";

// 连接器分类标签文案
const CATEGORY_LABELS: Record<ConnectorCategory | "all", string> = {
  all: "全部",
  erp: "ERP",
  db: "数据库",
  file: "文件",
  mq: "消息队列",
  saas: "SaaS",
};

const CATEGORY_ORDER: (ConnectorCategory | "all")[] = [
  "all",
  "erp",
  "db",
  "file",
  "mq",
  "saas",
];

// 将数据源 type 字符串启发式映射到连接器分类（用于点击分类标签筛选数据源列表）
function mapTypeToCategory(type: string): ConnectorCategory {
  const t = type.toLowerCase();
  if (
    t.includes("mq") ||
    t.includes("kafka") ||
    t.includes("rocket") ||
    t.includes("rabbit")
  )
    return "mq";
  if (
    t.includes("file") ||
    t.includes("csv") ||
    t.includes("excel") ||
    t.includes("parquet")
  )
    return "file";
  if (
    t.includes("cdc") ||
    t.includes("binlog") ||
    t.includes("jdbc") ||
    t.includes("mysql") ||
    t.includes("oracle") ||
    t.includes("sql")
  )
    return "db";
  // REST / API 默认归 ERP（浪潮 iGIX 为主）
  return "erp";
}

// 状态到健康度映射
function healthFromStatus(status: DataSource["status"]): number {
  if (status === "online") return 100;
  if (status === "error") return 30;
  return 0;
}

export default function SourcesPage() {
  // 数据
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [connLoading, setConnLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 筛选
  const [category, setCategory] = useState<ConnectorCategory | "all">("all");
  const [keyword, setKeyword] = useState("");

  // 新建数据源抽屉
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    connectorType: "",
    name: "",
    endpoint: "",
    username: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // 测试连接结果（按数据源 id 缓存）
  const [testResults, setTestResults] = useState<
    Record<string, { status: string; latencyMs: number; error?: string; loading: boolean }>
  >({});

  // 发现 schema 抽屉
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoverTarget, setDiscoverTarget] = useState<DataSource | null>(null);
  const [catalog, setCatalog] = useState<StreamCatalog | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverErr, setDiscoverErr] = useState<string | null>(null);

  // 轻量 toast
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2800);
  };

  // 拉取连接器
  useEffect(() => {
    api
      .listConnectors()
      .then((c) => {
        setConnectors(c);
        setConnLoading(false);
      })
      .catch((e) => {
        console.error("listConnectors failed", e);
        setConnLoading(false);
      });
  }, []);

  // 拉取数据源
  useEffect(() => {
    setLoading(true);
    api
      .getDataSources()
      .then((s) => {
        setSources(s);
        setLoading(false);
      })
      .catch((e) => {
        console.error("getDataSources failed", e);
        setErr("数据源加载失败");
        setLoading(false);
      });
  }, []);

  // 按分类分组连接器
  const connectorsByCategory = useMemo(() => {
    const map: Record<ConnectorCategory, Connector[]> = {
      erp: [],
      db: [],
      file: [],
      mq: [],
      saas: [],
    };
    for (const c of connectors) {
      if (map[c.category]) map[c.category].push(c);
    }
    return map;
  }, [connectors]);

  // 计数
  const onlineCount = sources.filter((s) => s.status === "online").length;
  const errorCount = sources.filter((s) => s.status === "error").length;
  const offlineCount = sources.filter((s) => s.status === "offline").length;

  // 筛选后的数据源
  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      if (category !== "all" && mapTypeToCategory(s.type) !== category) return false;
      if (keyword) {
        const kw = keyword.toLowerCase();
        const text = `${s.name} ${s.type} ${s.owner}`.toLowerCase();
        if (!text.includes(kw)) return false;
      }
      return true;
    });
  }, [sources, category, keyword]);

  // 测试连接
  const onTest = (s: DataSource) => {
    setTestResults((prev) => ({ ...prev, [s.id]: { status: "running", latencyMs: 0, loading: true } }));
    api
      .testSourceById(s.id)
      .then((r) => {
        setTestResults((prev) => ({ ...prev, [s.id]: { ...r, loading: false } }));
        showToast(`「${s.name}」连接测试完成 · ${r.latencyMs}ms`, r.status === "online" ? "success" : "warning");
      })
      .catch((e) => {
        console.error("testSourceById failed", e);
        setTestResults((prev) => ({
          ...prev,
          [s.id]: { status: "error", latencyMs: 0, error: "测试失败", loading: false },
        }));
        showToast(`「${s.name}」连接测试失败`, "error");
      });
  };

  // 发现 schema
  const onDiscover = (s: DataSource) => {
    setDiscoverTarget(s);
    setDiscoverOpen(true);
    setCatalog(null);
    setDiscoverErr(null);
    setDiscoverLoading(true);
    api
      .discoverSource(s.id)
      .then((c) => setCatalog(c))
      .catch((e) => {
        console.error("discoverSource failed", e);
        setDiscoverErr("Schema 发现失败");
      })
      .finally(() => setDiscoverLoading(false));
  };

  // 新建提交
  const onSubmitCreate = async () => {
    if (submitting) return;
    if (!createForm.name.trim() || !createForm.connectorType) {
      showToast("请填写名称并选择连接器类型", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const newSource = await api.createDataSource({
        name: createForm.name.trim(),
        connectorType: createForm.connectorType,
        type: createForm.connectorType,
        endpoint: createForm.endpoint || undefined,
        owner: createForm.username || undefined,
        config: createForm.endpoint
          ? { endpoint: createForm.endpoint }
          : undefined,
      });
      setSources((prev) => [newSource, ...prev]);
      setCreateOpen(false);
      setCreateForm({ connectorType: "", name: "", endpoint: "", username: "", password: "" });
      showToast(`数据源已创建：${newSource.id}`, "success");
    } catch (err) {
      showToast(`创建失败：${(err as Error).message}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<DataSource>[] = [
    {
      key: "name",
      title: "数据源名称",
      sticky: true,
      render: (r) => (
        <span style={{ color: "var(--color-foreground)" }} className="font-medium">
          {r.name}
        </span>
      ),
    },
    { key: "type", title: "类型", render: (r) => <span className="td-mono">{r.type}</span> },
    {
      key: "status",
      title: "状态",
      render: (r) =>
        r.status === "online" ? (
          <StatusTag tone="success" dot>在线</StatusTag>
        ) : r.status === "error" ? (
          <StatusTag tone="error" dot>异常</StatusTag>
        ) : (
          <StatusTag tone="stop" dot>离线</StatusTag>
        ),
    },
    { key: "records", title: "记录数", render: (r) => <span className="td-mono">{r.records}</span> },
    { key: "updateFreq", title: "更新频率", render: (r) => <span className="td-mono">{r.updateFreq}</span> },
    {
      key: "health",
      title: "健康度",
      render: (r) => {
        const h = healthFromStatus(r.status);
        return (
          <Progress
            value={h}
            tone={h >= 80 ? "success" : h >= 40 ? "warning" : "danger"}
            size="sm"
            showText
            className="min-w-[110px]"
          />
        );
      },
    },
    { key: "owner", title: "负责人", render: (r) => r.owner },
    {
      key: "actions",
      title: "操作",
      render: (r) => {
        const tr = testResults[r.id];
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="ds-btn ds-btn-secondary"
              disabled={tr?.loading}
              onClick={() => onTest(r)}
            >
              <Zap size={12} />
              {tr?.loading ? "测试中" : "测试连接"}
            </button>
            <button
              type="button"
              className="ds-btn ds-btn-secondary"
              onClick={() => onDiscover(r)}
            >
              <FolderTree size={12} />
              发现 Schema
            </button>
            {tr && !tr.loading ? (
              <StatusTag tone={tr.status === "online" ? "success" : tr.status === "error" ? "error" : "warning"} dot>
                {tr.status === "online" ? `${tr.latencyMs}ms` : tr.error || tr.status}
              </StatusTag>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <PageContainer
      title="数据源管理"
      subtitle="数据采集中心 · 数据源接入、健康监控、权限管理"
      breadcrumb="数据采集中心 / 数据源管理"
      actions={
        <button type="button" className="ds-btn ds-btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
          新建数据源
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        {/* KPI 概览 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            icon={<Database size={16} strokeWidth={1.5} />}
            label="已接入数据源"
            value={sources.length}
            countUp
            decimals={0}
            trend={{ text: `${connectors.length} 连接器`, tone: "info" }}
          />
          <Stat
            icon={<CheckCircle2 size={16} strokeWidth={1.5} />}
            label="在线"
            value={onlineCount}
            countUp
            decimals={0}
            trend={{ text: "正常", tone: "success" }}
          />
          <Stat
            icon={<AlertCircle size={16} strokeWidth={1.5} />}
            label="异常"
            value={errorCount}
            countUp
            decimals={0}
            trend={{ text: errorCount > 0 ? "需关注" : "正常", tone: errorCount > 0 ? "error" : "success" }}
          />
          <Stat
            icon={<Cable size={16} strokeWidth={1.5} />}
            label="离线"
            value={offlineCount}
            countUp
            decimals={0}
            trend={{ text: "可重连", tone: "stop" }}
          />
        </div>

        {/* 连接器分类标签 + 搜索 */}
        <section className="ds-card">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="ds-section-title">连接器分类</h2>
            <span className="ds-section-sub">
              {connLoading ? "加载中…" : `共 ${connectors.length} 个连接器`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {CATEGORY_ORDER.map((cat) => {
              const count =
                cat === "all"
                  ? connectors.length
                  : connectorsByCategory[cat].length;
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-body transition-opacity"
                  style={{
                    background: active ? "var(--color-primary)" : "var(--color-surface-container)",
                    color: active ? "#fff" : "var(--color-foreground)",
                    border: "1px solid var(--color-border)",
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                  <span
                    className="text-caption px-1 rounded-sm"
                    style={{
                      background: active ? "rgba(255,255,255,0.2)" : "var(--color-surface-container-high)",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          {/* 当前分类下的连接器清单 */}
          {!connLoading && connectors.length > 0 ? (
            <div className="flex flex-col gap-2">
              {(category === "all" ? connectors : connectorsByCategory[category]).map((c) => (
                <div
                  key={c.type}
                  className="flex items-center justify-between p-2.5 rounded-sm"
                  style={{ background: "var(--color-surface-container)" }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lead font-medium truncate" style={{ color: "var(--color-foreground)" }}>
                      {c.name}
                    </span>
                    <span className="td-mono text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
                      {c.type}
                    </span>
                    {c.description ? (
                      <span className="text-caption truncate" style={{ color: "var(--color-on-surface-variant)" }}>
                        · {c.description}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.capabilities.slice(0, 3).map((cap) => (
                      <StatusTag key={cap} tone="info">{cap}</StatusTag>
                    ))}
                    <StatusTag tone={c.implemented ? "success" : "stop"}>
                      {c.implemented ? "已实现" : "规划中"}
                    </StatusTag>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* 数据源列表 */}
        <section className="ds-card">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="ds-section-title">数据源列表</h2>
            <div className="flex items-center gap-2">
              <span className="ds-section-sub">
                {loading ? "加载中…" : `共 ${filteredSources.length} 个数据源`}
              </span>
              <div className="ds-input min-w-[200px]">
                <SearchIcon size={14} style={{ color: "var(--color-on-surface-variant)" }} />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索名称 / 类型 / 负责人"
                />
                {keyword ? (
                  <button
                    type="button"
                    onClick={() => setKeyword("")}
                    className="ds-icon-btn w-5 h-5"
                    aria-label="清除"
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          {err ? (
            <div
              className="p-3 rounded-sm text-lead"
              style={{
                background: "var(--color-danger-bg)",
                color: "var(--color-danger)",
                border: "1px solid var(--color-danger-line)",
              }}
            >
              {err}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredSources}
              rowKey={(r) => r.id}
              empty="暂无数据源"
            />
          )}
        </section>
      </div>

      {/* 新建数据源抽屉 */}
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建数据源"
        width={520}
        footer={
          <>
            <button
              type="button"
              className="ds-btn ds-btn-secondary"
              onClick={() => setCreateOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="ds-btn ds-btn-primary"
              disabled={submitting}
              onClick={onSubmitCreate}
            >
              {submitting ? "提交中…" : "提交"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {/* 连接器类型选择 */}
          <div>
            <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
              连接器类型
            </label>
            {connectors.length === 0 ? (
              <span className="text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
                {connLoading ? "连接器加载中…" : "暂无可用连接器，请输入自定义类型"}
              </span>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {connectors.map((c) => {
                const active = createForm.connectorType === c.type;
                return (
                  <button
                    key={c.type}
                    type="button"
                    onClick={() => setCreateForm((f) => ({ ...f, connectorType: c.type }))}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-body"
                    style={{
                      background: active ? "var(--color-primary)" : "var(--color-surface-container)",
                      color: active ? "#fff" : "var(--color-foreground)",
                      border: "1px solid var(--color-border)",
                      fontWeight: active ? 500 : 400,
                    }}
                  >
                    {c.name}
                    <span className="td-mono text-caption" style={{ opacity: 0.7 }}>
                      {c.type}
                    </span>
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              className="ds-input w-full mt-2"
              placeholder="或输入自定义 connectorType"
              value={createForm.connectorType}
              onChange={(e) => setCreateForm((f) => ({ ...f, connectorType: e.target.value }))}
            />
          </div>

          {/* 通用字段 */}
          <div>
            <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
              数据源名称 <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <input
              type="text"
              className="ds-input w-full"
              placeholder="如：浪潮 iGIX 财务模块"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
              Endpoint
            </label>
            <input
              type="text"
              className="ds-input w-full"
              placeholder="https://igix.example.com/api"
              value={createForm.endpoint}
              onChange={(e) => setCreateForm((f) => ({ ...f, endpoint: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
                用户名
              </label>
              <input
                type="text"
                className="ds-input w-full"
                placeholder="username"
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
                密码
              </label>
              <input
                type="password"
                className="ds-input w-full"
                placeholder="******"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
          </div>
          <div
            className="text-caption p-2.5 rounded-sm"
            style={{
              background: "var(--color-primary-soft)",
              color: "var(--color-foreground)",
              border: "1px solid var(--color-primary-line)",
            }}
          >
            提示：新建数据源 API（POST /collection/sources）后端已就绪，本期前端按通用字段简化提交。
          </div>
        </div>
      </Drawer>

      {/* 发现 Schema 抽屉 */}
      <Drawer
        open={discoverOpen}
        onClose={() => setDiscoverOpen(false)}
        title={discoverTarget ? `Schema 发现 · ${discoverTarget.name}` : "Schema 发现"}
        width={560}
        footer={
          <button
            type="button"
            className="ds-btn ds-btn-secondary"
            onClick={() => setDiscoverOpen(false)}
          >
            关闭
          </button>
        }
      >
        {discoverLoading ? (
          <div className="text-lead" style={{ color: "var(--color-on-surface-variant)" }}>
            正在发现 Schema…
          </div>
        ) : discoverErr ? (
          <div
            className="p-3 rounded-sm text-lead"
            style={{
              background: "var(--color-danger-bg)",
              color: "var(--color-danger)",
              border: "1px solid var(--color-danger-line)",
            }}
          >
            {discoverErr}
          </div>
        ) : catalog && catalog.streams.length > 0 ? (
          <div className="flex flex-col gap-3">
            {catalog.streams.map((stream) => (
              <div
                key={stream.name}
                className="rounded-sm p-3"
                style={{ background: "var(--color-surface-container)" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FolderTree size={14} style={{ color: "var(--color-primary)" }} />
                  <span className="text-lead font-medium" style={{ color: "var(--color-foreground)" }}>
                    {stream.name}
                  </span>
                  <span className="text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
                    · {stream.fields.length} 字段
                  </span>
                </div>
                {stream.description ? (
                  <div className="text-caption mb-2" style={{ color: "var(--color-on-surface-variant)" }}>
                    {stream.description}
                  </div>
                ) : null}
                <div className="flex flex-col gap-1">
                  {stream.fields.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center justify-between py-1 px-2 rounded-sm"
                      style={{ background: "var(--color-card)" }}
                    >
                      <span className="td-mono text-body" style={{ color: "var(--color-foreground)" }}>
                        {f.name}
                      </span>
                      <span className="td-mono text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
                        {f.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-lead" style={{ color: "var(--color-on-surface-variant)" }}>
            未发现任何 Stream
          </div>
        )}
      </Drawer>

      {/* 轻量 Toast */}
      {toast ? (
        <div className="fixed top-4 right-4 z-[400]">
          <StatusTag tone={toast.tone} dot>
            {toast.text}
          </StatusTag>
        </div>
      ) : null}
    </PageContainer>
  );
}
