import { useCallback, useEffect, useMemo, useState } from "react";
import { hasCapability } from "../../shared/capabilities";
import { Plus } from "lucide-react";
import type { Locale, TransportDirection, TransportMode, TransportRequest } from "@garage/domain";
import { transportApi, useGarageStore } from "../../shared/store";
import { DataTable, DetailDrawer, EmptyState, Field, FilterBar, FormSection, RecordRef, RequiredNote, StatusBadge } from "../../shared/components";
import { customerDisplay, dateLabel } from "../../shared/ui";
import { TransportDetail } from "./TransportDetail";
import { directionLabels, modeLabels, transportErrorCopy } from "./transport-logic";
import "../bookings/bookings.css";

export interface TransportPanelProps {
  lang: Locale;
  /** When set, the panel is scoped to one booking (booking drawer tab) and creating needs no booking choice. */
  bookingId?: string;
}

/** Transport list + create + detail. Embeddable in a booking, or used standalone by TransportPage. */
export function TransportPanel({ lang, bookingId }: TransportPanelProps) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const store = useGarageStore();
  const state = store.state;
  const canCoordinate = hasCapability(store.actor, "transport.coordinate");
  const canReadContact = canCoordinate && !store.actor?.isDemo;

  const [items, setItems] = useState<TransportRequest[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [chosenBooking, setChosenBooking] = useState(bookingId ?? "");
  const [direction, setDirection] = useState<TransportDirection>("pickup");
  const [mode, setMode] = useState<TransportMode>("driver");
  const [contact, setContact] = useState("");
  const [location, setLocation] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try { setItems(await transportApi.list()); }
    catch (error) {
      const copy = transportErrorCopy((error as { code?: string } | null)?.code);
      setLoadError(copy ? copy[lang] : t("Could not load transport requests.", "تعذر تحميل طلبات النقل."));
      setItems((previous) => previous ?? []);
    }
  }, [lang]);
  useEffect(() => { void load(); }, [load]);

  const bookings = useMemo(() => (state?.bookings ?? []).filter((booking) => (state?.currentBranch === "all" || booking.branchId === state?.currentBranch) && booking.status !== "cancelled" && booking.status !== "no-show"), [state?.bookings, state?.currentBranch]);
  const customerOf = (customerId: string) => state?.customers.find((customer) => customer.id === customerId);
  const vehicleOf = (customerId: string, vehicleId: string) => customerOf(customerId)?.vehicles.find((vehicle) => vehicle.id === vehicleId);
  const bookingLabel = (id: string) => {
    const booking = state?.bookings.find((entry) => entry.id === id);
    if (!booking) return t("Booking", "حجز");
    const customer = customerOf(booking.customerId);
    return `${customer ? customerDisplay(customer.name, lang) : "—"} · ${vehicleOf(booking.customerId, booking.vehicleId)?.plate ?? "—"} · ${dateLabel(booking.dropoffDate, lang)}`;
  };

  const rows = useMemo(() => (items ?? [])
    .filter((item) => (!bookingId || item.bookingId === bookingId) && (statusFilter === "all" || item.status === statusFilter))
    .filter((item) => !query.trim() || `${customerOf(item.customerId)?.name ?? ""} ${vehicleOf(item.customerId, item.vehicleId)?.plate ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())),
  [items, bookingId, statusFilter, query, state?.customers]);

  const resetForm = () => { setChosenBooking(bookingId ?? ""); setDirection("pickup"); setMode("driver"); setContact(""); setLocation(""); setInstructions(""); setFormError(""); };
  const formReady = Boolean(chosenBooking && contact.trim() && location.trim());

  async function create() {
    if (!formReady) return;
    setBusy(true); setFormError("");
    try {
      const result = await transportApi.request({ bookingId: chosenBooking, direction, mode, contact: contact.trim(), location: location.trim(), instructions: instructions.trim(), idempotencyKey: crypto.randomUUID() });
      setCreating(false); resetForm();
      setNotice(result.status === "proposed"
        ? t("Request saved. No provider is committed until a transport policy is approved.", "تم حفظ الطلب. لا التزام من مقدم خدمة حتى اعتماد سياسة النقل.")
        : t("Request saved. Timing is not committed yet.", "تم حفظ الطلب. لم يُلتزم بالتوقيت بعد."));
      setSelected(result.id);
      await load();
    } catch (error) {
      const copy = transportErrorCopy((error as { code?: string } | null)?.code);
      setFormError(copy ? copy[lang] : t("The request could not be saved. Check the details and try again.", "تعذر حفظ الطلب. راجع البيانات وحاول مجدداً."));
    } finally { setBusy(false); }
  }

  const statusOptions = ["proposed", "requested", "confirmed", "pickup-in-progress", "in-custody", "completed", "cancelled", "exception"];
  const selectedItem = items?.find((item) => item.id === selected);

  return <div className="bk-stack">
    <div className="action-row" style={{ justifyContent: "space-between" }}>
      <FilterBar
        lang={lang}
        search={bookingId ? undefined : { value: query, onChange: setQuery, placeholder: t("Search customer or plate", "ابحث بالعميل أو اللوحة") }}
        filters={[{ key: "status", label: t("Status", "الحالة"), value: statusFilter, onChange: setStatusFilter, options: [{ value: "all", label: t("All statuses", "كل الحالات") }, ...statusOptions.map((value) => ({ value, label: value }))].map((option) => option.value === "all" ? option : { ...option, label: statusLabelFor(option.value, lang) }) }]}
        onClear={() => { setQuery(""); setStatusFilter("all"); }}
        resultCount={rows.length}
      />
      {canCoordinate && <button type="button" className="btn btn-primary" onClick={() => { resetForm(); setCreating(true); }}><Plus size={16} aria-hidden="true" />{t("New request", "طلب جديد")}</button>}
    </div>
    {notice && <p className="bk-muted" role="status">{notice}</p>}
    <DataTable<TransportRequest>
      lang={lang}
      caption={t("Transport requests", "طلبات النقل")}
      rows={rows}
      rowKey={(row) => row.id}
      loading={items === null}
      error={loadError && (items?.length ?? 0) === 0 ? loadError : null}
      onRetry={() => void load()}
      onRowClick={(row) => setSelected(row.id)}
      selectedKey={selected}
      empty={rows.length === 0 && ((items?.length ?? 0) > 0 || statusFilter !== "all" || query)
        ? <EmptyState variant="no-results" title={t("No matching requests", "لا توجد طلبات مطابقة")} action={<button type="button" className="btn" onClick={() => { setQuery(""); setStatusFilter("all"); }}>{t("Clear filters", "مسح التصفية")}</button>} />
        : <EmptyState title={t("No transport requests yet", "لا توجد طلبات نقل بعد")} action={canCoordinate ? <button type="button" className="btn btn-primary" onClick={() => { resetForm(); setCreating(true); }}>{t("New request", "طلب جديد")}</button> : undefined} />}
      columns={[
        { key: "customer", header: t("Customer / vehicle", "العميل / المركبة"), primary: true, render: (row) => <span><RecordRef type="customer" id={row.customerId} label={(() => { const c = customerOf(row.customerId); return c ? customerDisplay(c.name, lang) : undefined; })()} hideIcon /><br /><RecordRef type="vehicle" id={row.vehicleId} label={vehicleOf(row.customerId, row.vehicleId)?.plate} hideIcon /></span>, sortable: true, sortValue: (row) => customerOf(row.customerId)?.name },
        { key: "type", header: t("Type", "النوع"), render: (row) => `${directionLabels[row.direction][lang]} · ${modeLabels[row.mode][lang]}` },
        ...(bookingId ? [] : [{ key: "booking", header: t("Booking", "الحجز"), render: (row: TransportRequest) => <RecordRef type="booking" id={row.bookingId} label={bookingLabel(row.bookingId)} hideIcon /> }]),
        { key: "status", header: t("Status", "الحالة"), render: (row) => <StatusBadge status={row.status} domain="transport" lang={lang} />, sortable: true, sortValue: (row) => row.status },
      ]}
    />

    <DetailDrawer open={selected !== null} lang={lang} onClose={() => setSelected(null)} title={selectedItem ? `${directionLabels[selectedItem.direction][lang]} · ${modeLabels[selectedItem.mode][lang]}` : t("Transport request", "طلب النقل")} subtitle={selectedItem ? bookingLabel(selectedItem.bookingId) : undefined}>
      {selected && <TransportDetail key={selected} id={selected} lang={lang} onChanged={() => void load()} canCoordinate={canCoordinate} canReadContact={canReadContact} />}
    </DetailDrawer>

    <DetailDrawer open={creating} lang={lang} onClose={() => setCreating(false)} title={t("New transport request", "طلب نقل جديد")}
      footer={<><button type="button" className="btn" onClick={() => setCreating(false)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn btn-primary" disabled={!formReady || busy} onClick={() => void create()}>{busy ? t("Saving…", "جارٍ الحفظ…") : t("Save request", "حفظ الطلب")}</button></>}>
      <form className="bk-stack" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <RequiredNote text={t("Required", "مطلوب")} />
        <FormSection title={t("Request", "الطلب")} columns={1}>
          {!bookingId && <Field label={t("Booking", "الحجز")} required>
            <select className="field-select" value={chosenBooking} onChange={(event) => setChosenBooking(event.target.value)}>
              <option value="">{t("Choose a booking", "اختر حجزاً")}</option>
              {bookings.map((booking) => <option key={booking.id} value={booking.id}>{bookingLabel(booking.id)}</option>)}
            </select>
          </Field>}
          <Field label={t("Type", "النوع")}>
            <select className="field-select" value={direction} onChange={(event) => setDirection(event.target.value as TransportDirection)}>
              {(Object.keys(directionLabels) as TransportDirection[]).map((key) => <option key={key} value={key}>{directionLabels[key][lang]}</option>)}
            </select>
          </Field>
          <Field label={t("Method", "الوسيلة")}>
            <select className="field-select" value={mode} onChange={(event) => setMode(event.target.value as TransportMode)}>
              {(Object.keys(modeLabels) as TransportMode[]).map((key) => <option key={key} value={key}>{modeLabels[key][lang]}</option>)}
            </select>
          </Field>
        </FormSection>
        <FormSection title={t("Private details", "بيانات خاصة")} columns={1}>
          <Field label={t("Contact", "الاتصال")} required><input className="field-input" dir="ltr" autoComplete="tel" value={contact} onChange={(event) => setContact(event.target.value)} /></Field>
          <Field label={t("Location", "الموقع")} required><input className="field-input" value={location} onChange={(event) => setLocation(event.target.value)} /></Field>
          <Field label={t("Instructions (optional)", "تعليمات (اختياري)")}><textarea className="field-textarea" rows={2} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></Field>
        </FormSection>
        {formError && <div className="form-error" role="alert">{formError}</div>}
      </form>
    </DetailDrawer>
  </div>;
}

function statusLabelFor(status: string, lang: Locale): string {
  const labels: Record<string, { en: string; ar: string }> = {
    proposed: { en: "Proposed", ar: "مقترح" }, requested: { en: "Requested", ar: "مطلوب" }, confirmed: { en: "Confirmed", ar: "مؤكد" },
    "pickup-in-progress": { en: "Pickup in progress", ar: "الاستلام جارٍ" }, "in-custody": { en: "In custody", ar: "في العهدة" },
    completed: { en: "Completed", ar: "مكتمل" }, cancelled: { en: "Cancelled", ar: "ملغي" }, exception: { en: "Needs attention", ar: "يحتاج متابعة" },
  };
  return labels[status]?.[lang] ?? status;
}
