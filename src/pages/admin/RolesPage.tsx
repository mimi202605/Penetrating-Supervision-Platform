import { useEffect, useState } from "react";
import { Pencil, Save } from "lucide-react";
import AdminPageContainer from "@/components/layout/AdminPageContainer";
import Card from "@/components/ui/Card";
import Drawer from "@/components/ui/Drawer";
import StatusTag, { type TagTone } from "@/components/ui/StatusTag";
import { api } from "@/api";
import { ADMIN_PERMISSION_OPS } from "@/mock";
import type { AdminRoleDef, PermissionMatrix } from "@/api/types";

export default function RolesPage() {
  const [roles, setRoles] = useState<AdminRoleDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminRoleDef | null>(null);
  const [draft, setDraft] = useState<PermissionMatrix[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: TagTone } | null>(null);
  const showToast = (text: string, tone: TagTone = "success") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    api.listRoles().then((r) => { setRoles(r); setLoading(false); });
  }, []);

  const openEdit = (r: AdminRoleDef) => {
    setEditing(r);
    // 深拷贝权限矩阵到 draft
    setDraft(r.permissions.map((p) => ({ module: p.module, operations: p.operations.map((o) => ({ ...o })) })));
  };

  const togglePerm = (module: string, op: string) => {
    if (!draft) return;
    setDraft(draft.map((p) => p.module === module
      ? { ...p, operations: p.operations.map((o) => (o.op === op ? { ...o, allowed: !o.allowed } : o)) }
      : p));
  };

  const onSubmit = () => {
    if (!editing || !draft) return;
    setSubmitting(true);
    api.updateRole(editing.id, draft)
      .then((updated) => {
        setRoles((prev) => prev.map((r) => (r.id === editing.id ? updated : r)));
        showToast("权限已保存", "success");
        setEditing(null);
        setDraft(null);
      })
      .catch(() => showToast("保存失败", "error"))
      .finally(() => setSubmitting(false));
  };

  return (
    <AdminPageContainer
      title="角色权限"
      subtitle="系统管理 · 角色定义与模块×操作权限矩阵"
      breadcrumb="系统管理 / 角色权限"
    >
      <div className="flex flex-col gap-4">
        {loading ? <div className="ds-card text-body" style={{ color: "var(--color-on-surface-variant)" }}>加载中…</div> : null}
        {roles.map((r) => (
          <Card key={r.id} title={`${r.name}（${r.code}）`} extra={
            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => openEdit(r)} disabled={r.code === "admin"}>
              <Pencil size={12} />{r.code === "admin" ? "内置不可改" : "编辑权限"}
            </button>
          }>
            <div className="text-body mb-3" style={{ color: "var(--color-on-surface-variant)" }}>{r.description}</div>
            <div className="flex items-center gap-4 mb-3 text-caption" style={{ color: "var(--color-on-surface-variant)" }}>
              <span>用户数：{r.userCount}</span>
            </div>
            {/* 权限矩阵预览 */}
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>模块</th>
                    {ADMIN_PERMISSION_OPS.map((op) => <th key={op}>{op}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {r.permissions.map((p) => (
                    <tr key={p.module}>
                      <td className="font-medium" style={{ color: "var(--color-foreground)" }}>{p.module}</td>
                      {p.operations.map((o) => (
                        <td key={o.op}>
                          {o.allowed
                            ? <StatusTag tone="success">✓</StatusTag>
                            : <span style={{ color: "var(--color-on-surface-variant)" }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      <Drawer
        open={!!editing} onClose={() => { setEditing(null); setDraft(null); }}
        title={editing ? `编辑权限 · ${editing.name}` : "编辑权限"} width={560}
        footer={
          <>
            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => { setEditing(null); setDraft(null); }}>取消</button>
            <button type="button" className="ds-btn ds-btn-primary" disabled={submitting || !draft} onClick={onSubmit}>
              <Save size={14} />{submitting ? "保存中…" : "保存"}
            </button>
          </>
        }
      >
        {editing && draft ? (
          <div className="flex flex-col gap-4">
            <div className="text-body" style={{ color: "var(--color-on-surface-variant)" }}>{editing.description}</div>
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>模块</th>
                    {ADMIN_PERMISSION_OPS.map((op) => <th key={op}>{op}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {draft.map((p) => (
                    <tr key={p.module}>
                      <td className="font-medium" style={{ color: "var(--color-foreground)" }}>{p.module}</td>
                      {p.operations.map((o) => (
                        <td key={o.op}>
                          <input type="checkbox" checked={o.allowed} onChange={() => togglePerm(p.module, o.op)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Drawer>

      {toast ? (
        <div className="fixed top-4 right-4 z-[400]"><StatusTag tone={toast.tone} dot>{toast.text}</StatusTag></div>
      ) : null}
    </AdminPageContainer>
  );
}
