import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Lock, RefreshCw, UserCheck } from "lucide-react";
import type { GarageRole, GarageState } from "@garage/domain";
import { useGarageStore } from "../../shared/store";
import type { Lang, ModalConfig, Translator } from "../../shared/ui";
import {
  Collapsible, ConfirmDialog, DataTable, DetailDrawer, EmptyState, FilterBar, Field, FormSection, Notice, PageHeader, RequiredNote, StatusBadge,
} from "../../shared/components";
import {
  capabilityHints, capabilityLabels, effectiveAllowed, filterMembers, groupCapabilities, isDemoMember, localisedName, overrideCount, sameOverrides, toggleOverride,
  type CapabilityInfo, type StaffInvitation, type StaffMember,
} from "./staff-logic";
import "../settings/settings.css";
import { invalidateForMutation } from "../../shared/invalidation";

interface StaffPageProps {
  lang: Lang;
  t: Translator;
  state: GarageState;
  notify: (message: string) => void;
  /** Legacy shell prop; confirmations now use ConfirmDialog. */
  confirmModal?: (config: ModalConfig | null) => void;
  /** Rendered inside Settings > Staff & permissions: no page header. */
  embedded?: boolean;
}

interface StaffPayload { members: StaffMember[]; invitations: StaffInvitation[]; capabilities?: CapabilityInfo }

const roles: Array<{ id: Exclude<GarageRole, "owner">; en: string; ar: string }> = [
  { id: "branch-manager", en: "Branch manager", ar: "مدير الفرع" },
  { id: "receptionist", en: "Receptionist", ar: "موظف استقبال" },
  { id: "technician", en: "Technician", ar: "فني" },
];

async function staffRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as { code?: string; message?: string };
  if (!response.ok) throw new Error(body.code ?? body.message ?? "REQUEST_FAILED");
  invalidateForMutation(url, init?.method);
  return body as T;
}

