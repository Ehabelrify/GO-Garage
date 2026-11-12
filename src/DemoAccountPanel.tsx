import { useCallback, useEffect, useState } from "react";
import { ArrowUpLeft, ArrowUpRight, Check, CircleAlert, LoaderCircle, ShieldCheck, Wrench } from "lucide-react";
import "./DemoAccountPanel.css";

type DemoRole = "owner" | "branch-manager" | "receptionist" | "technician";
type DemoAccount = { id: string; email: string; name: string; role: DemoRole };
type DemoSessionResponse = {
  enabled: boolean;
  accounts: DemoAccount[];
  actor?: { email: string; name: string; role: string };
};

type DemoAccountPanelProps = { lang: "ar" | "en"; onSignedIn: () => void };

const copy = {
  ar: {
    eyebrow: "حسابات للعرض · بيئة التطوير",
    title: "جرّب مساحة الشغل",
    intro: "اختار دور وشوف Garage OS من وجهة نظر فريق الفرع.",
    current: "أنت دلوقتي داخل بحساب للعرض",
    currentIntro: "الجلسة دي شغالة بهوية مؤقتة للعرض.",
    continue: "كمّل لمساحة الشغل",
    choose: "اختار حساب للعرض",
    note: "الحسابات دي مؤقتة للتطوير، ومش حسابات موظفين حقيقية.",
    loading: "بنتأكد إن حسابات العرض متاحة",
    loadError: "ماقدرناش نحمّل حسابات العرض.",
    retry: "جرّب تاني",
    requestError: "ماقدرناش نبدأ جلسة العرض. جرّب تاني.",
    accountDisabled: "الحساب ده اتوقف.",
    branchUnavailable: "لازم يتجهز فرع قبل ما الحساب ده يشتغل.",
    accountConflict: "الحساب ده متعارض مع حساب تطوير موجود.",
    pending: "بنفتح مساحة الشغل…",
    roles: {
      owner: "المالك",
      "branch-manager": "مدير الفرع",
      receptionist: "موظف الاستقبال",
      technician: "الفني",
    },
  },
  en: {
    eyebrow: "DEMO ACCESS · DEVELOPMENT",
    title: "Explore the workspace",
    intro: "Choose a role to see Garage OS through the eyes of a branch team.",
    current: "Your demo session is ready",
    currentIntro: "You’re using a temporary demo identity.",
    continue: "Continue to workspace",
    choose: "Choose a demo identity",
    note: "Temporary development-only accounts — these are not real staff identities.",
    loading: "Checking demo account availability",
    loadError: "Demo accounts could not be loaded.",
    retry: "Try again",
    requestError: "The demo session could not be started. Please try again.",
    accountDisabled: "This demo identity has been disabled.",
    branchUnavailable: "A branch must be configured before this session can start.",
    accountConflict: "This demo identity conflicts with an existing development account.",
    pending: "Opening your workspace…",
    roles: {
      owner: "Owner",
      "branch-manager": "Branch manager",
      receptionist: "Receptionist",
      technician: "Technician",
    },
  },
} as const;

const roleOrder: DemoRole[] = ["owner", "branch-manager", "receptionist", "technician"];

function isDemoRole(role: string): role is DemoRole {
  return roleOrder.includes(role as DemoRole);
}

