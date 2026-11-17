import { useEffect, useState } from "react";
import { useAuth, ClerkProvider, SignIn, SignUp } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { arSA } from "@clerk/localizations";
import { Redirect, Route, Router, Switch, Link, useLocation } from "wouter";
import { App } from "./App";
import { RouteChunk } from "./RouteChunk";
import { GarageStoreProvider } from "../shared/store";
import { DemoAccountPanel } from "../features/demo-auth/DemoAccountPanel";
import { ArrowUpLeft, ShieldCheck, Wrench } from "lucide-react";
import { useSavedLocale } from "../shared/locale";

const publicWarrantyPage = () => import("../features/warranty/PublicWarrantyVerificationPage").then((m) => ({ default: m.PublicWarrantyVerificationPage }));

function PublicWarrantyRoute({ params }: { params: { token: string } }) {
  const { locale } = useSavedLocale();
  return <RouteChunk loader={publicWarrantyPage} lang={locale} pageProps={{ params }} />;
}

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkLocalization = {
  ...arSA,
  formFieldInputPlaceholder__emailAddress: "اكتب بريدك الإلكتروني",
  signIn: {
    ...arSA.signIn,
    start: {
      ...arSA.signIn?.start,
      title: "أهلاً بيك تاني",
      subtitle: "سجّل دخولك لمساحة شغلك",
    },
  },
  signUp: {
    ...arSA.signUp,
    start: {
      ...arSA.signUp?.start,
      title: "إنشاء حساب للفريق",
      subtitle: "استخدم البريد اللي وصلته الدعوة",
    },
  },
};

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

const clerkAppearance = {
  theme: shadcn,
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#176d5c",
    colorForeground: "#1e332d",
    colorMutedForeground: "#687a73",
    colorDanger: "#ad423c",
    colorBackground: "#ffffff",
    colorInput: "#f7f9f7",
    colorInputForeground: "#1e332d",
    colorNeutral: "#1e332d",
    fontFamily: '"IBM Plex Sans Arabic", "IBM Plex Sans", sans-serif',
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: { width: "100%", display: "flex", justifyContent: "center" },
    cardBox: {
      width: "100%",
      maxWidth: "440px",
      overflow: "hidden",
      borderRadius: "18px",
      border: "1px solid #dce5e0",
      background: "#ffffff",
      boxShadow: "0 22px 58px rgba(27, 55, 45, 0.10)",
    },
    card: { border: "0", background: "transparent", boxShadow: "none" },
    footer: { border: "0", background: "transparent", boxShadow: "none" },
    headerTitle: { color: "#1e332d", fontSize: "24px", fontWeight: 700 },
    headerSubtitle: { color: "#687a73", lineHeight: 1.6 },
    socialButtonsBlockButtonText: { color: "#30443d", fontWeight: 600 },
    formFieldLabel: { color: "#30443d", fontWeight: 600 },
    formFieldInput: { color: "#1e332d", background: "#f7f9f7", borderColor: "#d6e1db" },
    footerActionLink: { color: "#176d5c", fontWeight: 700 },
    footerActionText: { color: "#687a73" },
    dividerText: { color: "#687a73" },
    identityPreviewEditButton: { color: "#176d5c" },
    formFieldSuccessText: { color: "#287454" },
    alertText: { color: "#a33e37" },
    formButtonPrimary: { background: "#176d5c", color: "#ffffff", borderRadius: "10px" },
    main: { gap: "16px" },
  },
};

function LoadingScreen() {
  const { locale } = useSavedLocale();
  return <div className="auth-loading" role="status" dir={locale === "ar" ? "rtl" : "ltr"}><div className="brand-mark"><Wrench size={20} /></div><span>{locale === "ar" ? "بنحمّل Garage OS..." : "Loading Garage OS..."}</span><div className="loading-line" /></div>;
}

