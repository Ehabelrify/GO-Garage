import { useEffect, useState } from "react";
import { useAuth, useClerk, ClerkProvider, AuthenticateWithRedirectCallback } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { arSA } from "@clerk/localizations";
import { Redirect, Route, Router, Switch, useLocation } from "wouter";
import { App } from "./App";
import { RouteChunk } from "./RouteChunk";
import { GarageStoreProvider } from "../shared/store";
import { DemoAccountPanel } from "../features/demo-auth/DemoAccountPanel";
import { LoaderCircle, ShieldCheck, Wrench } from "lucide-react";
import { useSavedLocale } from "../shared/locale";
import "./login.css";

const publicWarrantyPage = () => import("../features/warranty/PublicWarrantyVerificationPage").then((m) => ({ default: m.PublicWarrantyVerificationPage }));
const publicWhatsAppDemoPage = () => import("../features/whatsapp/demo/PublicWhatsAppDemoPage").then((m) => ({ default: m.PublicWhatsAppDemoPage }));

function PublicWarrantyRoute({ params }: { params: { token: string } }) {
  const { locale } = useSavedLocale();
  return <RouteChunk loader={publicWarrantyPage} lang={locale} pageProps={{ params }} />;
}

function PublicWhatsAppDemoRoute() {
  const { locale } = useSavedLocale();
  return <RouteChunk loader={publicWhatsAppDemoPage} lang={locale} pageProps={{}} />;
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
  return <div className="auth-loading" role="status" dir={locale === "ar" ? "rtl" : "ltr"}><div className="brand-mark"><Wrench size={20} /></div><span>{locale === "ar" ? "جارٍ التحميل Garage OS..." : "Loading Garage OS..."}</span><div className="loading-line" /></div>;
}

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>;
}

function LoginPage() {
  const [, setLocation] = useLocation();
  const { locale, setLocale } = useSavedLocale();
  const clerk = useClerk();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const t = (en: string, ar: string) => locale === "ar" ? ar : en;
  const signInWithGoogle = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await clerk.client?.signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${basePath}/sign-in/sso-callback`,
        redirectUrlComplete: `${basePath}/workspace/overview`,
      });
    } catch {
      setError(t("Google sign-in could not start. Please try again.", "تعذر بدء تسجيل الدخول بجوجل. حاول مرة أخرى."));
      setPending(false);
    }
  };
  return <main className="login-shell" dir={locale === "ar" ? "rtl" : "ltr"}>
    <header className="login-header">
      <a className="brand brand-link" href="/" aria-label="Garage OS home">
        <span className="brand-mark"><Wrench size={19} /></span>
        <span><strong className="brand-name">Garage OS</strong><small className="brand-sub">GO STORES · EGYPT</small></span>
      </a>
      <button type="button" className="btn" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "English" : "العربية"}</button>
    </header>
    <div className="login-grid">
      <section className="login-card" aria-labelledby="login-title">
        <div className="landing-kicker"><ShieldCheck size={15} /> {t("Team access", "دخول الفريق")}</div>
        <h1 id="login-title">{t("Sign in to Garage OS", "سجّل دخولك لـ Garage OS")}</h1>
        <p className="login-lead">{t("Use the Google account your owner approved.", "استخدم حساب جوجل الذي وافق عليه المالك.")}</p>
        <button type="button" className="login-google" onClick={() => void signInWithGoogle()} disabled={pending}>
          {pending ? <LoaderCircle size={20} className="demo-spinner" aria-hidden="true" /> : <GoogleMark />}
          <span>{t("Sign in with Google", "الدخول بحساب جوجل")}</span>
        </button>
        <button type="button" className="login-apple" disabled aria-disabled="true">
          <span>{t("Apple — coming soon", "Apple — قريبًا")}</span>
        </button>
        {error && <p className="demo-inline-error" role="alert">{error}</p>}
        <ul className="login-points">
          <li>{t("Invite-only: no sign-up.", "بالدعوة فقط: لا يوجد تسجيل جديد.")}</li>
          <li>{t("Role and branch access is checked on every request.", "الصلاحيات حسب الدور والفرع بتتراجع مع كل طلب.")}</li>
        </ul>
      </section>
      <DemoAccountPanel lang={locale} onSignedIn={() => setLocation("/workspace/overview")} onOpenDemo={() => setLocation("/demo")} />
    </div>
  </main>;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  return isSignedIn ? <Redirect to="/workspace/overview" /> : <LoginPage />;
}

function SsoCallbackRoute() {
  return <AuthenticateWithRedirectCallback
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-in`}
    signInFallbackRedirectUrl={`${basePath}/workspace/overview`}
    signUpFallbackRedirectUrl={`${basePath}/workspace/overview`}
  />;
}

function ProtectedWorkspace() {
  const { isLoaded, isSignedIn } = useAuth();
  const [demoChecked, setDemoChecked] = useState(false);
  const [demoSignedIn, setDemoSignedIn] = useState(false);
  useEffect(() => {
    if (isSignedIn) {
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
  if (!isSignedIn && !demoChecked) return <LoadingScreen />;
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
    signUpUrl={`${basePath}/sign-in`}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <Switch>
      <Route path="/warranty/verify/:token" component={PublicWarrantyRoute} />
      <Route path="/demo" component={PublicWhatsAppDemoRoute} />
      <Route path="/" component={HomeRoute} />
      <Route path="/sign-in/sso-callback" component={SsoCallbackRoute} />
      <Route path="/sign-in/*?" component={() => <Redirect to="/" />} />
      <Route path="/sign-up/*?" component={() => <Redirect to="/" />} />
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