export function DemoAccountPanel({ lang, onSignedIn }: DemoAccountPanelProps) {
  const t = copy[lang];
  const [availability, setAvailability] = useState<"loading" | "ready" | "error" | "disabled">("loading");
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [actor, setActor] = useState<DemoSessionResponse["actor"]>();
  const [selectedId, setSelectedId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const loadDemoSession = useCallback(async (signal?: AbortSignal) => {
    setAvailability("loading");
    setError("");
    try {
      const response = await fetch("/api/demo/session", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok) throw new Error("availability");
      const data = await response.json() as DemoSessionResponse;
      if (!data.enabled) {
        setAvailability("disabled");
        return;
      }
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setActor(data.actor);
      setSelectedId((current) => current || data.accounts?.[0]?.id || "");
      setAvailability("ready");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setAvailability("error");
      setError(t.loadError);
    }
  }, [t.loadError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDemoSession(controller.signal);
    return () => controller.abort();
  }, [loadDemoSession]);

  if (availability === "disabled") return null;

  const currentRole = actor && isDemoRole(actor.role) ? t.roles[actor.role] : actor?.role;
  const Arrow = lang === "ar" ? ArrowUpLeft : ArrowUpRight;

  async function startSession() {
    if (!selectedId || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/demo/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ accountId: selectedId }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; code?: string } | null;
      if (!response.ok || !result?.ok) {
        const message = result?.code === "DEMO_ACCOUNT_DISABLED" ? t.accountDisabled
          : result?.code === "DEMO_BRANCH_UNAVAILABLE" ? t.branchUnavailable
            : result?.code === "DEMO_ACCOUNT_CONFLICT" ? t.accountConflict
              : t.requestError;
        throw new Error(message);
      }
      onSignedIn();
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : t.requestError);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={`demo-panel ${lang === "en" ? "demo-panel-en" : ""}`} dir={lang === "ar" ? "rtl" : "ltr"} aria-labelledby="demo-panel-title">
      <div className="demo-panel-topline">
        <span className="demo-panel-icon" aria-hidden="true"><Wrench size={17} strokeWidth={1.8} /></span>
        <span>{t.eyebrow}</span>
        <span className="demo-panel-rule" />
      </div>

      {availability === "loading" ? (
        <div className="demo-loading" role="status" aria-live="polite">
          <span className="demo-skeleton demo-skeleton-title" />
          <span className="demo-skeleton demo-skeleton-copy" />
          <span className="demo-skeleton demo-skeleton-card" />
          <span className="demo-skeleton demo-skeleton-card short" />
          <span className="demo-loading-label">{t.loading}</span>
        </div>
      ) : availability === "error" ? (
        <div className="demo-error-state" role="alert">
          <span className="demo-alert-icon"><CircleAlert size={19} /></span>
          <div><h2 id="demo-panel-title">{t.title}</h2><p>{error}</p></div>
          <button className="demo-retry" type="button" onClick={() => void loadDemoSession()}>{t.retry}</button>
        </div>
      ) : actor ? (
        <div className="demo-current">
          <div className="demo-heading">
            <span className="demo-check-mark"><Check size={17} /></span>
            <div>
              <h2 id="demo-panel-title">{t.current}</h2>
              <p>{t.currentIntro}</p>
            </div>
          </div>
          <div className="demo-identity">
            <span className="demo-avatar" aria-hidden="true">{actor.name?.trim().slice(0, 1) || "G"}</span>
            <span className="demo-identity-copy">
              <strong>{actor.name}</strong>
              <small>{currentRole}</small>
              <span dir="ltr">{actor.email}</span>
            </span>
            <ShieldCheck className="demo-identity-shield" size={18} aria-hidden="true" />
          </div>
          <p className="demo-disclaimer">{t.note}</p>
          <button className="demo-submit" type="button" onClick={onSignedIn}>
            {t.continue}<Arrow size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="demo-choose">
          <div className="demo-heading">
            <div>
              <h2 id="demo-panel-title">{t.title}</h2>
              <p>{t.intro}</p>
            </div>
          </div>
          <fieldset className="demo-account-fieldset" disabled={pending}>
            <legend>{t.choose}</legend>
            <div className="demo-account-list">
              {roleOrder.map((role) => {
                const account = accounts.find((item) => item.role === role);
                if (!account) return null;
                const active = selectedId === account.id;
                return (
                  <label className={`demo-account-option ${active ? "is-selected" : ""}`} key={account.id}>
                    <input
                      type="radio"
                      name="demo-account"
                      value={account.id}
                      checked={active}
                      onChange={() => { setSelectedId(account.id); setError(""); }}
                    />
                    <span className="demo-account-copy">
                      <strong>{account.name || t.roles[role]}</strong>
                      <small>{t.roles[role]}</small>
                        <span className="demo-account-email" dir="ltr">{account.email}</span>
                    </span>
                    <span className="demo-radio" aria-hidden="true"><span /></span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {error && <p className="demo-inline-error" role="alert"><CircleAlert size={15} />{error}</p>}
          <p className="demo-disclaimer">{t.note}</p>
          <button className="demo-submit" type="button" disabled={!selectedId || pending} onClick={() => void startSession()}>
            {pending ? <><LoaderCircle size={16} className="demo-spinner" aria-hidden="true" />{t.pending}</> : <>{t.continue}<Arrow size={16} aria-hidden="true" /></>}
          </button>
          <span className="demo-server-note" aria-hidden="true">ROLE ACCESS IS VERIFIED SERVER-SIDE</span>
        </div>
      )}
    </section>
  );
}
