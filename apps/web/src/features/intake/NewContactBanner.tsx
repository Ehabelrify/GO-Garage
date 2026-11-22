import { useEffect, useMemo, useState } from "react";
import { Link2, UserPlus } from "lucide-react";
import type { Locale } from "@garage/domain";
import { Phone, fetchSearch, useDebouncedValue } from "../../shared/components";
import { useGarageStore } from "../../shared/store";
import { matchesCustomer } from "../bookings/booking-logic";
import { intakeErrorText, linkConversation } from "./intake-api";
import { openIntake } from "./intake-bus";
import type { StoreCustomer } from "./intake-logic";
import "./intake.css";

interface Props {
  lang: Locale;
  conversationId: string;
  phone?: string;
  /** Receptionists, managers and the owner may create or link. */
  canAct: boolean;
  /** Reload the inbox after the conversation was linked. */
  onLinked: () => void | Promise<void>;
}

/** Thread banner for a number that is not saved yet: create a customer (opens the panel) or link to an existing one. */
export function NewContactBanner({ lang, conversationId, phone, canAct, onLinked }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const store = useGarageStore();
  const customers = (store.state?.customers ?? []) as StoreCustomer[];
  const [linking, setLinking] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);
  const [remote, setRemote] = useState<StoreCustomer[]>([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setRemote([]);
    if (!linking || debounced.trim().length < 2) return;
    const controller = new AbortController();
    fetchSearch(debounced, { signal: controller.signal, types: ["customer"] }).then((results) => {
      setRemote(results.filter((item) => !customers.some((customer) => customer.id === item.id))
        .map((item) => ({ id: item.id, name: item.title, phone: item.subtitle ?? "", language: lang, vehicles: [] })));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [debounced, linking, customers, lang]);

  const matches = useMemo(() => [...customers.filter((customer) => matchesCustomer(customer, query)), ...remote].slice(0, 6), [customers, remote, query]);

  if (!canAct) return null;

  const link = async (customer: StoreCustomer) => {
    setBusyId(customer.id); setError("");
    try {
      await linkConversation(conversationId, customer.id, customer.vehicles.length === 1 ? customer.vehicles[0].id : undefined);
      setLinking(false);
      await onLinked();
    } catch (reason) {
      setError(intakeErrorText(reason, lang));
    } finally {
      setBusyId("");
    }
  };

  return <div className="wa-link-banner" role="region" aria-label={t("Unsaved number", "رقم غير محفوظ")}>
    <p>{t("This number is not saved yet", "هذا الرقم غير محفوظ بعد")}{phone ? <> · <Phone value={phone} /></> : null}</p>
    <div className="action-row">
      <button type="button" className="btn btn-primary btn-sm" onClick={() => openIntake({ phone, conversationId, onDone: () => { void onLinked(); } })}><UserPlus size={14} aria-hidden="true" />{t("Create customer", "إنشاء عميل")}</button>
      <button type="button" className="btn btn-sm" aria-expanded={linking} onClick={() => setLinking((value) => !value)}><Link2 size={14} aria-hidden="true" />{t("Link to existing", "ربط بعميل موجود")}</button>
    </div>
    {linking && <div className="wa-link-picker">
      <input className="field-input" type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("Search customers", "بحث العملاء")} placeholder={t("Search name, phone or plate", "ابحث بالاسم أو الهاتف أو اللوحة")} data-autofocus />
      {query.trim() && matches.length === 0 && <p className="intake-muted" role="status">{t("No matching customer.", "لا يوجد عميل مطابق.")}</p>}
      {matches.length > 0 && <ul className="intake-list">
        {matches.map((customer) => <li key={customer.id}>
          <button type="button" className="intake-row" disabled={busyId !== ""} onClick={() => void link(customer)}>
            <span className="intake-row-main"><strong><bdi>{customer.name}</bdi></strong><Phone value={customer.phone} /></span>
            <span className="intake-row-meta">{busyId === customer.id ? t("Linking…", "جارٍ الربط…") : t("Link", "ربط")}</span>
          </button>
        </li>)}
      </ul>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>}
  </div>;
}
