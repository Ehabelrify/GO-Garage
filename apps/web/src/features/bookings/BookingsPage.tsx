import { useEffect, useMemo, useState } from "react";
import { hasCapability } from "../../shared/capabilities";
import { Plus } from "lucide-react";
import type { BranchId, CreateCustomerInput } from "@garage/domain";
import { bookingAvailabilityApi, unknownWriteOutcomeCopy, useGarageStore, type SlotAvailability } from "../../shared/store";
import { dateLabel, serviceDisplay, timeLabel, type ModalConfig, type RecordPageProps } from "../../shared/ui";
import {
  Collapsible, ConfirmDialog, DataTable, DetailDrawer, EmptyState, Field, FilterBar, FormSection, PageHeader, RecordRef, RequiredNote, StatusBadge, useUrlState,
} from "../../shared/components";
import { applyDraftChange, dateRanges, draftReady, isoDate, matchesBooking, noShowJob, sortKey, type BookingDraft, type DateRange } from "./booking-logic";
import { CustomerVehiclePicker } from "./CustomerVehiclePicker";
import { TransportPanel } from "../transport/TransportPanel";
import "./bookings.css";

interface BookingsPageProps extends RecordPageProps {
  /** Kept for the shell's prop contract; destructive actions now use ConfirmDialog. */
  confirmModal?: (config: ModalConfig | null) => void;
}

const bookingErrorCopy: Record<string, { en: string; ar: string }> = {
  INVALID_BOOKING: { en: "Check the customer, vehicle, service, date, and branch.", ar: "راجع بيانات العميل والمركبة والخدمة والتاريخ والفرع." },
  BRANCH_CLOSED: { en: "The branch is closed on this weekday.", ar: "الفرع مغلق في هذا اليوم." },
  DAILY_CAP_REACHED: { en: "The branch has reached its daily vehicle intake limit.", ar: "وصل الفرع إلى الحد اليومي لاستقبال المركبات." },
  BAY_CAPACITY_REACHED: { en: "Bay-hour capacity is full for this date and service.", ar: "ساعات الأماكن ممتلئة لهذا التاريخ والخدمة." },
  BOOKING_NOT_PENDING: { en: "This booking is no longer waiting for confirmation.", ar: "لم يعد هذا الحجز بانتظار التأكيد." },
  MANAGER_REVIEW_REQUIRED: { en: "A manager must confirm this booking.", ar: "يجب أن يؤكد مدير الفرع هذا الحجز." },
  JOB_ALREADY_STARTED: { en: "The job has started; use the workshop instead.", ar: "بدأ العمل على المركبة؛ تابع من صفحة الورشة." },
  RESERVATION_CANCELLATION_REQUIRED: { en: "Use the linked reservation correction flow.", ar: "استخدم مسار تصحيح الحجز المؤجل المرتبط." },
  INVALID_CUSTOMER: { en: "Complete the customer and vehicle fields.", ar: "أكمل بيانات العميل والمركبة." },
  INVALID_PHONE: { en: "Enter a valid phone number (8 to 15 digits).", ar: "أدخل رقم هاتف صحيحاً (من 8 إلى 15 رقماً)." },
  DUPLICATE_PHONE: { en: "A customer with this phone number already exists.", ar: "يوجد عميل بنفس رقم الهاتف." },
};

type PendingAction = { kind: "cancel" | "no-show"; bookingId: string } | null;

