import { useEffect, useState, type FormEvent } from "react";
import { MailPlus, RefreshCw, ShieldCheck, UserMinus, UserRoundPlus, X } from "lucide-react";
import type { GarageRole, GarageState } from "../types";
import { useGarageStore } from "../store";
import { EmptyState, PageHeading, SectionTitle, type Lang, type ModalConfig, type Translator } from "../ui";

interface StaffPageProps {
  lang: Lang;
  t: Translator;
  state: GarageState;
  notify: (message: string) => void;
  confirmModal: (config: ModalConfig | null) => void;
}

interface StaffMember {
  userId: string;
  email: string;
  name: string;
  role: GarageRole;
  branchIds: string[];
  status: "active" | "inactive";
}

interface StaffInvitation {
  id: string;
  email: string;
  role: GarageRole;
  branchIds: string[];
  status: string;
}

interface StaffPayload {
  members: StaffMember[];
  invitations: StaffInvitation[];
}

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
  return body as T;
}

export function StaffPage({ lang, t, state, notify, confirmModal }: StaffPageProps) {
  const { actor } = useGarageStore();
  const isDemo = actor?.isDemo === true;
  const [payload, setPayload] = useState<StaffPayload>({ members: [], invitations: [] });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<GarageRole, "owner">>("receptionist");
  const [branchIds, setBranchIds] = useState<string[]>(state.branches.map((branch) => branch.id));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setPayload(await staffRequest<StaffPayload>("/api/staff"));
      setError("");
    } catch {
      setError(t("Could not load staff access.", "ماقدرناش نحمّل صلاحيات الفريق."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const createInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await staffRequest("/api/staff/invitations", {
        method: "POST",
        body: JSON.stringify({ email, role, branchIds }),
      });
      setEmail("");
      await load();
      notify(t("Individual access invitation sent.", "اتبعت دعوة دخول خاصة."));
    } catch (issue) {
      const code = issue instanceof Error ? issue.message : "REQUEST_FAILED";
      setError(code === "INVALID_BRANCH"
        ? t("Choose an available branch.", "اختار فرع متاح.")
        : t("The invitation could not be sent. Check the email and Clerk delivery settings.", "ماقدرناش نبعت الدعوة. راجع البريد وإعدادات إرسال Clerk."));
    } finally {
      setSaving(false);
    }
  };

  const revokeInvitation = (invitation: StaffInvitation) => confirmModal({
    title: t("Revoke this invitation?", "تلغي الدعوة دي؟"),
    body: t("The sign-up link will stop working. This does not remove an account that has already joined.", "رابط التسجيل هيقف عن العمل، لكن ده مش هيحذف حساب اتعمل بالفعل."),
    danger: true,
    confirm: async () => {
      try {
        await staffRequest(`/api/staff/invitations/${encodeURIComponent(invitation.id)}`, { method: "DELETE" });
        await load();
        notify(t("Invitation revoked.", "الدعوة اتلغت."));
      } catch {
        setError(t("Could not revoke this invitation.", "ماقدرناش نلغي الدعوة."));
      } finally {
        confirmModal(null);
      }
    },
  });

  const removeMember = (member: StaffMember) => confirmModal({
    title: t("Remove this staff access?", "تشيل صلاحية الموظف ده؟"),
    body: t("Their next request will be denied. Existing business records remain unchanged.", "طلبه الجاي هيرفض، لكن سجلات الشغل الحالية هتفضل زي ما هي."),
    danger: true,
    confirm: async () => {
      try {
        const result = await staffRequest<{ sessionsRevoked: boolean }>(`/api/staff/${encodeURIComponent(member.userId)}`, { method: "DELETE" });
        await load();
        notify(result.sessionsRevoked
          ? t("Staff access removed and active sessions revoked.", "الصلاحية اتشالت والجلسات المفتوحة اتقفلت.")
          : t("Access is blocked, but an active sign-in could not be closed.", "الوصول اتوقف، لكن ماقدرناش نقفل جلسة مفتوحة."));
      } catch (issue) {
        const code = issue instanceof Error ? issue.message : "";
        setError(code === "LAST_OWNER"
          ? t("At least one active owner must remain.", "لازم يفضل فيه مالك واحد نشط على الأقل.")
          : t("Could not remove this staff access.", "ماقدرناش نشيل صلاحية الموظف."));
      } finally {
        confirmModal(null);
      }
    },
  });

  const roleLabel = (value: GarageRole) => {
    const match = roles.find((item) => item.id === value);
    if (value === "owner") return t("Owner", "المالك");
    return match ? t(match.en, match.ar) : value;
  };
  const branchLabel = (ids: string[]) => ids
    .map((id) => state.branches.find((branch) => branch.id === id))
    .filter(Boolean)
    .map((branch) => branch!.name)
    .join(lang === "ar" ? "، " : ", ");

  return <>
    <PageHeading
      eyebrow={t("Owner account · Security", "حساب المالك · الأمان")}
      title={t("Staff access", "صلاحيات الموظفين")}
      subtitle={t("Create individual, role-based invitations and control the branches each account can access.", "ابعت دعوة خاصة لكل شخص حسب دوره وحدد الفروع اللي حسابه يقدر يدخل عليها.")}
      action={<button className="btn" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} />{t("Refresh", "تحديث")}</button>}
    />

    <div className="security-note"><ShieldCheck size={17} /><div>
      <strong>{t("Access is enforced on every API request.", "النظام بيتأكد من الصلاحيات مع كل طلب.")}</strong>
      <span>{isDemo
        ? t("These temporary development identities use their real roles and branch access. Live invitations and account changes are disabled.", "حسابات التطوير المؤقتة دي بتستخدم أدوار وصلاحيات الفروع الفعلية. الدعوات الحقيقية وتغييرات الحسابات مش متاحة.")
        : t("Each invited account receives its actual role and branch scope; a role selector is not used to simulate access.", "كل حساب مدعو بياخد دوره وصلاحيات فروعه الفعلية؛ مش بنستخدم اختيار دور لمحاكاة الصلاحيات.")}</span>
    </div></div>

    {!isDemo && <section className="panel staff-invite-panel">
      <SectionTitle title={t("Invite a team member", "ابعت دعوة لفرد من الفريق")} description={t("Clerk sends a personal invitation to the verified email you enter. Temporary demo identities are separate.", "Clerk بيبعت دعوة خاصة للبريد الموثق اللي هتدخله. حسابات العرض المؤقتة منفصلة عنها.")} />
      <form onSubmit={(event) => void createInvitation(event)}>
        <div className="form-grid">
          <div className="form-field"><label className="field-label" htmlFor="staff-email">{t("Work email", "بريد الشغل")}</label>
            <input id="staff-email" className="field-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
          </div>
          <div className="form-field"><label className="field-label" htmlFor="staff-role">{t("Role", "الدور")}</label>
            <select id="staff-role" className="field-select" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
              {roles.map((item) => <option key={item.id} value={item.id}>{t(item.en, item.ar)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-field staff-branch-field"><span className="field-label">{t("Branch access", "الفروع المسموح له يدخلها")}</span>
          <div className="branch-checkbox-list">
            {state.branches.map((branch) => <label className="branch-checkbox" key={branch.id}>
              <input type="checkbox" checked={branchIds.includes(branch.id)} onChange={(event) => setBranchIds((current) => event.target.checked
                ? [...new Set([...current, branch.id])]
                : current.filter((id) => id !== branch.id))} />
              <span>{branch.name}</span>
            </label>)}
          </div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions"><span className="form-hint">{t("Invitation roles cannot grant Owner access.", "الدعوات دي مش بتدي صلاحية المالك.")}</span>
          <button className="btn btn-primary" type="submit" disabled={saving || !branchIds.length}><MailPlus size={16} />{saving ? t("Sending…", "بنبعت…") : t("Send invitation", "ابعت الدعوة")}</button>
        </div>
      </form>
    </section>}

    <section className="panel section-gap">
      <SectionTitle title={t("Active accounts", "الحسابات النشطة")} description={t("Access is removed immediately when a membership is disabled.", "الصلاحية بتتشال فور إيقاف العضوية.")} />
      {loading
        ? <div className="loading-inline">{t("Loading access records…", "بنحمّل سجلات الصلاحيات…")}</div>
        : payload.members.length
          ? <div className="table-wrap"><table><thead><tr>
            <th>{t("Account", "الحساب")}</th><th>{t("Role", "الدور")}</th><th>{t("Branches", "الفروع")}</th><th>{t("Status", "الحالة")}</th><th>{t("Actions", "الإجراءات")}</th>
          </tr></thead><tbody>
            {payload.members.map((member) => <tr key={member.userId}>
              <td><div className="primary-cell">{member.name || member.email}</div><div className="secondary-cell">{member.email}{member.userId.startsWith("demo-") ? ` · ${t("Demo account", "حساب تجريبي")}` : ""}</div></td>
              <td>{roleLabel(member.role)}</td><td>{member.role === "owner" ? t("All branches", "كل الفروع") : branchLabel(member.branchIds)}</td>
              <td><span className={`member-status ${member.status}`}>{member.status === "active" ? t("Active", "نشط") : t("Inactive", "مش نشط")}</span></td>
              <td>{member.status === "active" && !isDemo && <button className="btn btn-sm btn-danger" type="button" onClick={() => removeMember(member)}><UserMinus size={14} />{t("Remove", "إزالة")}</button>}</td>
            </tr>)}
          </tbody></table></div>
          : <EmptyState title={t("No staff accounts", "مفيش حسابات للفريق")} text={t("An account appears here after its invite is accepted and its email is verified.", "الحساب هيظهر هنا بعد قبول الدعوة والتأكد من البريد.")} />}
    </section>

    <section className="panel section-gap">
      <SectionTitle title={t("Open invitations", "الدعوات المفتوحة")} description={isDemo
        ? t("Live invitations are unavailable during the temporary demo.", "الدعوات الحقيقية مش متاحة في العرض المؤقت.")
        : t("Pending invitations are managed by Clerk and tied to their intended email.", "Clerk بيدير الدعوات المعلقة، وكل دعوة مرتبطة بالبريد المقصود.")} />
      {!isDemo && payload.invitations.length
        ? <div className="invitation-list">{payload.invitations.map((invitation) => <div className="invitation-row" key={invitation.id}>
          <div className="invitation-icon"><UserRoundPlus size={17} /></div>
          <div className="invitation-copy"><strong>{invitation.email}</strong><span>{roleLabel(invitation.role)} · {branchLabel(invitation.branchIds)}</span></div>
          <span className="member-status pending">{t("Invited", "وصلته دعوة")}</span>
          <button className="icon-button" type="button" aria-label={t("Revoke invitation", "إلغاء الدعوة")} onClick={() => revokeInvitation(invitation)}><X size={16} /></button>
        </div>)}</div>
        : <EmptyState title={isDemo ? t("Live invitations are off", "الدعوات الحقيقية متوقفة") : t("No open invitations", "مفيش دعوات مفتوحة")}
            text={isDemo ? t("Temporary demo accounts do not send or revoke real Clerk invitations.", "حسابات العرض المؤقتة مش بتبعت ولا بتلغي دعوات Clerk حقيقية.") : t("New personal invitations will appear here until accepted or revoked.", "الدعوات الجديدة هتظهر هنا لحد ما تتقبل أو تتلغي.")} />}
    </section>
  </>;
}
