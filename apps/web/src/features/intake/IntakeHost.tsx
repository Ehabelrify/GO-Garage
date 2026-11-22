import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { GarageState, Locale } from "@garage/domain";
import type { GarageActor } from "../../shared/store";
import { hasCapability } from "../../shared/capabilities";
import { IntakePanel } from "./IntakePanel";
import { isIntakeShortcut, openIntake, subscribeIntake, type OpenIntakeOptions } from "./intake-bus";
import { canUseIntake } from "./intake-logic";

export function canOpenIntake(actor: GarageActor): boolean {
  return canUseIntake((capability) => hasCapability(actor, capability));
}

/** Top-bar "New" button. The panel itself is mounted once by IntakeHost. */
export function IntakeButton({ lang }: { lang: Locale }) {
  const label = lang === "ar" ? "جديد" : "New";
  return <button type="button" className="btn btn-primary topbar-new" onClick={() => openIntake()}
    aria-label={lang === "ar" ? "جديد: عميل أو طلب (N)" : "New customer or request (N)"} title={lang === "ar" ? "جديد (N)" : "New (N)"}>
    <Plus size={15} aria-hidden="true" /><span className="topbar-new-text">{label}</span>
  </button>;
}

/** Mounts the single quick-intake panel and listens for open requests (button, N key, WhatsApp chat). */
export function IntakeHost({ lang, actor, state, notify }: { lang: Locale; actor: GarageActor; state: GarageState; notify?: (message: string) => void }) {
  const allowed = canOpenIntake(actor);
  const [options, setOptions] = useState<OpenIntakeOptions | null>(null);
  const [session, setSession] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    const unsubscribe = subscribeIntake((next) => { setOptions(next); setSession((value) => value + 1); });
    const onKey = (event: KeyboardEvent) => {
      if (!isIntakeShortcut(event)) return;
      event.preventDefault();
      openIntake();
    };
    window.addEventListener("keydown", onKey);
    return () => { unsubscribe(); window.removeEventListener("keydown", onKey); };
  }, [allowed]);

  if (!allowed || !options) return null;
  return <IntakePanel key={session} lang={lang} actor={actor} state={state} options={options} notify={notify}
    onClose={() => setOptions(null)}
    onAddAnother={() => { setOptions({}); setSession((value) => value + 1); }} />;
}