export function BookingsPage({ lang, t, state, branchName, customerName, serviceName, vehicleFor, notify }: BookingsPageProps) {
  const store = useGarageStore();
  const role = store.actor?.role;
  const canManage = hasCapability(store.actor, "bookings.manage");
  const canTransport = hasCapability(store.actor, "transport.coordinate");
  const today = isoDate(new Date());
  const firstBranchId = (state.branches[0]?.id ?? "branch-a") as BranchId;
  const defaultBranch = (state.currentBranch === "all" ? firstBranchId : state.currentBranch) as BranchId;
  const emptyDraft = (): BookingDraft => ({ customerId: "", vehicleId: "", serviceId: "", branchId: defaultBranch, dropoffDate: today, dropoffTime: "" });

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState<DateRange>("all");
  const [record, setRecord] = useUrlState("record", "");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<BookingDraft>(emptyDraft);
  const [availability, setAvailability] = useState<SlotAvailability | null | "error">(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [acting, setActing] = useState(false);
  const [moving, setMoving] = useState<{ date: string; time: string } | null>(null);
  const [moveAvailability, setMoveAvailability] = useState<SlotAvailability | null | "error">(null);

  const message = (code: string, fallback: { en: string; ar: string }) => {
    const copy = bookingErrorCopy[code];
    return unknownWriteOutcomeCopy(code, lang) ?? t((copy ?? fallback).en, (copy ?? fallback).ar);
  };

  const rows = useMemo(() => state.bookings
    .filter((booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      const vehicle = vehicleFor(booking.customerId, booking.vehicleId);
      return matchesBooking(booking, { customerName: customer?.name ?? "", phone: customer?.phone ?? "", plate: vehicle?.plate ?? "", makeModel: vehicle?.makeModel ?? "" },
        { query, status, range, branchId: state.currentBranch }, today);
    })
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a))),
  [state.bookings, state.customers, state.currentBranch, query, status, range, today, vehicleFor]);

  const selected = record ? state.bookings.find((booking) => booking.id === record) : undefined;
  const selectedVehicle = selected ? vehicleFor(selected.customerId, selected.vehicleId) : undefined;
  const selectedJob = selected ? state.jobs.find((job) => job.bookingId === selected.id) : undefined;
  const clearFilters = () => { setQuery(""); setStatus("all"); setRange("all"); };

  // Slot availability for the create form.
  useEffect(() => {
    let live = true;
    setAvailability(null);
    if (!creating || !draft.branchId || !draft.serviceId || !draft.dropoffDate) return;
    void bookingAvailabilityApi.slots({ branchId: draft.branchId, serviceId: draft.serviceId, fromDate: draft.dropoffDate, toDate: draft.dropoffDate })
      .then((result) => { if (live) setAvailability(result); })
      .catch(() => { if (live) setAvailability("error"); });
    return () => { live = false; };
  }, [creating, draft.branchId, draft.serviceId, draft.dropoffDate]);

  // Slot availability for rescheduling.
  useEffect(() => {
    let live = true;
    setMoveAvailability(null);
    if (!moving?.date || !selected) return;
    const selector = selected.acceptedQuoteRef ? { quoteId: selected.acceptedQuoteRef.quoteId, quoteRevision: selected.acceptedQuoteRef.revision } : { serviceId: selected.serviceId };
    void bookingAvailabilityApi.slots({ branchId: selected.branchId, fromDate: moving.date, toDate: moving.date, bookingId: selected.id, ...selector })
      .then((result) => { if (live) setMoveAvailability(result); })
      .catch(() => { if (live) setMoveAvailability("error"); });
    return () => { live = false; };
  }, [moving?.date, selected?.id, selected?.branchId]);

  useEffect(() => { setMoving(null); }, [record]);

  const update = (change: Partial<BookingDraft>) => setDraft((previous) => applyDraftChange(previous, change));
  const openCreate = () => { setDraft(emptyDraft()); setError(""); setCreating(true); };
  const closeCreate = () => { setCreating(false); setError(""); };

  const createCustomer = async (input: CreateCustomerInput) => {
    const result = await store.createCustomer(input);
    return result.ok ? { ok: true as const, customerId: result.customerId } : { ok: false as const, error: result.error };
  };

  async function create() {
    setError("");
    if (availability === null || availability === "error" || availability.status !== "available" || !availability.slots.some((slot) => slot.dropoffTime === draft.dropoffTime)) {
      setError(t("Choose an available time.", "اختر موعداً متاحاً."));
      return;
    }
    setSaving(true);
    const result = await store.createBookingRequest({ ...draft, configurationVersion: availability.configurationVersion } as typeof draft);
    setSaving(false);
    if (result.ok) {
      closeCreate();
      notify(result.status === "confirmed" ? t("Booking confirmed.", "تم تأكيد الحجز.") : t("Booking saved for review.", "تم حفظ الحجز للمراجعة."));
      setRecord(result.bookingId);
      return;
    }
    setError(message(result.error, { en: "The booking could not be saved. Check your access and try again.", ar: "تعذر حفظ الحجز. راجع صلاحيتك وحاول مجدداً." }));
  }

  async function confirmBooking(bookingId: string) {
    const result = await store.confirmBooking(bookingId);
    notify(result.ok ? t("Booking confirmed.", "تم تأكيد الحجز.") : message(result.error, { en: "The booking could not be confirmed.", ar: "تعذر تأكيد الحجز." }));
  }

  async function runPending() {
    if (!pending) return;
    setActing(true);
    const booking = state.bookings.find((item) => item.id === pending.bookingId);
    let result;
    if (pending.kind === "cancel") result = await store.cancelBooking(pending.bookingId);
    else {
      const job = booking ? noShowJob(booking, state.jobs, role) : null;
      result = job ? await store.transitionJob(job.id, "no-show") : { ok: false as const, error: "REQUEST_FAILED" };
    }
    setActing(false);
    setPending(null);
    notify(result.ok
      ? pending.kind === "cancel" ? t("Booking cancelled.", "تم إلغاء الحجز.") : t("Marked as no-show.", "تم تسجيله كلم يحضر.")
      : message(result.error, { en: "The change could not be saved.", ar: "تعذر حفظ التغيير." }));
  }

  async function reschedule() {
    if (!selected || !moving) return;
    if (moveAvailability === null || moveAvailability === "error" || moveAvailability.status !== "available" || !moveAvailability.slots.some((slot) => slot.dropoffTime === moving.time)) {
      notify(t("Choose an available new time.", "اختر موعداً جديداً متاحاً."));
      return;
    }
    try {
      await bookingAvailabilityApi.reschedule(selected.id, moving.date, moving.time);
      await store.refresh();
      setMoving(null);
      notify(t("Booking rescheduled.", "تم تغيير موعد الحجز."));
    } catch {
      notify(t("The new time is unavailable. The booking is unchanged.", "الموعد الجديد غير متاح. الحجز كما هو."));
    }
  }

  const statusOptions = [
    { value: "all", label: t("All statuses", "كل الحالات") },
    ...(["pending", "confirmed", "cancelled", "no-show"] as const).map((value) => ({ value, label: value === "pending" ? t("Pending review", "بانتظار المراجعة") : value === "confirmed" ? t("Confirmed", "مؤكد") : value === "cancelled" ? t("Cancelled", "ملغي") : t("No-show", "لم يحضر") })),
  ];
  const rangeLabels: Record<DateRange, string> = {
    all: t("Any date", "أي تاريخ"), today: t("Today", "اليوم"), tomorrow: t("Tomorrow", "غداً"), week: t("Next 7 days", "7 أيام قادمة"), upcoming: t("Upcoming", "القادمة"), past: t("Past", "السابقة"),
  };

  const slotsView = (current: SlotAvailability | null | "error", chosen: string, onPick: (time: string) => void, ready: boolean) => {
    if (!ready) return <p className="bk-muted">{t("Pick a service and date to see times.", "اختر الخدمة والتاريخ لعرض المواعيد.")}</p>;
    if (current === null) return <p className="bk-muted" role="status">{t("Loading times…", "جارٍ تحميل المواعيد…")}</p>;
    if (current === "error") return <p className="form-error" role="alert">{t("Times could not be loaded.", "تعذر تحميل المواعيد.")}</p>;
    if (current.status === "unconfigured") return <p className="bk-muted" role="status">{t("Availability is not set up for this branch and service.", "المواعيد غير مهيأة لهذا الفرع والخدمة.")}</p>;
    if (current.slots.length === 0) return <p className="bk-muted" role="status">{t("No times available on this date.", "لا توجد مواعيد متاحة في هذا التاريخ.")}</p>;
    return <div className="bk-slots" role="radiogroup" aria-label={t("Available times", "المواعيد المتاحة")}>
      {current.slots.map((slot) => <button key={slot.dropoffTime} type="button" role="radio" aria-checked={chosen === slot.dropoffTime} className="bk-slot" onClick={() => onPick(slot.dropoffTime)}><bdi dir="ltr">{timeLabel(slot.dropoffTime, lang)}</bdi></button>)}
    </div>;
  };

  const pendingBooking = pending ? state.bookings.find((item) => item.id === pending.bookingId) : undefined;
  const pendingWho = pendingBooking ? `${customerName(pendingBooking.customerId)} · ${vehicleFor(pendingBooking.customerId, pendingBooking.vehicleId)?.plate ?? ""}` : "";

  return <>
    <PageHeader
      title={t("Bookings", "الحجوزات")}
      actions={canManage ? <button className="btn btn-primary" type="button" onClick={openCreate}><Plus size={16} aria-hidden="true" />{t("Add booking", "إضافة حجز")}</button> : undefined}
    />

    <FilterBar
      lang={lang}
      search={{ value: query, onChange: setQuery, placeholder: t("Search name, phone or plate", "ابحث بالاسم أو الهاتف أو اللوحة") }}
      filters={[
        { key: "range", label: t("Date", "التاريخ"), value: range, onChange: (value) => setRange(value as DateRange), options: dateRanges.map((value) => ({ value, label: rangeLabels[value] })) },
        { key: "status", label: t("Status", "الحالة"), value: status, onChange: setStatus, options: statusOptions },
      ]}
      onClear={clearFilters}
      resultCount={rows.length}
    />

    <DataTable
      lang={lang}
      caption={t("Bookings", "الحجوزات")}
      rows={rows}
      rowKey={(row) => row.id}
      selectedKey={record || null}
      onRowClick={(row) => setRecord(row.id)}
      empty={state.bookings.length === 0
        ? <EmptyState title={t("No bookings yet", "لا توجد حجوزات بعد")} action={canManage ? <button type="button" className="btn btn-primary" onClick={openCreate}>{t("Add booking", "إضافة حجز")}</button> : undefined} />
        : <EmptyState variant="no-results" title={t("No matching bookings", "لا توجد حجوزات مطابقة")} action={<button type="button" className="btn" onClick={clearFilters}>{t("Clear filters", "مسح التصفية")}</button>} />}
      columns={[
        { key: "when", header: t("Drop-off", "الاستلام"), primary: true, sortable: true, sortValue: sortKey, render: (row) => <span><bdi>{dateLabel(row.dropoffDate, lang)}</bdi> <bdi dir="ltr">{timeLabel(row.dropoffTime, lang)}</bdi></span> },
        { key: "customer", header: t("Customer / vehicle", "العميل / المركبة"), sortable: true, sortValue: (row) => customerName(row.customerId), render: (row) => <span>
          <RecordRef type="customer" id={row.customerId} label={customerName(row.customerId)} hideIcon /><br />
          <RecordRef type="vehicle" id={row.vehicleId} label={vehicleFor(row.customerId, row.vehicleId)?.plate} subtitle={vehicleFor(row.customerId, row.vehicleId)?.makeModel} hideIcon />
        </span> },
        { key: "service", header: t("Service", "الخدمة"), render: (row) => row.workSummary?.[lang] ?? serviceName(row.serviceId) },
        { key: "branch", header: t("Branch", "الفرع"), render: (row) => branchName(row.branchId), hideOnCard: state.currentBranch !== "all" },
        { key: "status", header: t("Status", "الحالة"), sortable: true, sortValue: (row) => row.status, render: (row) => <StatusBadge status={row.status} domain="booking" lang={lang} /> },
        ...(canManage ? [{ key: "actions", header: "", hideOnCard: true, render: (row: (typeof rows)[number]) => row.status === "pending"
          ? <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><button type="button" className="btn btn-sm btn-primary" onClick={() => void confirmBooking(row.id)}>{t("Confirm", "تأكيد")}</button></span>
          : null }] : []),
      ]}
    />

    {/* Detail */}
    <DetailDrawer
      open={Boolean(record)}
      lang={lang}
      onClose={() => setRecord("")}
      wide
      title={selected ? customerName(selected.customerId) : t("Booking", "حجز")}
      subtitle={selected ? `${dateLabel(selected.dropoffDate, lang)} · ${timeLabel(selected.dropoffTime, lang)}` : undefined}
      footer={selected && canManage && (selected.status === "pending" || selected.status === "confirmed") ? <>
        {selected.status === "pending" && <button type="button" className="btn btn-primary" onClick={() => void confirmBooking(selected.id)}>{t("Confirm", "تأكيد")}</button>}
        {selected.status === "confirmed" && !moving && <button type="button" className="btn" onClick={() => setMoving({ date: selected.dropoffDate.slice(0, 10), time: "" })}>{t("Reschedule", "تغيير الموعد")}</button>}
        {noShowJob(selected, state.jobs, role) && <button type="button" className="btn btn-danger" onClick={() => setPending({ kind: "no-show", bookingId: selected.id })}>{t("No-show", "لم يحضر")}</button>}
        <button type="button" className="btn btn-danger" onClick={() => setPending({ kind: "cancel", bookingId: selected.id })}>{t("Cancel booking", "إلغاء الحجز")}</button>
      </> : undefined}
    >
      {!selected
        ? <EmptyState variant="no-results" title={t("Booking not found", "الحجز غير موجود")} text={t("It may be in another branch or was removed.", "قد يكون في فرع آخر أو تمت إزالته.")} />
        : <div className="bk-stack">
            <div><StatusBadge status={selected.status} domain="booking" lang={lang} /></div>
            <dl className="kv-grid">
              <div><dt>{t("Customer", "العميل")}</dt><dd><RecordRef type="customer" id={selected.customerId} label={customerName(selected.customerId)} /></dd></div>
              <div><dt>{t("Vehicle", "المركبة")}</dt><dd><RecordRef type="vehicle" id={selected.vehicleId} label={selectedVehicle?.plate} subtitle={selectedVehicle?.makeModel} />{selectedVehicle && <><br /><small className="bk-muted"><bdi>{selectedVehicle.makeModel}</bdi></small></>}</dd></div>
              <div><dt>{t("Service", "الخدمة")}</dt><dd>{selected.workSummary?.[lang] ?? serviceName(selected.serviceId)}</dd></div>
              <div><dt>{t("Branch", "الفرع")}</dt><dd>{branchName(selected.branchId)}</dd></div>
              <div><dt>{t("Drop-off", "الاستلام")}</dt><dd><bdi>{dateLabel(selected.dropoffDate, lang)}</bdi> <bdi dir="ltr">{timeLabel(selected.dropoffTime, lang)}</bdi></dd></div>
              <div><dt>{t("Expected pickup", "التسليم المتوقع")}</dt><dd><bdi>{dateLabel(selected.expectedPickup, lang)}</bdi></dd></div>
            </dl>
            {(selected.acceptedQuoteRef || selectedJob) && <Collapsible title={t("Related", "مرتبط")} defaultOpen>
              <div className="bk-related">
                {selected.acceptedQuoteRef && <RecordRef type="quote" id={selected.acceptedQuoteRef.quoteId} label={t("Accepted quote", "عرض السعر المقبول")} />}
                {selectedJob && <RecordRef type="job" id={selectedJob.id} label={t("Workshop job", "أمر الشغل")} />}
              </div>
            </Collapsible>}

            {moving && canManage && <Collapsible title={t("Reschedule", "تغيير الموعد")} open onToggle={() => setMoving(null)}>
              <div className="bk-stack">
                <Field label={t("New date", "التاريخ الجديد")}><input className="field-input" type="date" min={today} value={moving.date} onChange={(event) => setMoving({ date: event.target.value, time: "" })} /></Field>
                {slotsView(moveAvailability, moving.time, (time) => setMoving({ ...moving, time }), Boolean(moving.date))}
                <div className="action-row">
                  <button type="button" className="btn btn-primary btn-sm" disabled={!moving.time} onClick={() => void reschedule()}>{t("Move booking", "نقل الحجز")}</button>
                  <button type="button" className="btn btn-sm" onClick={() => setMoving(null)}>{t("Keep current time", "إبقاء الموعد")}</button>
                </div>
              </div>
            </Collapsible>}

            {canTransport && selected.status !== "cancelled" && selected.status !== "no-show" && <Collapsible title={t("Transport", "النقل")}>
              <TransportPanel lang={lang} bookingId={selected.id} />
            </Collapsible>}
          </div>}
    </DetailDrawer>

    {/* Create */}
    <DetailDrawer
      open={creating}
      lang={lang}
      onClose={closeCreate}
      title={t("Add booking", "إضافة حجز")}
      footer={<>
        <button type="button" className="btn" onClick={closeCreate}>{t("Discard", "تجاهل")}</button>
        <button type="button" className="btn btn-primary" disabled={!draftReady(draft) || saving} onClick={() => void create()}>{saving ? t("Saving…", "جارٍ الحفظ…") : t("Save booking", "حفظ الحجز")}</button>
      </>}
    >
      <form className="bk-stack" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <RequiredNote text={t("Required", "مطلوب")} />
        <FormSection title={t("Customer and vehicle", "العميل والمركبة")} columns={1}>
          <CustomerVehiclePicker
            lang={lang}
            branchId={draft.branchId}
            customers={state.customers}
            value={{ customerId: draft.customerId, vehicleId: draft.vehicleId }}
            onChange={(value) => update(value)}
            onCreate={canManage ? createCustomer : undefined}
            errorCopy={(code) => message(code, { en: "The customer could not be saved.", ar: "تعذر حفظ العميل." })}
          />
        </FormSection>
        <FormSection title={t("Service and time", "الخدمة والموعد")}>
          <Field label={t("Service", "الخدمة")} required>
            <select className="field-select" value={draft.serviceId} onChange={(event) => update({ serviceId: event.target.value })}>
              <option value="">{t("Choose a service", "اختر خدمة")}</option>
              {state.services.map((service) => <option key={service.id} value={service.id}>{serviceDisplay(service.name, lang)}</option>)}
            </select>
          </Field>
          {state.branches.length > 1 && <Field label={t("Branch", "الفرع")} required>
            <select className="field-select" value={draft.branchId} onChange={(event) => update({ branchId: event.target.value as BranchId })}>
              {state.branches.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch.id)}</option>)}
            </select>
          </Field>}
          <Field label={t("Drop-off date", "تاريخ الاستلام")} required><input className="field-input" type="date" min={today} value={draft.dropoffDate} onChange={(event) => update({ dropoffDate: event.target.value })} /></Field>
          <Field label={t("Time", "الوقت")} required full>
            <div>{slotsView(availability, draft.dropoffTime, (time) => update({ dropoffTime: time }), Boolean(draft.serviceId && draft.dropoffDate))}</div>
          </Field>
        </FormSection>
        {error && <div className="form-error" role="alert">{error}</div>}
      </form>
    </DetailDrawer>

    <ConfirmDialog
      open={pending !== null}
      lang={lang}
      danger
      busy={acting}
      title={pending?.kind === "no-show" ? t("Mark as no-show?", "تسجيل أنه لم يحضر؟") : t("Cancel this booking?", "إلغاء هذا الحجز؟")}
      body={`${pendingWho}. ${pending?.kind === "no-show" ? t("The job is closed. No message is sent.", "يُغلق أمر الشغل. لا تُرسل رسالة.") : t("The workshop job is cancelled too. No message is sent.", "يُلغى أمر الشغل أيضاً. لا تُرسل رسالة.")}`}
      confirmLabel={pending?.kind === "no-show" ? t("Mark no-show", "تسجيل لم يحضر") : t("Cancel booking", "إلغاء الحجز")}
      cancelLabel={t("Keep booking", "إبقاء الحجز")}
      onConfirm={() => void runPending()}
      onCancel={() => setPending(null)}
    />
  </>;
}
