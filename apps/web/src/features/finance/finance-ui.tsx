import { useEffect, useMemo, useState } from "react";
import type { Branch, Locale, QuoteRevision } from "@garage/domain";
import { quoteApi, reservationApi, useGarageStore } from "../../shared/store";
import { DateText, StatusBadge, type StatusDomain } from "../../shared/components";
import { localParts } from "./finance-logic";

export type T = (en: string, ar: string) => string;
export const makeT = (lang: Locale): T => (en, ar) => (lang === "ar" ? ar : en);

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";
/** Representative registry entries so a finance pill gets the shared tone icon and colour; the label is always ours. */
const toneStatus: Record<Tone, { status: string; domain: StatusDomain }> = {
  neutral: { status: "closed", domain: "claim" }, info: { status: "under-review", domain: "claim" }, success: { status: "active", domain: "warranty" },
  warning: { status: "open", domain: "claim" }, danger: { status: "denied", domain: "claim" },
};
/** Compact state badge on the shared StatusBadge (tone icon plus text, never colour alone). */
export function Pill({ tone, lang, children }: { tone: Tone; lang: Locale; children: string }) {
  const entry = toneStatus[tone];
  return <StatusBadge status={entry.status} domain={entry.domain} lang={lang} label={children} />;
}

/** Date and time as one LTR isolate with Latin digits. */
export function EventDate({ value, lang }: { value: string; lang: Locale }) {
  const parts = localParts(value);
  return parts ? <DateText value={parts.date} time={parts.time} lang={lang} /> : <span>—</span>;
}

export const dateTimeLabel = (value: string, lang: Locale) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
};

export interface FinanceLookups {
  branchName: (id: string) => string;
  customerName: (id: string) => string | undefined;
  plateForJob: (jobId: string) => string | undefined;
  quoteLabel: (quoteId: string) => string | undefined;
  reservationLabel: (reservationId: string) => string | undefined;
  quotes: Array<{ id: string; label: string; branchId: string }>;
  reservations: Array<{ id: string; label: string; branchId: string }>;
  jobs: Array<{ id: string; label: string; branchId: string }>;
}

/** Human labels for linked records. Quotes/reservations load quietly: a 403/404 just means fewer pickers. */
export function useFinanceLookups(branches: Branch[], lang: Locale): FinanceLookups {
  const { state: garageState } = useGarageStore();
  const state = useMemo(() => ({ customers: garageState?.customers ?? [], jobs: garageState?.jobs ?? [] }), [garageState?.customers, garageState?.jobs]);
  const [quoteRows, setQuoteRows] = useState<Array<QuoteRevision & { branchId?: string }>>([]);
  const [reservationRows, setReservationRows] = useState<Array<{ id: string; branchId: string; beneficiaryId: string; vehicleId: string }>>([]);
  useEffect(() => {
    let current = true;
    void quoteApi.list().then((rows) => { if (current) setQuoteRows(rows); }).catch(() => undefined);
    void reservationApi.list().then((rows) => { if (current) setReservationRows(rows); }).catch(() => undefined);
    return () => { current = false; };
  }, []);
  return useMemo(() => {
    const customerName = (id: string) => state.customers.find((customer) => customer.id === id)?.name;
    const plateOf = (vehicleId: string) => state.customers.flatMap((customer) => customer.vehicles).find((vehicle) => vehicle.id === vehicleId)?.plate;
    const branchName = (id: string) => {
      const branch = branches.find((item) => item.id === id);
      return branch ? (lang === "ar" ? branch.nameAr ?? branch.name : branch.name) : (lang === "ar" ? "فرع" : "Branch");
    };
    const latest = new Map<string, QuoteRevision>();
    for (const row of quoteRows) {
      const prior = latest.get(row.ref.quoteId);
      if (!prior || row.ref.revision > prior.ref.revision) latest.set(row.ref.quoteId, row);
    }
    const quotes = [...latest.values()].filter((row) => row.state !== "cancelled" && row.state !== "superseded").map((row) => ({
      id: row.ref.quoteId,
      branchId: row.input.branchId,
      label: `${customerName(row.input.customerId) ?? (lang === "ar" ? "عرض سعر" : "Quote")} · ${plateOf(row.input.vehicle.vehicleId) ?? row.input.vehicle.model}`,
    }));
    const jobs = state.jobs.map((job) => ({ id: job.id, branchId: job.branchId, label: `${plateOf(job.vehicleId) ?? (lang === "ar" ? "أمر شغل" : "Job")} · ${customerName(job.customerId) ?? ""}`.replace(/ · $/, "") }));
    const reservations = reservationRows.map((row) => ({ id: row.id, branchId: row.branchId, label: `${customerName(row.beneficiaryId) ?? (lang === "ar" ? "حجز مؤجل" : "Reservation")} · ${plateOf(row.vehicleId) ?? ""}`.replace(/ · $/, "") }));
    const byId = (list: Array<{ id: string; label: string }>) => (id: string) => list.find((item) => item.id === id)?.label;
    const plateForJob = (jobId: string) => {
      const job = state.jobs.find((item) => item.id === jobId);
      return job ? plateOf(job.vehicleId) : undefined;
    };
    return {
      branchName, customerName, plateForJob, quotes, jobs, reservations,
      quoteLabel: byId(quotes), reservationLabel: byId(reservations),
    };
  }, [state.customers, state.jobs, branches, lang, quoteRows, reservationRows]);
}
