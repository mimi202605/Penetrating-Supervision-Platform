import { useEffect, useMemo, useState } from "react";
import { Plus, Search as SearchIcon, X, Pencil, Trash2 } from "lucide-react";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Drawer from "@/components/ui/Drawer";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import { api } from "@/api";
import type { AdminUser, AdminRole } from "@/api/types";

const ROLE_OPTIONS: AdminRole[] = ["admin", "核查员", "处置员"];

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<AdminRole | "all">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<Omit<AdminUser, "id" | "lastLoginAt" | "createdAt">>({
    username: "",
    name: "",
    role: "核查员",
    department: "",
    email: "",
    phone: "",
    status: "active",
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    setLoading(true);
    api.listUsers().then((u) => { setUsers(u); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (keyword) {
        const kw = keyword.toLowerCase();
        if (!`${u.name} ${u.username} ${u.department} ${u.email}`.toLowerCase().includes(kw)) return false;
      }
      return true;
    });
  }, [users, keyword, roleFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({ username: "", name: "", role: "核查员", department: "", email: "", phone: "", status: "active" });
    setDrawerOpen(true);
  };
  const openEdit = (u: AdminUser) => {
    setEditing(u);
    setForm({ username: u.username, name: u.name, role: u.role, department: u.department, email: u.email, phone: u.phone, status: u.status });
    setDrawerOpen(true);
  };

  const onSubmit = () => {
    if (!form.username.trim() || !form.name.trim()) {
      showToast("用户名与姓名必填", "warning");
      return;
    }
    setSubmitting(true);
    const done = () => {
      setSubmitting(false);
      setDrawerOpen(false);
    };
    if (editing) {
      api.updateUser(editing.id, form)
        .then((updated) => {
          setUsers((prev) => prev.map((u) => (u.id === editing.id ? updated : u)));
          showToast("用户已更新", "success");
        })
        .catch(() => showToast("更新失败", "error"))
        .finally(done);
    } else {
      api.createUser(form)
        .then((created) => {
          setUsers((prev) => [created, ...prev]);
          showToast("用户已新建", "success");
        })
        .catch(() => showToast("新建失败", "error"))
        .finally(done);
    }
  };

  const onToggleStatus = (u: AdminUser) => {
    api.updateUser(u.id, { status: u.status === "active" ? "disabled" : "active" })
      .then((updated) => {
        setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
        showToast(`已${updated.status === "active" ? "启用" : "停用"} ${u.name}`, "info");
      })
      .catch(() => showToast("操作失败", "error"));
  };

  const onDelete = (u: AdminUser) => {
    if (!window.confirm(`确认删除用户「${u.name}」？`)) return;
    api.deleteUser(u.id)
      .then(() => {
        setUsers((prev) => prev.filter((x) => x.id !== u.id));
        showToast("用户已删除", "success");
      })
      .catch(() => showToast("删除失败", "error"));
  };

  const columns: Column<AdminUser>[] = [
    {
      key: "name", title: "用户", sticky: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-caption font-medium flex-shrink-0"
            style={{ background: "var(--color-primary)", color: "#fff" }}>
            {r.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="font-medium" style={{ color: "var(--color-foreground)" }}>{r.name}</div>
            <div className="td-mono text-caption" style={{ color: "var(--color-on-surface-variant)" }}>{r.username}</div>
          </div>
        </div>
      ),
    },
    { key: "role", title: "角色", render: (r) => (
      <StatusTag tone={r.role === "admin" ? "info" : r.role === "核查员" ? "success" : "warning"}>{r.role}</StatusTag>
    ) },
    { key: "department", title: "部门", render: (r) => r.department },
    { key: "email", title: "邮箱", render: (r) => <span className="td-mono">{r.email}</span> },
    { key: "phone", title: "手机", render: (r) => <span className="td-mono">{r.phone}</span> },
    { key: "status", title: "状态", render: (r) =>
      r.status === "active"
        ? <StatusTag tone="success" dot>启用</StatusTag>
        : <StatusTag tone="stop" dot>停用</StatusTag>
    },
    { key: "lastLoginAt", title: "最后登录", render: (r) => <span className="td-mono text-caption">{r.lastLoginAt}</span> },
    { key: "actions", title: "操作", render: (r) => (
      <div className="flex items-center gap-1.5">
        <button type="button" className="ds-btn ds-btn-secondary" onClick={() => openEdit(r)}><Pencil size={12} />编辑</button>
        <button type="button" className="ds-btn ds-btn-secondary" onClick={() => onToggleStatus(r)}>{r.status === "active" ? "停用" : "启用"}</button>
        <button type="button" className="ds-icon-btn" title="删除" onClick={() => onDelete(r)}><Trash2 size={14} /></button>
      </div>
    ) },
  ];

  return (
    <AdminPageContainer
      title="用户管理"
      subtitle="系统管理 · 用户账号 CRUD、角色分配、启停"
      breadcrumb="系统管理 / 用户管理"
      actions={<button type="button" className="ds-btn ds-btn-primary" onClick={openCreate}><Plus size={14} />新建用户</button>}
    >
      <section className="ds-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {(["all", ...ROLE_OPTIONS] as const).map((r) => (
              <button key={r} type="button" onClick={() => setRoleFilter(r)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-body"
                style={{
                  background: roleFilter === r ? "var(--color-primary)" : "var(--color-surface-container)",
                  color: roleFilter === r ? "#fff" : "var(--color-foreground)",
                  border: "1px solid var(--color-border)",
                  fontWeight: roleFilter === r ? 500 : 400,
                }}>
                {r === "all" ? "全部" : r}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="ds-section-sub">{loading ? "加载中…" : `共 ${filtered.length} 人`}</span>
            <div className="ds-input min-w-[220px]">
              <SearchIcon size={14} style={{ color: "var(--color-on-surface-variant)" }} />
              <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索姓名/账号/部门/邮箱" />
              {keyword ? (
                <button type="button" onClick={() => setKeyword("")} className="ds-icon-btn w-5 h-5" aria-label="清除"><X size={12} /></button>
              ) : null}
            </div>
          </div>
        </div>
        <DataTable columns={columns} data={filtered} rowKey={(r) => r.id} empty="暂无用户" />
      </section>

      <Drawer
        open={drawerOpen} onClose={() => setDrawerOpen(false)}
        title={editing ? `编辑用户 · ${editing.name}` : "新建用户"} width={480}
        footer={
          <>
            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => setDrawerOpen(false)}>取消</button>
            <button type="button" className="ds-btn ds-btn-primary" disabled={submitting} onClick={onSubmit}>
              {submitting ? "提交中…" : editing ? "保存" : "新建"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <FieldText label="账号" required value={form.username} onChange={(v) => setForm((f) => ({ ...f, username: v }))} placeholder="username" />
          <FieldText label="姓名" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="如：张三" />
          <div>
            <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>角色</label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button key={r} type="button" onClick={() => setForm((f) => ({ ...f, role: r }))}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-body"
                  style={{
                    background: form.role === r ? "var(--color-primary)" : "var(--color-surface-container)",
                    color: form.role === r ? "#fff" : "var(--color-foreground)",
                    border: "1px solid var(--color-border)", fontWeight: form.role === r ? 500 : 400,
                  }}>{r}</button>
              ))}
            </div>
          </div>
          <FieldText label="部门" value={form.department} onChange={(v) => setForm((f) => ({ ...f, department: v }))} placeholder="如：信息中心" />
          <FieldText label="邮箱" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="user@example.com" />
          <FieldText label="手机" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="138****0000" />
          <div>
            <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>状态</label>
            <div className="flex gap-2">
              {(["active", "disabled"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setForm((f) => ({ ...f, status: s }))}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-body"
                  style={{
                    background: form.status === s ? "var(--color-primary)" : "var(--color-surface-container)",
                    color: form.status === s ? "#fff" : "var(--color-foreground)",
                    border: "1px solid var(--color-border)", fontWeight: form.status === s ? 500 : 400,
                  }}>{s === "active" ? "启用" : "停用"}</button>
              ))}
            </div>
          </div>
        </div>
      </Drawer>

      {toast ? (
        <div className="fixed top-4 right-4 z-[400]"><StatusTag tone={toast.tone} dot>{toast.text}</StatusTag></div>
      ) : null}
    </AdminPageContainer>
  );
}

/** 受控文本字段（本地复用，避免重复） */
function FieldText({ label, value, onChange, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="text-body mb-1.5 block" style={{ color: "var(--color-on-surface-variant)" }}>
        {label} {required ? <span style={{ color: "var(--color-danger)" }}>*</span> : null}
      </label>
      <input type="text" className="ds-input w-full" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
