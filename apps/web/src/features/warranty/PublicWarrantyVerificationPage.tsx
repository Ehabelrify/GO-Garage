import { useEffect, useState } from "react";
import { BadgeCheck, CalendarDays, MapPin, ShieldCheck, Wrench } from "lucide-react";
import type { Locale, WarrantyStatus } from "@garage/domain";
import "./PublicWarrantyVerificationPage.css";

export interface PublicWarrantyData {
  verified: true;
  status: WarrantyStatus;
  serviceName?: { en: string; ar: string };
  branchName?: { en: string; ar: string };
  startDate?: string;
  expiresOn?: string;
  coverage?: { kind: "fixed" | "lifetime"; publicWording?: { ar: string; en: string } };
}

interface VerificationCardProps {
  data: PublicWarrantyData;
  lang: Locale;
}

const statusCopy: Record<WarrantyStatus, { en: string; ar: string }> = {
  active: { en: "Active coverage", ar: "الضمان ساري" },
  expired: { en: "Coverage expired", ar: "انتهت مدة الضمان" },
  terminated: { en: "Coverage terminated", ar: "انتهت التغطية" },
  void: { en: "Coverage void", ar: "الضمان ملغي" },
};

function dateText(value: string, lang: Locale) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    day: "numeric", month: "long", year: "numeric",
  }).format(date);
}

export function WarrantyVerificationCard({ data, lang }: VerificationCardProps) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const status = statusCopy[data.status];
  const serviceName = data.serviceName?.[lang];
  const branchName = data.branchName?.[lang];
  return <article className={`public-warranty-card status-${data.status}`} dir={lang === "ar" ? "rtl" : "ltr"}>
    <div className="public-card-brand">
      <span className="public-brand-mark"><ShieldCheck size={19} /></span>
      <span><strong>GO STORES</strong><small>{t("WARRANTY RECORD", "سجل الضمان")}</small></span>
    </div>
    <div className="public-card-status">
      <span className="public-status-mark"><BadgeCheck size={23} /></span>
      <div><span>{t("QR verification", "التحقق برمز QR")}</span><h1>{t(status.en, status.ar)}</h1></div>
    </div>
    <dl className="public-warranty-details">
      {serviceName && <div><dt><Wrench size={15} />{t("Service", "الخدمة")}</dt><dd>{serviceName}</dd></div>}
      {branchName && <div><dt><MapPin size={15} />{t("Branch", "الفرع")}</dt><dd>{branchName}</dd></div>}
      {data.startDate && <div><dt><CalendarDays size={15} />{t("Coverage starts", "بداية الضمان")}</dt><dd>{dateText(data.startDate, lang)}</dd></div>}
      {data.expiresOn && <div><dt><CalendarDays size={15} />{t("Coverage ends", "نهاية الضمان")}</dt><dd>{dateText(data.expiresOn, lang)}</dd></div>}
      {data.coverage?.kind === "lifetime" && <div><dt><ShieldCheck size={15} />{t("Coverage", "التغطية")}</dt><dd>{data.coverage.publicWording?.[lang] ?? t("Lifetime terms apply; eligibility is reviewed against the approved conditions.", "تطبق شروط التغطية مدى الحياة؛ وتراجع الأهلية وفق الشروط المعتمدة.")}</dd></div>}
    </dl>
    <div className="public-card-foot">{t("Verified by Go Stores · No sign-in required", "تم التحقق بواسطة Go Stores · دون حاجة لتسجيل الدخول")}</div>
  </article>;
}

export function PublicWarrantyVerificationPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [lang, setLang] = useState<Locale>(() => {
    if (typeof window === "undefined") return "ar";
    return window.localStorage.getItem("garage-os-locale") === "en" ? "en" : "ar";
  });
  const [data, setData] = useState<PublicWarrantyData | null>(null);
  const [state, setState] = useState<"loading" | "verified" | "not-found" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) {
      setState("not-found");
      return;
    }
    const controller = new AbortController();
    setData(null);
    setState("loading");
    void fetch(`/api/public/warranty-verification/${encodeURIComponent(token)}`, {
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) {
          setState("not-found");
          return;
        }
        if (!response.ok) throw new Error("verification-request-failed");
        const result = await response.json() as PublicWarrantyData;
        if (!result.verified) {
          setState("not-found");
          return;
        }
        setData(result);
        setState("verified");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [token, attempt]);

  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  return <main className="public-verification-page" dir={lang === "ar" ? "rtl" : "ltr"}>
    <header className="public-verification-header">
      <div className="public-header-brand"><span className="public-brand-mark"><Wrench size={17} /></span><strong>Garage OS</strong><span>·</span><small>GO STORES</small></div>
      <div className="public-language-switch" role="group" aria-label={t("Choose language", "اختر اللغة")}>
        <button type="button" aria-pressed={lang === "ar"} onClick={() => setLang("ar")}>العربية</button>
        <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
      </div>
    </header>
    <section className="public-verification-stage">
      {state === "loading" && <div className="public-verification-skeleton" role="status" aria-label={t("Checking warranty", "جارٍ التحقق من الضمان")}>
        <div /><div /><div /><div />
      </div>}
      {state === "verified" && data && <WarrantyVerificationCard data={data} lang={lang} />}
      {state === "not-found" && <div className="public-verification-message public-verification-not-found" role="status">
        <span className="public-verification-symbol"><ShieldCheck size={23} /></span>
        <h1>{t("Code not verified", "تعذر التحقق من الرمز")}</h1>
        <p>{t("This QR code is invalid, has been replaced, or is no longer available. Ask the workshop to check the printed card.", "رمز QR غير صحيح أو تم استبداله أو لم يعد متاحاً. اطلب من الورشة مراجعة البطاقة المطبوعة.")}</p>
      </div>}
      {state === "error" && <div className="public-verification-message" role="alert">
        <span className="public-verification-symbol"><ShieldCheck size={23} /></span>
        <h1>{t("We couldn’t complete the check", "تعذر إكمال التحقق")}</h1>
        <p>{t("The verification service is temporarily unavailable. Try again in a moment.", "خدمة التحقق غير متاحة مؤقتاً. حاول مرة أخرى بعد قليل.")}</p>
        <button className="public-retry-button" style={{ minHeight: 44 }} type="button" onClick={() => setAttempt((current) => current + 1)}>{t("Try again", "حاول مرة أخرى")}</button>
      </div>}
    </section>
    <footer className="public-verification-footer">
      <ShieldCheck size={14} />{t("A secure, read-only confirmation from Go Stores.", "تأكيد آمن للقراءة فقط من Go Stores.")}
    </footer>
  </main>;
}