export function StaffPage({ lang, t, state, notify, embedded }: StaffPageProps) {
  const { actor } = useGarageStore();
  const isDemo = actor?.isDemo === true;
  const [payload, setPayload] = useState<StaffPayload>({ members: [], invitations: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [matrixOpen, setMatrixOpen] = useState(false);
  const matrixRef = useRef<HTMLDivElement>(null);

  const [approveOpen, setApproveOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<GarageRole, "owner">>("receptionist");
  const [branchIds, setBranchIds] = useState<string[]>(() => state.branches.map((branch) => branch.id));

  const [memberId, setMemberId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [removeTarget, setRemoveTarget] = useState<StaffMember | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<StaffInvitation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPayload(await staffRequest<StaffPayload>("/api/staff"));
      setLoadError("");
    } catch {
      setLoadError(t("Could not load staff.", "تعذر تحميل الفريق."));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const roleLabel = (value: GarageRole) => value === "owner" ? t("Owner", "المالك") : (() => { const match = roles.find((item) => item.id === value); return match ? t(match.en, match.ar) : value; })();
  const branchLabel = (ids: string[]) => ids.map((id) => state.branches.find((branch) => branch.id === id)?.name).filter(Boolean).join(lang === "ar" ? "، " : ", ") || "—";
  const memberBranches = (member: StaffMember) => member.role === "owner" ? t("All branches", "كل الفروع") : branchLabel(member.branchIds);
  const canManage = !isDemo;
  const member = memberId ? payload.members.find((item) => item.userId === memberId) ?? null : null;
  const editable = (item: StaffMember) => canManage && item.status === "active" && item.role !== "owner" && !isDemoMember(item) && item.userId !== actor?.userId;

  const visible = useMemo(() => filterMembers(payload.members, { query, role: roleFilter === "all" ? "" : roleFilter, status: statusFilter === "all" ? "" : statusFilter }), [payload.members, query, roleFilter, statusFilter]);

  const openMember = (item: StaffMember) => { setMemberId(item.userId); setDraft({ ...(item.permissions ?? {}) } as Record<string, boolean>); setError(""); };
  const closeMember = () => { setMemberId(null); setError(""); };

  const submitApproval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await staffRequest("/api/staff/invitations", { method: "POST", body: JSON.stringify({ email, role, branchIds }) });
      setEmail("");
      setApproveOpen(false);
      await load();
      notify(t("Email approved. They can sign in with Google.", "اتعمد البريد. يقدر يدخل بحساب جوجل."));
    } catch (issue) {
      const code = issue instanceof Error ? issue.message : "";
      setError(code === "INVALID_BRANCH" ? t("Choose an available branch.", "اختر فرعًا متاحًا.")
        : code === "EMAIL_ALREADY_APPROVED" ? t("This email already has access or a pending approval.", "هذا البريد لديه صلاحية أو موافقة معلقة بالفعل.")
        : t("Could not save the approval. Check the email.", "تعذر حفظ الموافقة. راجع البريد."));
    } finally {
      setSaving(false);
    }
  };

  const savePermissions = async (item: StaffMember, next: Record<string, boolean>) => {
    setSaving(true);
    setError("");
    try {
      await staffRequest(`/api/staff/${encodeURIComponent(item.userId)}/permissions`, { method: "PUT", body: JSON.stringify({ permissions: next }) });
      closeMember();
      await load();
      notify(t("Permissions saved.", "الصلاحيات اتحفظت."));
    } catch {
      setError(t("Could not save permissions.", "تعذر حفظ الصلاحيات."));
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setSaving(true);
    try {
      const result = await staffRequest<{ sessionsRevoked: boolean }>(`/api/staff/${encodeURIComponent(removeTarget.userId)}`, { method: "DELETE" });
      setRemoveTarget(null);
      closeMember();
      await load();
      notify(result.sessionsRevoked ? t("Access removed and sessions closed.", "الصلاحية اتشالت والجلسات اتقفلت.") : t("Access blocked, but an open sign-in could not be closed.", "الوصول اتوقف، لكن مقدرناش نقفل جلسة مفتوحة."));
    } catch (issue) {
      const code = issue instanceof Error ? issue.message : "";
      setRemoveTarget(null);
      setError(code === "LAST_OWNER" ? t("At least one active owner must remain.", "يجب أن يبقى مالك نشط واحد على الأقل.") : t("Could not remove this access.", "تعذر سحب الصلاحية."));
    } finally {
      setSaving(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setSaving(true);
    try {
      await staffRequest(`/api/staff/invitations/${encodeURIComponent(revokeTarget.id)}`, { method: "DELETE" });
      setRevokeTarget(null);
      await load();
      notify(t("Approval cancelled.", "الموافقة اتلغت."));
    } catch {
      setRevokeTarget(null);
      setError(t("Could not cancel this approval.", "تعذر إلغاء الموافقة."));
    } finally {
      setSaving(false);
    }
  };

  const approveButton = canManage
    ? <button className="btn btn-primary" type="button" onClick={() => { setError(""); setApproveOpen(true); }}><UserCheck size={16} />{t("Approve email", "اعتمد بريد")}</button>
    : null;
  const refreshButton = <button className="btn" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} />{t("Refresh", "تحديث")}</button>;
  const showMatrix = () => {
    setMatrixOpen(true);
    window.setTimeout(() => matrixRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 0);
  };
  const matrixLink = <button className="btn btn-quiet" type="button" onClick={showMatrix}>{t("Role permissions", "صلاحيات الأدوار")}</button>;
  const actions = <>{matrixLink}{refreshButton}{approveButton}</>;
  const memberName = (item: StaffMember) => localisedName(item.name, lang);

  const capabilityInfo = payload.capabilities;
  const groups = capabilityInfo ? groupCapabilities(capabilityInfo.all) : [];
  const capLabel = (capability: string) => { const label = capabilityLabels[capability]; return label ? label[lang] : capability; };
  const capHint = (capability: string) => capabilityHints[capability]?.[lang];
  const original = (member?.permissions ?? {}) as Record<string, boolean>;
  const dirty = member ? !sameOverrides(draft, original) : false;

  return <>
    {embedded
      ? <div className="st-toolbar section-gap-none">{actions}</div>
      : <PageHeader title={t("Staff access", "صلاحيات الفريق")} subtitle={t("Approve work emails by role and branch. Access is checked on every request.", "اعتمد بريد الشغل حسب الدور والفرع. الصلاحيات بتتراجع مع كل طلب.")} actions={actions} />}
    {isDemo && <Notice tone="info">{t("Read-only in role preview. Approving emails and editing permissions are off.", "للقراءة فقط في معاينة الأدوار. اعتماد البريد وتعديل الصلاحيات متوقفان.")}</Notice>}
    {error && !approveOpen && !member && <div className="form-error" role="alert">{error}</div>}

    <section className="st-flat section-gap" aria-label={t("Team", "الفريق")}>
      <FilterBar
        lang={lang}
        search={{ value: query, onChange: setQuery, placeholder: t("Search name or email", "ابحث بالاسم أو البريد") }}
        filters={[
          { key: "role", label: t("Role", "الدور"), value: roleFilter, onChange: setRoleFilter, options: [{ value: "all", label: t("All roles", "كل الأدوار") }, { value: "owner", label: t("Owner", "المالك") }, ...roles.map((item) => ({ value: item.id, label: t(item.en, item.ar) }))] },
          { key: "status", label: t("Status", "الحالة"), value: statusFilter, onChange: setStatusFilter, options: [{ value: "all", label: t("Any status", "أي حالة") }, { value: "active", label: t("Active", "نشط") }, { value: "inactive", label: t("Inactive", "غير نشط") }] },
        ]}
        onClear={() => { setQuery(""); setRoleFilter("all"); setStatusFilter("all"); }}
        resultCount={loading ? undefined : visible.length}
      />
      <DataTable<StaffMember>
        lang={lang}
        caption={t("Team members", "أعضاء الفريق")}
        rows={visible}
        rowKey={(row) => row.userId}
        loading={loading}
        error={loadError || null}
        onRetry={() => void load()}
        onRowClick={openMember}
        selectedKey={memberId}
        initialSort={{ key: "name", direction: "asc" }}
        columns={[
          { key: "name", header: t("Member", "العضو"), primary: true, sortable: true, sortValue: (row) => memberName(row) || row.email,
            render: (row) => <span className="st-member-cell"><span>{memberName(row) || row.email || t("Unnamed", "بدون اسم")}</span>{row.name && row.email && <small dir="ltr">{row.email}</small>}{isDemoMember(row) && <small>{t("Demo account", "حساب تجريبي")}</small>}</span> },
          { key: "role", header: t("Role", "الدور"), sortable: true, sortValue: (row) => roleLabel(row.role), render: (row) => roleLabel(row.role) },
          { key: "branches", header: t("Branches", "الفروع"), render: memberBranches },
          { key: "custom", header: t("Permissions", "الصلاحيات"), hideOnCard: true, render: (row) => row.role === "owner"
            ? <span className="st-member-note"><Lock size={12} aria-hidden="true" />{t("Full access, read-only", "كل الصلاحيات، للقراءة فقط")}</span>
            : overrideCount(row) ? t(`${overrideCount(row)} custom`, `${overrideCount(row)} مخصصة`) : t("Same as role", "حسب الدور") },
          { key: "status", header: t("Status", "الحالة"), render: (row) => <StatusBadge status={row.status} domain="staff" lang={lang} /> },
        ]}
        empty={payload.members.length === 0
          ? <EmptyState title={t("No team members yet", "لا يوجد أعضاء بعد")} text={t("Approve a work email; the account appears after first sign-in.", "اعتمد بريد شغل؛ الحساب بيظهر بعد أول دخول.")} action={approveButton}/>
          : <EmptyState variant="no-results" title={t("No matching members", "مفيش نتايج")} action={<button type="button" className="btn" onClick={() => { setQuery(""); setRoleFilter("all"); setStatusFilter("all"); }}>{t("Clear filters", "مسح التصفية")}</button>} />}
      />
    </section>

    {!isDemo && <section className="st-flat section-gap" aria-label={t("Pending approvals", "موافقات معلقة")}>
      <h2 className="st-h2">{t("Pending approvals", "موافقات معلقة")}</h2>
      <DataTable<StaffInvitation>
        lang={lang}
        caption={t("Pending approvals", "موافقات معلقة")}
        rows={payload.invitations}
        rowKey={(row) => row.id}
        loading={loading}
        columns={[
          { key: "email", header: t("Email", "البريد"), primary: true, mono: true, render: (row) => row.email },
          { key: "role", header: t("Role", "الدور"), render: (row) => roleLabel(row.role) },
          { key: "branches", header: t("Branches", "الفروع"), render: (row) => branchLabel(row.branchIds) },
          { key: "status", header: t("Status", "الحالة"), render: () => <StatusBadge status="pending" domain="staff" lang={lang} /> },
          { key: "actions", header: "", hideOnCard: false, render: (row) => <button type="button" className="btn btn-sm btn-danger" onClick={() => setRevokeTarget(row)}>{t("Cancel", "إلغاء")}</button> },
        ]}
        empty={<EmptyState title={t("No pending approvals", "لا توجد موافقات معلقة")} action={approveButton} />}
      />
    </section>}

    {capabilityInfo && <div className="section-gap" ref={matrixRef} id="staff-role-matrix">
      <Collapsible title={t("What each role can do", "ما يستطيع كل دور فعله")} open={matrixOpen} onToggle={setMatrixOpen}>
        <div className="st-matrix-wrap">
          <table className="st-matrix">
            <caption className="sr-only">{t("Role defaults", "افتراضات الأدوار")}</caption>
            <thead><tr>
              <th scope="col">{t("Capability", "الصلاحية")}</th>
              {(["owner", ...roles.map((item) => item.id)] as GarageRole[]).map((id) => <th scope="col" className="st-switch" key={id}>{roleLabel(id)}</th>)}
            </tr></thead>
            <tbody>{capabilityInfo.all.map((capability) => <tr key={capability}>
              <th scope="row">{capLabel(capability)}{capHint(capability) && <span className="st-matrix-hint">{capHint(capability)}</span>}</th>
              {(["owner", ...roles.map((item) => item.id)] as GarageRole[]).map((id) => {
                const on = id === "owner" || (capabilityInfo.roleDefaults[id]?.includes(capability) ?? false);
                return <td className="st-switch" key={id}><span className={on ? "st-yes" : "st-no"} aria-label={on ? t("Yes", "أيوه") : t("No", "لا")}>{on ? "✓" : "—"}</span></td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </Collapsible>
    </div>}

    <DetailDrawer
      open={approveOpen}
      onClose={() => setApproveOpen(false)}
      lang={lang}
      title={t("Approve a work email", "اعتمد بريد شغل")}
      footer={<>
        <button type="button" className="btn" onClick={() => setApproveOpen(false)}>{t("Cancel", "إلغاء")}</button>
        <button type="submit" form="staff-approve-form" className="btn btn-primary" disabled={saving || !branchIds.length || !email.trim()}>{saving ? t("Saving…", "بنحفظ…") : t("Approve", "اعتمد")}</button>
      </>}
    >
      <form id="staff-approve-form" className="st-form" onSubmit={(event) => void submitApproval(event)}>
        <FormSection title={t("Who", "مين")} columns={1}>
          <Field label={t("Work email", "بريد الشغل")} required hint={t("They sign in with Google. No message is sent.", "بيدخل بجوجل. مفيش رسالة بتتبعت.")}>
            <input className="field-input" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@gmail.com" dir="ltr" />
          </Field>
          <Field label={t("Role", "الدور")} required hint={t("Owner access cannot be approved here.", "صلاحية المالك مش بتتمنح من هنا.")}>
            <select className="select field-select" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
              {roles.map((item) => <option key={item.id} value={item.id}>{t(item.en, item.ar)}</option>)}
            </select>
          </Field>
          <Field label={t("Branches", "الفروع")} required>
            <div className="st-branch-checks" role="group" aria-label={t("Branches", "الفروع")}>
              {state.branches.map((branch) => <label className="st-check" key={branch.id}>
                <input type="checkbox" checked={branchIds.includes(branch.id)} onChange={(event) => setBranchIds((current) => event.target.checked ? [...new Set([...current, branch.id])] : current.filter((id) => id !== branch.id))} />
                {branch.name}
              </label>)}
            </div>
          </Field>
        </FormSection>
        <RequiredNote text={t("Required", "مطلوب")} />
        {error && <div className="form-error" role="alert">{error}</div>}
      </form>
    </DetailDrawer>

    <DetailDrawer
      open={Boolean(member)}
      onClose={closeMember}
      lang={lang}
      wide
      title={member ? (memberName(member) || member.email) : ""}
      subtitle={member ? `${roleLabel(member.role)} · ${memberBranches(member)}` : undefined}
      footer={member && editable(member) && capabilityInfo ? <>
        <button type="button" className="btn btn-danger" disabled={saving} onClick={() => setRemoveTarget(member)}>{t("Remove access", "سحب الصلاحية")}</button>
        <button type="button" className="btn" disabled={saving || !Object.keys(draft).length} onClick={() => setDraft({})}>{t("Reset to role default", "رجوع لافتراضي الدور")}</button>
        <button type="button" className="btn btn-primary" disabled={saving || !dirty} onClick={() => void savePermissions(member, draft)}>{t("Save permissions", "احفظ الصلاحيات")}</button>
      </> : member && canManage && member.status === "active" && member.role !== "owner" && !isDemoMember(member) && member.userId !== actor?.userId ? <button type="button" className="btn btn-danger" onClick={() => setRemoveTarget(member)}>{t("Remove access", "سحب الصلاحية")}</button> : undefined}
    >
      {member && <div className="st-form">
        <dl className="st-kv">
          <div><dt>{t("Email", "البريد")}</dt><dd dir="ltr">{member.email || "—"}</dd></div>
          <div><dt>{t("Status", "الحالة")}</dt><dd><StatusBadge status={member.status} domain="staff" lang={lang} /></dd></div>
          <div><dt>{t("Role", "الدور")}</dt><dd>{roleLabel(member.role)}</dd></div>
          <div><dt>{t("Branches", "الفروع")}</dt><dd>{memberBranches(member)}</dd></div>
        </dl>
        {error && <div className="form-error" role="alert">{error}</div>}
        {member.role === "owner"
          ? <p className="form-hint st-member-note"><Lock size={12} aria-hidden="true" />{t("Owner permissions are fixed and cannot be edited.", "صلاحيات المالك ثابتة ولا يمكن تعديلها.")}</p>
          : capabilityInfo
            ? groups.map((group) => <Collapsible key={group.id} title={group[lang]} defaultOpen>
              <div className="st-matrix-wrap"><table className="st-matrix">
                <caption className="sr-only">{group[lang]}</caption>
                <thead><tr><th scope="col">{t("Capability", "الصلاحية")}</th><th scope="col" className="st-switch">{t("Role default", "افتراضي")}</th><th scope="col" className="st-switch">{t("Allowed", "مسموح")}</th></tr></thead>
                <tbody>{group.capabilities.map((capability) => {
                  const base = capabilityInfo.roleDefaults[member.role]?.includes(capability) ?? false;
                  const locked = capabilityInfo.ownerOnly.includes(capability);
                  const on = effectiveAllowed(capabilityInfo.roleDefaults[member.role] ?? [], draft, capability);
                  return <tr key={capability} data-changed={capability in draft ? "true" : "false"}>
                    <th scope="row">{capLabel(capability)}{locked && <span className="st-lock"> · {t("Owner only", "للمالك فقط")}</span>}{capHint(capability) && <span className="st-matrix-hint">{capHint(capability)}</span>}</th>
                    <td className="st-switch"><span className={base ? "st-yes" : "st-no"}>{base ? "✓" : "—"}</span></td>
                    <td className="st-switch"><input type="checkbox" aria-label={capLabel(capability)} checked={on} disabled={locked || saving || !editable(member)}
                      onChange={(event) => setDraft((current) => toggleOverride(current, capability, event.target.checked, base))} /></td>
                  </tr>;
                })}</tbody>
              </table></div>
            </Collapsible>)
            : <EmptyState title={t("Permissions unavailable", "الصلاحيات مش متاحة")} />}
      </div>}
    </DetailDrawer>

    <ConfirmDialog
      open={Boolean(removeTarget)} danger lang={lang} busy={saving}
      title={t("Remove this access?", "تسحب الصلاحية دي؟")}
      body={t("Their next request is denied. Business records stay unchanged.", "طلبه الجاي هيترفض. سجلات الشغل ماتتغيرش.")}
      confirmLabel={t("Remove access", "سحب الصلاحية")}
      onCancel={() => setRemoveTarget(null)} onConfirm={() => void confirmRemove()}
    />
    <ConfirmDialog
      open={Boolean(revokeTarget)} danger lang={lang} busy={saving}
      title={t("Cancel this approval?", "تلغي الموافقة دي؟")}
      body={t("That email will no longer be able to sign in. An account that already joined is not removed.", "لن يتمكن هذا البريد من الدخول. الحساب اللي دخل بالفعل مش هيتحذف.")}
      confirmLabel={t("Cancel approval", "إلغاء الموافقة")} cancelLabel={t("Keep", "إبقاء")}
      onCancel={() => setRevokeTarget(null)} onConfirm={() => void confirmRevoke()}
    />
  </>;
}