function LandingPage() {
  const [, setLocation] = useLocation();
  const { locale, setLocale } = useSavedLocale();
  const t = (en: string, ar: string) => locale === "ar" ? ar : en;
  return <main className="landing-shell" dir={locale === "ar" ? "rtl" : "ltr"}>
    <header className="landing-header">
      <a className="brand brand-link" href="/" aria-label="Garage OS home">
        <span className="brand-mark"><Wrench size={19} /></span>
        <span><strong className="brand-name">Garage OS</strong><small className="brand-sub">GO STORES · EGYPT</small></span>
      </a>
      <div className="landing-header-actions"><button type="button" className="btn" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "English" : "العربية"}</button><Link className="btn btn-primary landing-sign-in" href="/sign-in">{t("Team sign in", "دخول الفريق")} <ArrowUpLeft size={15} /></Link></div>
    </header>
    <section className="landing-hero">
      <div className="landing-copy">
        <div className="landing-kicker"><ShieldCheck size={15} /> {t("Team operations workspace", "مساحة تشغيل للفريق")}</div>
        <h1>{t("Every vehicle in its place.", "كل عربية في مكانها.")}<br />{t("Everyone knows their role.", "وكل واحد عارف دوره.")}</h1>
        <p>{t("One workspace for bookings and vehicle progress across Go Stores branches, with clear operating settings and access for each role.", "مساحة واحدة لتنظيم الحجوزات ومتابعة العربيات بين فرعي Go Stores، بإعدادات تشغيل واضحة وصلاحيات مناسبة لكل دور.")}</p>
        <div className="landing-actions">
          <Link className="btn btn-primary" href="/sign-in">{t("Open workspace", "ادخل مساحة الشغل")} <ArrowUpLeft size={16} /></Link>
          <span>{t("Each team member has an individual invitation", "كل فرد في الفريق له دعوة خاصة")}</span>
        </div>
        {import.meta.env.DEV && <DemoAccountPanel lang={locale} onSignedIn={() => setLocation("/workspace/overview")} />}
      </div>
      <div className="landing-preview" aria-hidden="true">
        <div className="preview-top"><span className="preview-dot" /><span>GARAGE OS · ACCESS MODEL</span><span className="preview-date">ROLE-BASED WORKSPACE</span></div>
        <div className="preview-title">{t("Clear responsibilities for each account", "كل حساب له مسؤوليات واضحة")}</div>
        <div className="role-preview-list">
          <div><strong>{t("Owner", "المالك")}</strong><span>{t("Overview and operating settings", "نظرة عامة وإعدادات التشغيل")}</span></div>
          <div><strong>{t("Branch manager", "مدير الفرع")}</strong><span>{t("Team, bookings and workshop", "الفريق والحجوزات ومتابعة الشغل")}</span></div>
          <div><strong>{t("Reception", "الاستقبال")}</strong><span>{t("Customers and branch appointments", "العملاء ومواعيد الفرع")}</span></div>
          <div><strong>{t("Technician", "الفني")}</strong><span>{t("Assigned jobs", "العربيات وأوامر الشغل المسندة")}</span></div>
        </div>
        <div className="preview-footer"><span>{t("Access is checked by the system", "الصلاحيات بيتأكد منها النظام")}</span><span>{t("Individual invitations · branch access", "دعوة لكل فرد · صلاحيات واضحة لكل فرع")}</span></div>
      </div>
    </section>
    <section className="landing-footer">
      <span>GO STORES · INTERNAL OPERATIONS</span>
      <span>{t("Owner · Branch manager · Reception · Technician", "المالك · مدير الفرع · الاستقبال · الفني")}</span>
    </section>
  </main>;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  return isSignedIn ? <Redirect to="/workspace/overview" /> : <LandingPage />;
}

function SignInRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const { locale, setLocale } = useSavedLocale();
  const t = (en: string, ar: string) => locale === "ar" ? ar : en;
  if (!isLoaded) return <LoadingScreen />;
  if (isSignedIn) return <Redirect to="/workspace/overview" />;
  return <div className="auth-layout" dir={locale === "ar" ? "rtl" : "ltr"}>
    <div className="auth-story">
      <a className="brand brand-link" href="/"><span className="brand-mark"><Wrench size={19} /></span><span><strong className="brand-name">Garage OS</strong><small className="brand-sub">GO STORES · EGYPT</small></span></a>
      <div className="auth-story-copy"><div className="landing-kicker"><ShieldCheck size={15} /> {t("Team sign in", "دخول الفريق")}</div><h1>{t("Each account sees its own work.", "كل حساب بيشوف شغله بس.")}</h1><p>{t("The owner controls access. Role and branch permissions apply to data and actions.", "المالك هو اللي بيحدد الوصول، والصلاحيات بتتطبق حسب الدور والفرع على البيانات والإجراءات.")}</p></div>
      <div className="auth-story-footer"><span>{t("Individual invitation", "دعوة خاصة لكل فرد")}</span><span>{t("Role and branch access", "الصلاحيات حسب الدور والفرع")}</span></div>
    </div>
    <div className="auth-card-area">
      <div className="auth-card-top"><Link href="/">{t("Back to Garage OS", "ارجع لـ Garage OS")}</Link><button type="button" className="btn" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "English" : "العربية"}</button><span>{t("Secure sign in", "تسجيل دخول آمن")}</span></div>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={`${basePath}/workspace/overview`}
        appearance={clerkAppearance}
      />
      {import.meta.env.DEV && <DemoAccountPanel lang={locale} onSignedIn={() => setLocation("/workspace/overview")} />}
    </div>
  </div>;
}

function SignUpRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (isSignedIn) return <Redirect to="/workspace/overview" />;
  return <div className="auth-layout" dir="rtl">
    <div className="auth-story">
      <a className="brand brand-link" href="/"><span className="brand-mark"><Wrench size={19} /></span><span><strong className="brand-name">Garage OS</strong><small className="brand-sub">GO STORES · EGYPT</small></span></a>
      <div className="auth-story-copy"><div className="landing-kicker"><ShieldCheck size={15} /> حساب للفريق</div><h1>لكل شخص حسابه وصلاحيته.</h1><p>بعد إنشاء الحساب، لازم البريد يكون هو نفس البريد اللي المالك بعت له دعوة قبل ما تظهر أي بيانات تشغيل.</p></div>
      <div className="auth-story-footer"><span>إنشاء الحساب لوحده مش بيدي صلاحية</span><span>النظام بيتأكد من الصلاحية مع كل إجراء</span></div>
    </div>
    <div className="auth-card-area">
      <div className="auth-card-top"><Link href="/">ارجع لـ Garage OS</Link><span>إنشاء حساب للفريق</span></div>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={`${basePath}/workspace/overview`}
        appearance={clerkAppearance}
      />
    </div>
  </div>;
}

function ProtectedWorkspace() {
  const { isLoaded, isSignedIn } = useAuth();
  const [demoChecked, setDemoChecked] = useState(!import.meta.env.DEV);
  const [demoSignedIn, setDemoSignedIn] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV || isSignedIn) {
      setDemoChecked(true);
      setDemoSignedIn(false);
      return;
    }
    if (!isLoaded) return;
    setDemoChecked(false);
    const controller = new AbortController();
    void fetch("/api/demo/session", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return { enabled: false, actor: undefined };
        return await response.json() as { enabled: boolean; actor?: { role: string } };
      })
      .then((session) => {
        setDemoSignedIn(Boolean(session.enabled && session.actor));
        setDemoChecked(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDemoSignedIn(false);
          setDemoChecked(true);
        }
      });
    return () => controller.abort();
  }, [isLoaded, isSignedIn]);
  if (!isLoaded) return <LoadingScreen />;
  if (import.meta.env.DEV && !isSignedIn && !demoChecked) return <LoadingScreen />;
  if (!isSignedIn && !demoSignedIn) return <Redirect to="/" />;
  return <GarageStoreProvider><App /></GarageStoreProvider>;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  const { locale } = useSavedLocale();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    localization={locale === "ar" ? clerkLocalization : undefined}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <Switch>
      <Route path="/warranty/verify/:token" component={PublicWarrantyRoute} />
      <Route path="/" component={HomeRoute} />
      <Route path="/sign-in/*?" component={SignInRoute} />
      <Route path="/sign-up/*?" component={SignUpRoute} />
      <Route path="/workspace" component={() => <Redirect to="/workspace/overview" />} />
      <Route path="/decisions" component={() => <Redirect to="/workspace/settings" />} />
      <Route path="/workspace/:page" component={ProtectedWorkspace} />
      <Route component={() => <Redirect to="/" />} />
    </Switch>
  </ClerkProvider>;
}

export function AuthApp() {
  if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
  return <Router base={basePath}><ClerkRoutes /></Router>;
}
