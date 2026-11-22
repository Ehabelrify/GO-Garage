import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, FileText, Minus, Plus, Search, UserPlus, X } from "lucide-react";
import { useLocation } from "wouter";
import type { GarageState, Locale } from "@garage/domain";
import {
  Amount, DateText, DetailDrawer, EmptyState, Field, FormSection, Phone, Plate, RecordRef, RequiredNote, Select, Skeleton, StatusBadge,
  fetchSearch, formatPhone, useDebouncedValue,
} from "../../shared/components";
import { bookingAvailabilityApi, useGarageStore, type GarageActor, type SlotAvailability } from "../../shared/store";
import { hasCapability } from "../../shared/capabilities";
import { serviceDisplay } from "../../shared/ui";
import { matchesCustomer, isoDate } from "../bookings/booking-logic";
import { fetchIntakeItems, intakeErrorText, linkConversation, submitIntake, duplicateVehicleOf } from "./intake-api";
import type { OpenIntakeOptions } from "./intake-bus";
import {
  addItem, categoryLabel, findDuplicatePlate, isValidPhone, itemKey, itemName, itemTotals, kindLabels, lineTotal, newIdempotencyKey, normalisePhoneInput,
  pickBranch, plateHint, removeItem, setQuantity, validateDraft, buildIntakePayload, effectiveVehicle,
  type CatalogueItem, type CatalogueKind, type CustomerChoice, type IntakeBlock, type IntakeDraft, type IntakeOutcome, type IntakeResult,
  type SelectedItem, type StoreCustomer, type VehicleChoice,
} from "./intake-logic";
import "./intake.css";

interface IntakePanelProps {
  lang: Locale;
  actor: GarageActor;
  state: GarageState;
  options: OpenIntakeOptions;
  onClose: () => void;
  onAddAnother: () => void;
  notify?: (message: string) => void;
}

type KindFilter = CatalogueKind | "all";
const MAX_CUSTOMER_RESULTS = 6;

const blockCopy: Record<IntakeBlock, { en: string; ar: string }> = {
  customer: { en: "Choose or add a customer.", ar: "اختر عميلاً أو أضفه." },
  "customer-name": { en: "Enter the customer's name.", ar: "أدخل اسم العميل." },
  "customer-phone": { en: "Enter a valid phone number.", ar: "أدخل رقم هاتف صحيحاً." },
  vehicle: { en: "Choose or add a car.", ar: "اختر سيارة أو أضفها." },
  plate: { en: "Check the plate.", ar: "راجع اللوحة." },
  "make-model": { en: "Enter the make and model.", ar: "أدخل الماركة والموديل." },
  items: { en: "Add at least one item.", ar: "أضف بنداً واحداً على الأقل." },
  booking: { en: "Choose a service, date and time.", ar: "اختر الخدمة والتاريخ والوقت." },
  permission: { en: "Your role cannot do this.", ar: "دورك لا يسمح بهذا الإجراء." },
};

const warningCopy: Record<string, { en: string; ar: string }> = {
  "no-catalogue-price": { en: "Some items have no approved price. Enter it on the quote.", ar: "بعض البنود بلا سعر معتمد. أدخله في عرض السعر." },
  "tax-not-set": { en: "Tax is not set on some lines.", ar: "الضريبة غير محددة في بعض البنود." },
  "terms-missing": { en: "Quote terms are not set up, so it is a draft.", ar: "شروط العرض غير معدّة، لذا هو مسودة." },
};

export function IntakePanel({ lang, actor, state, options, onClose, onAddAnother, notify }: IntakePanelProps) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const store = useGarageStore();
  const [, navigate] = useLocation();
  const canQuote = hasCapability(actor, "quotes.manage");
  const canBook = hasCapability(actor, "bookings.manage");
  const customers = state.customers as StoreCustomer[];
  const branchIds = state.branches.map((branch) => branch.id as string);

  const idempotencyKey = useRef(newIdempotencyKey());
  const [draft, setDraft] = useState<IntakeDraft>(() => ({
    customer: { kind: "none" },
    vehicle: { kind: "none" },
    branchId: pickBranch(state.currentBranch, branchIds, actor.branchIds),
    items: [],
    notes: "",
    outcome: canQuote ? "quote" : "customer-only",
    booking: { date: isoDate(new Date()), time: "", serviceId: state.services[0]?.id ?? "" },
    whatsappConversationId: options.conversationId,
    idempotencyKey: idempotencyKey.current,
  }));
  const patch = (change: Partial<IntakeDraft>) => setDraft((previous) => ({ ...previous, ...change }));

  // Customer step state.
  const [query, setQuery] = useState(options.phone ?? options.name ?? "");
  const [creating, setCreating] = useState<boolean>(false);
  const [fresh, setFresh] = useState({ name: options.name ?? "", phone: options.phone ?? "", language: lang });
  // Vehicle step state.
  const [addingCar, setAddingCar] = useState(false);
  const [car, setCar] = useState({ plate: "", makeModel: "" });
  const [duplicate, setDuplicate] = useState<{ customer: StoreCustomer; vehicle: StoreCustomer["vehicles"][number] } | null>(null);
  // Request step state.
  const [kind, setKind] = useState<KindFilter>("all");
  const [catalogueQuery, setCatalogueQuery] = useState("");
  const debouncedCatalogue = useDebouncedValue(catalogueQuery, 250);
  const [catalogue, setCatalogue] = useState<CatalogueItem[] | null>(null);
  const [catalogueError, setCatalogueError] = useState(false);
  const [catalogueTick, setCatalogueTick] = useState(0);
  // Booking.
  const [bookingOpen, setBookingOpen] = useState(false);
  const [availability, setAvailability] = useState<SlotAvailability | "error" | null>(null);
  // Submit.
  const [busy, setBusy] = useState<IntakeOutcome | "">("");
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [linkWarning, setLinkWarning] = useState(false);

  /* ---------- customer search (store first, then the server search for the rest) ---------- */
  const debouncedQuery = useDebouncedValue(query, 250);
  const [remote, setRemote] = useState<StoreCustomer[]>([]);
  useEffect(() => {
    const text = debouncedQuery.trim();
    setRemote([]);
    if (text.length < 2 || draft.customer.kind !== "none") return;
    const controller = new AbortController();
    fetchSearch(text, { signal: controller.signal, types: ["customer"] }).then((results) => {
      setRemote(results.filter((item) => item.type === "customer" && !customers.some((customer) => customer.id === item.id))
        .map((item) => ({ id: item.id, name: item.title, phone: item.subtitle ?? "", language: lang, vehicles: [] })));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [debouncedQuery, draft.customer.kind, customers, lang]);

  const matches = useMemo(() => {
    const local = customers.filter((customer) => matchesCustomer(customer, query));
    return [...local, ...remote];
  }, [customers, remote, query]);

  const selectedCustomer = draft.customer.kind === "existing"
    ? customers.find((customer) => customer.id === (draft.customer as { id: string }).id) ?? { id: draft.customer.id, name: draft.customer.name, phone: draft.customer.phone, language: lang, vehicles: [] }
    : null;

  const chooseCustomer = (customer: StoreCustomer) => {
    const choice: CustomerChoice = { kind: "existing", id: customer.id, name: customer.name, phone: customer.phone };
    const only = customer.vehicles.length === 1 ? customer.vehicles[0] : null;
    patch({ customer: choice, vehicle: only ? { kind: "existing", id: only.id, plate: only.plate, makeModel: only.makeModel } : { kind: "none" } });
    setAddingCar(false); setDuplicate(null); setCreating(false);
  };
  const clearCustomer = () => { patch({ customer: { kind: "none" }, vehicle: { kind: "none" } }); setAddingCar(false); setDuplicate(null); };

  const startNewCustomer = () => {
    setCreating(true);
    setFresh((previous) => ({ ...previous, name: previous.name || (/\d/.test(query) ? "" : query), phone: previous.phone || (/\d{5,}/.test(query.replace(/\D/g, "")) && !/[^\d+\s-]/.test(query) ? query : "") }));
  };
  const confirmNewCustomer = () => {
    if (!fresh.name.trim() || !isValidPhone(fresh.phone)) { setShowErrors(true); return; }
    patch({ customer: { kind: "new", name: fresh.name.trim(), phone: normalisePhoneInput(fresh.phone), language: fresh.language }, vehicle: { kind: "none" } });
    setCreating(false); setAddingCar(true);
  };

  // A chat opens the panel with the phone known: go straight to the new-customer fields unless a saved match exists.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !(options.phone || options.name)) return;
    prefilled.current = true;
    const exact = options.phone ? customers.filter((customer) => matchesCustomer(customer, options.phone!)) : [];
    if (exact.length === 0) setCreating(true);
  }, [options.phone, options.name, customers]);

  /* ---------- vehicle ---------- */
  const hint = plateHint(car.plate);
  const useNewCar = () => {
    const found = findDuplicatePlate(customers, car.plate);
    if (found) { setDuplicate(found); return; }
    if (hint.state !== "ok" || !car.makeModel.trim()) { setShowErrors(true); return; }
    patch({ vehicle: { kind: "new", plate: car.plate.trim(), makeModel: car.makeModel.trim() } });
    setAddingCar(false); setDuplicate(null);
  };
  const useExistingFromDuplicate = (found: { customer: StoreCustomer; vehicle: StoreCustomer["vehicles"][number] }) => {
    patch({
      customer: { kind: "existing", id: found.customer.id, name: found.customer.name, phone: found.customer.phone },
      vehicle: { kind: "existing", id: found.vehicle.id, plate: found.vehicle.plate, makeModel: found.vehicle.makeModel },
    });
    setAddingCar(false); setDuplicate(null);
  };
  const currentCustomerVehicles = selectedCustomer?.vehicles ?? [];
  const vehicleId = draft.vehicle.kind === "existing" ? draft.vehicle.id : undefined;

  /* ---------- catalogue ---------- */
  useEffect(() => {
    const controller = new AbortController();
    setCatalogue(null); setCatalogueError(false);
    fetchIntakeItems({ q: debouncedCatalogue, kind, vehicleId, branchId: draft.branchId }, controller.signal)
      .then(setCatalogue)
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setCatalogueError(true); });
    return () => controller.abort();
  }, [debouncedCatalogue, kind, vehicleId, draft.branchId, catalogueTick]);

  const totals = itemTotals(draft.items);

  /* ---------- booking slots ---------- */
  useEffect(() => {
    if (!bookingOpen || !draft.branchId || !draft.booking.serviceId || !draft.booking.date) { setAvailability(null); return; }
    let live = true;
    setAvailability(null);
    bookingAvailabilityApi.slots({ branchId: draft.branchId, serviceId: draft.booking.serviceId, fromDate: draft.booking.date, toDate: draft.booking.date })
      .then((value) => { if (live) setAvailability(value); })
      .catch(() => { if (live) setAvailability("error"); });
    return () => { live = false; };
  }, [bookingOpen, draft.branchId, draft.booking.serviceId, draft.booking.date]);
  const setBooking = (change: Partial<IntakeDraft["booking"]>) => setDraft((previous) => {
    const next = { ...previous.booking, ...change };
    if (("serviceId" in change || "date" in change) && !("time" in change)) next.time = "";
    return { ...previous, booking: next };
  });

  /* ---------- submit ---------- */
  const submit = async (outcome: IntakeOutcome) => {
    setError(""); setShowErrors(true);
    const next: IntakeDraft = { ...draft, outcome };
    const block = validateDraft(next, { quote: canQuote, booking: canBook });
    if (block) { setError(blockCopy[block][lang]); return; }
    setBusy(outcome);
    try {
      const response = await submitIntake(buildIntakePayload(next));
      let linkFailed = false;
      // The server links the conversation when it was sent; call the link endpoint only when it did not report doing so.
      if (options.conversationId && response.customerId && !response.conversationId) {
        try { await linkConversation(options.conversationId, response.customerId, response.vehicleId ?? undefined); } catch { linkFailed = true; }
      }
      setLinkWarning(linkFailed);
      setResult(response);
      void store.refresh();
      options.onDone?.(response);
      notify?.(t("Saved.", "تم الحفظ."));
    } catch (reason) {
      const duplicateCar = duplicateVehicleOf(reason);
      if (duplicateCar) {
        const found = customers.flatMap((customer) => customer.vehicles.map((vehicle) => ({ customer, vehicle }))).find((entry) => entry.vehicle.id === duplicateCar.id);
        if (found) { setDuplicate(found); setAddingCar(true); }
      }
      setError(intakeErrorText(reason, lang));
    } finally {
      setBusy("");
    }
  };

  const bookingReady = Boolean(draft.booking.serviceId && draft.booking.date && draft.booking.time);
  const onBook = () => {
    if (!bookingOpen) { setBookingOpen(true); return; }
    void submit("booking");
  };

  const serviceOptions = state.services.map((service) => ({ value: service.id, label: lang === "ar" ? (service.nameAr ?? serviceDisplay(service.name, lang)) : service.name }));

  /* ---------- result view ---------- */
  if (result) {
    const customerName = draft.customer.kind === "existing" ? draft.customer.name : draft.customer.kind === "new" ? draft.customer.name : "";
    const plate = draft.vehicle.kind === "existing" ? draft.vehicle.plate : draft.vehicle.kind === "new" ? draft.vehicle.plate : "";
    return <DetailDrawer open lang={lang} onClose={onClose} wide title={t("Saved", "تم الحفظ")}
      footer={<>
        <button type="button" className="btn" onClick={onAddAnother}><Plus size={15} aria-hidden="true" />{t("Add another", "إضافة آخر")}</button>
        {result.quoteId && <button type="button" className="btn btn-primary" onClick={() => { onClose(); navigate(`/workspace/quotes?record=${encodeURIComponent(result.quoteId!)}`); }}><FileText size={15} aria-hidden="true" />{t("Open quote", "فتح عرض السعر")}</button>}
        {!result.quoteId && <button type="button" className="btn btn-primary" onClick={onClose}>{t("Done", "تم")}</button>}
      </>}>
      <div className="intake-result">
        <p className="intake-result-line"><Check size={16} aria-hidden="true" />{t("Everything below was saved.", "تم حفظ كل ما يلي.")}</p>
        <ul className="intake-result-list">
          {result.customerId && <li><RecordRef type="customer" id={result.customerId} label={customerName ? customerName : undefined} /></li>}
          {result.vehicleId && <li><RecordRef type="vehicle" id={result.vehicleId} label={plate ? formatPlateText(plate) : undefined} /></li>}
          {result.quoteId && <li><RecordRef type="quote" id={result.quoteId} label={`${t("Quote", "عرض سعر")}${result.quoteRevision ? ` v${result.quoteRevision}` : ""}`} badge={t("Draft", "مسودة")} /></li>}
          {result.bookingId && <li><RecordRef type="booking" id={result.bookingId} label={`${t("Booking", "حجز")} ${draft.booking.date} ${draft.booking.time}`} /></li>}
        </ul>
        {options.conversationId && !linkWarning && <p className="intake-muted">{t("The chat is now linked to this customer.", "تم ربط المحادثة بهذا العميل.")}</p>}
        {linkWarning && <p className="form-error" role="alert">{t("The customer was saved but the chat could not be linked. Use Link to existing in the chat.", "تم حفظ العميل لكن تعذر ربط المحادثة. استخدم ربط بعميل موجود في المحادثة.")}</p>}
        {result.warnings.map((code) => <p key={code} className="intake-muted" role="note">{warningCopy[code]?.[lang] ?? t("Check the quote before offering it.", "راجع عرض السعر قبل إرساله.")}</p>)}
      </div>
    </DetailDrawer>;
  }

  /* ---------- form ---------- */
  const noQuoteReason = !canQuote ? t("Quotes need quote permission.", "عروض الأسعار تحتاج صلاحية العروض.") : "";
  const footer = <div className="intake-foot">
    {error && <div className="intake-foot-error" role="alert">{error}</div>}
    <div className="intake-foot-actions">
      <button type="button" className="btn" disabled={busy !== ""} onClick={() => void submit("customer-only")}>{busy === "customer-only" ? t("Saving…", "جارٍ الحفظ…") : t("Save customer only", "حفظ العميل فقط")}</button>
      <button type="button" className="btn" disabled={busy !== "" || !canBook || (bookingOpen && !bookingReady)} title={!canBook ? t("Booking needs booking permission.", "الحجز يحتاج صلاحية الحجوزات.") : undefined} onClick={onBook}>
        <CalendarClock size={15} aria-hidden="true" />{busy === "booking" ? t("Saving…", "جارٍ الحفظ…") : t("Book appointment", "حجز موعد")}
      </button>
      <button type="button" className="btn btn-primary" disabled={busy !== "" || !canQuote} title={noQuoteReason || undefined} onClick={() => void submit("quote")}>
        <FileText size={15} aria-hidden="true" />{busy === "quote" ? t("Saving…", "جارٍ الحفظ…") : t("Create quote", "إنشاء عرض سعر")}
      </button>
    </div>
    {!canQuote && <small className="intake-muted">{noQuoteReason}</small>}
  </div>;

  return <DetailDrawer open lang={lang} onClose={onClose} wide footer={footer}
    title={t("New", "جديد")} subtitle={t("Customer, car and request in one place", "العميل والسيارة والطلب في مكان واحد")}>
    <div className="intake-body">
      <RequiredNote text={t("required", "مطلوب")} />

      {/* 1 Customer */}
      <FormSection title={`1. ${t("Customer", "العميل")}`} columns={1}>
        {draft.customer.kind === "existing" && selectedCustomer && <div className="intake-chosen">
          <div className="intake-chosen-main"><strong><bdi>{selectedCustomer.name}</bdi></strong><Phone value={selectedCustomer.phone} /></div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={clearCustomer}><X size={14} aria-hidden="true" />{t("Change", "تغيير")}</button>
        </div>}
        {draft.customer.kind === "new" && <div className="intake-chosen">
          <div className="intake-chosen-main"><strong><bdi>{draft.customer.name}</bdi></strong><Phone value={draft.customer.phone} /><StatusBadge status="new" domain="request" lang={lang} label={t("New customer", "عميل جديد")} /></div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setFresh({ name: draft.customer.kind === "new" ? draft.customer.name : "", phone: draft.customer.kind === "new" ? draft.customer.phone : "", language: draft.customer.kind === "new" ? draft.customer.language : lang }); patch({ customer: { kind: "none" }, vehicle: { kind: "none" } }); setCreating(true); setAddingCar(false); }}>{t("Edit", "تعديل")}</button>
        </div>}
        {draft.customer.kind === "none" && !creating && <>
          <div className="intake-search">
            <Search size={15} aria-hidden="true" />
            <input className="field-input" type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("Search customers", "بحث العملاء")} placeholder={t("Search name, phone or plate", "ابحث بالاسم أو الهاتف أو اللوحة")} data-autofocus />
          </div>
          {query.trim() && matches.length === 0 && <p className="intake-muted" role="status">{t("No matching customer.", "لا يوجد عميل مطابق.")}</p>}
          {matches.length > 0 && <ul className="intake-list" aria-label={t("Customers", "العملاء")}>
            {matches.slice(0, MAX_CUSTOMER_RESULTS).map((customer) => <li key={customer.id}>
              <button type="button" className="intake-row" onClick={() => chooseCustomer(customer)}>
                <span className="intake-row-main"><strong><bdi>{customer.name}</bdi></strong><Phone value={customer.phone} /></span>
                {customer.vehicles.length > 0 && <span className="intake-row-meta">{customer.vehicles.slice(0, 3).map((vehicle) => <Plate key={vehicle.id} value={vehicle.plate} />)}</span>}
              </button>
            </li>)}
          </ul>}
          {matches.length > MAX_CUSTOMER_RESULTS && <p className="intake-muted">{t(`Showing ${MAX_CUSTOMER_RESULTS} of ${matches.length}. Type more to narrow.`, `يظهر ${MAX_CUSTOMER_RESULTS} من ${matches.length}. اكتب أكثر للتضييق.`)}</p>}
          <div><button type="button" className="btn btn-sm" onClick={startNewCustomer}><UserPlus size={14} aria-hidden="true" />{t("New customer", "عميل جديد")}</button></div>
        </>}
        {draft.customer.kind === "none" && creating && <div className="intake-inline" role="group" aria-label={t("New customer", "عميل جديد")}>
          <div className="form-grid">
            <Field label={t("Name", "الاسم")} required error={showErrors && !fresh.name.trim() ? blockCopy["customer-name"][lang] : undefined}>
              <input className="field-input" autoComplete="off" value={fresh.name} onChange={(event) => setFresh({ ...fresh, name: event.target.value })} />
            </Field>
            <Field label={t("Phone", "الهاتف")} required hint={isValidPhone(fresh.phone) ? formatPhone(normalisePhoneInput(fresh.phone)) : undefined} error={showErrors && !isValidPhone(fresh.phone) ? blockCopy["customer-phone"][lang] : undefined}>
              <input className="field-input" type="tel" dir="ltr" autoComplete="off" inputMode="tel" value={fresh.phone} onChange={(event) => setFresh({ ...fresh, phone: event.target.value })} />
            </Field>
            <Field label={t("Language", "اللغة")}>
              <Select className="field-select" label={t("Language", "اللغة")} value={fresh.language} onChange={(event) => setFresh({ ...fresh, language: event.target.value as Locale })} options={[{ value: "ar", label: "العربية" }, { value: "en", label: "English" }]} />
            </Field>
          </div>
          <div className="action-row">
            <button type="button" className="btn btn-primary btn-sm" onClick={confirmNewCustomer}>{t("Use this customer", "استخدام هذا العميل")}</button>
            <button type="button" className="btn btn-sm" onClick={() => setCreating(false)}>{t("Back to search", "رجوع للبحث")}</button>
          </div>
        </div>}
      </FormSection>

      {/* 2 Vehicle */}
      <FormSection title={`2. ${t("Car", "السيارة")}`} columns={1} description={draft.outcome === "customer-only" ? t("Optional when saving the customer only.", "اختياري عند حفظ العميل فقط.") : undefined}>
        {draft.customer.kind === "none" && <p className="intake-muted">{t("Choose a customer first.", "اختر العميل أولاً.")}</p>}
        {draft.customer.kind !== "none" && <>
          {currentCustomerVehicles.length > 0 && <ul className="intake-list" aria-label={t("Cars", "السيارات")}>
            {currentCustomerVehicles.map((vehicle) => {
              const on = draft.vehicle.kind === "existing" && draft.vehicle.id === vehicle.id;
              return <li key={vehicle.id}><button type="button" role="radio" aria-checked={on} className={`intake-row${on ? " selected" : ""}`} onClick={() => { patch({ vehicle: { kind: "existing", id: vehicle.id, plate: vehicle.plate, makeModel: vehicle.makeModel } }); setAddingCar(false); }}>
                <span className="intake-row-main"><Plate value={vehicle.plate} /><span><bdi>{vehicle.makeModel}</bdi></span></span>{on && <Check size={16} aria-hidden="true" />}
              </button></li>;
            })}
          </ul>}
          {draft.vehicle.kind === "new" && !addingCar && <div className="intake-chosen">
            <div className="intake-chosen-main"><Plate value={draft.vehicle.plate} /><span><bdi>{draft.vehicle.makeModel}</bdi></span><StatusBadge status="new" domain="request" lang={lang} label={t("New car", "سيارة جديدة")} /></div>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setCar({ plate: (draft.vehicle as { plate: string }).plate, makeModel: (draft.vehicle as { makeModel: string }).makeModel }); setAddingCar(true); }}>{t("Edit", "تعديل")}</button>
          </div>}
          {!addingCar && draft.vehicle.kind !== "new" && <div><button type="button" className="btn btn-sm" onClick={() => { setCar({ plate: "", makeModel: "" }); setAddingCar(true); }}><Plus size={14} aria-hidden="true" />{t("Add car", "إضافة سيارة")}</button></div>}
          {addingCar && <div className="intake-inline" role="group" aria-label={t("New car", "سيارة جديدة")}>
            <div className="form-grid">
              <Field label={t("Plate", "اللوحة")} required
                hint={hint.state === "ok" ? `${t("Saved as", "ستُحفظ كـ")} ${hint.display}` : undefined}
                error={hint.state === "invalid" ? t("This does not look like a plate. Check it.", "لا تبدو لوحة صحيحة. راجعها.") : showErrors && hint.state === "empty" ? blockCopy.plate[lang] : undefined}>
                <input className="field-input" dir="auto" autoComplete="off" value={car.plate} onChange={(event) => { setCar({ ...car, plate: event.target.value }); setDuplicate(null); }} />
              </Field>
              <Field label={t("Make and model", "الماركة والموديل")} required error={showErrors && !car.makeModel.trim() ? blockCopy["make-model"][lang] : undefined}>
                <input className="field-input" autoComplete="off" value={car.makeModel} onChange={(event) => setCar({ ...car, makeModel: event.target.value })} />
              </Field>
            </div>
            {duplicate && <div className="intake-dup" role="alert">
              <p>{duplicate.customer.id === (draft.customer.kind === "existing" ? draft.customer.id : "")
                ? t("This car is already saved for this customer.", "هذه السيارة محفوظة لهذا العميل بالفعل.")
                : t(`This plate is already saved under ${duplicate.customer.name}.`, `هذه اللوحة محفوظة باسم ${duplicate.customer.name}.`)}</p>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => useExistingFromDuplicate(duplicate)}>{t("Use the existing car", "استخدام السيارة الموجودة")}</button>
            </div>}
            <div className="action-row">
              <button type="button" className="btn btn-primary btn-sm" onClick={useNewCar}>{t("Use this car", "استخدام هذه السيارة")}</button>
              <button type="button" className="btn btn-sm" onClick={() => { setAddingCar(false); setDuplicate(null); }}>{t("Cancel", "إلغاء")}</button>
            </div>
          </div>}
        </>}
      </FormSection>

      {/* 3 Request */}
      <FormSection title={`3. ${t("Request", "الطلب")}`} columns={1} description={t("Services, packages and products in one list.", "الخدمات والباقات والمنتجات في قائمة واحدة.")}>
        <div className="intake-search">
          <Search size={15} aria-hidden="true" />
          <input className="field-input" type="search" autoComplete="off" value={catalogueQuery} onChange={(event) => setCatalogueQuery(event.target.value)} aria-label={t("Search the catalogue", "بحث في الكتالوج")} placeholder={t("Search items", "ابحث في البنود")} />
        </div>
        <div className="intake-chips" role="group" aria-label={t("Type", "النوع")}>
          {(["all", "service", "package", "product"] as KindFilter[]).map((value) => <button key={value} type="button" className="intake-chip" aria-pressed={kind === value} onClick={() => setKind(value)}>
            {value === "all" ? t("All", "الكل") : kindLabels[value][lang]}
          </button>)}
        </div>
        {catalogue === null && !catalogueError && <Skeleton rows={3} label={t("Loading items", "تحميل البنود")} />}
        {catalogueError && <EmptyState variant="error" title={t("Could not load the catalogue.", "تعذر تحميل الكتالوج.")} action={<button type="button" className="btn btn-sm" onClick={() => setCatalogueTick((value) => value + 1)}>{t("Retry", "إعادة المحاولة")}</button>} />}
        {catalogue !== null && catalogue.length === 0 && <EmptyState variant="no-results" title={t("No items found", "لا توجد بنود")} text={t("You can still save the customer.", "يمكنك حفظ العميل على أي حال.")} />}
        {catalogue !== null && catalogue.length > 0 && <ul className="intake-list intake-catalogue" aria-label={t("Catalogue", "الكتالوج")}>
          {catalogue.map((item) => <li key={itemKey(item.id)} className="intake-item">
            <div className="intake-item-main">
              <span className="intake-item-name"><bdi>{itemName(item, lang)}</bdi></span>
              <span className="intake-item-meta"><span className="tag">{kindLabels[item.kind][lang]}</span>{categoryLabel(item, lang) && <bdi>{categoryLabel(item, lang)}</bdi>}</span>
            </div>
            <div className="intake-item-price">{item.price ? <Amount minor={item.price.minor} currency={item.price.currency} lang={lang} variant="detail" /> : <span className="intake-muted">{t("No price", "بلا سعر")}</span>}</div>
            <button type="button" className="btn btn-sm" onClick={() => patch({ items: addItem(draft.items, item) })} aria-label={`${t("Add", "إضافة")} ${itemName(item, lang)}`}><Plus size={14} aria-hidden="true" />{t("Add", "إضافة")}</button>
          </li>)}
        </ul>}

        {draft.items.length > 0 && <div className="intake-selected" aria-label={t("Selected items", "البنود المختارة")} role="group">
          <h3 className="intake-subtitle">{t("Selected", "المختار")}</h3>
          <ul className="intake-list">
            {draft.items.map((entry) => <SelectedRow key={itemKey(entry.item.id)} entry={entry} lang={lang}
              onQuantity={(quantity) => patch({ items: setQuantity(draft.items, itemKey(entry.item.id), quantity) })}
              onRemove={() => patch({ items: removeItem(draft.items, itemKey(entry.item.id)) })} />)}
          </ul>
          <div className="intake-totals" aria-live="polite">
            {totals.totals.map((total) => <div key={total.currency} className="intake-total"><span>{t("Total", "الإجمالي")}</span><Amount minor={total.minor} currency={total.currency} lang={lang} variant="detail" /></div>)}
            {totals.unpriced > 0 && <small className="intake-muted">{t(`${totals.unpriced} without a price: set it on the quote.`, `${totals.unpriced} بلا سعر: حدده في عرض السعر.`)}</small>}
          </div>
        </div>}

        <Field label={t("Notes", "ملاحظات")} hint={t("Saved with the quote or booking.", "تُحفظ مع عرض السعر أو الحجز.")}>
          <textarea className="field-textarea" rows={3} value={draft.notes} maxLength={1000} onChange={(event) => patch({ notes: event.target.value })} />
        </Field>
      </FormSection>

      {/* 4 Booking (revealed by Book appointment) */}
      {bookingOpen && <FormSection title={`4. ${t("Appointment", "الموعد")}`} columns={1}>
        {state.branches.length > 1 && <Field label={t("Branch", "الفرع")}>
          <Select className="field-select" label={t("Branch", "الفرع")} value={draft.branchId} onChange={(event) => patch({ branchId: event.target.value })}
            options={state.branches.map((branch) => ({ value: branch.id, label: lang === "ar" ? (branch.nameAr ?? String(branch.name)) : String(branch.name) }))} />
        </Field>}
        <div className="form-grid">
          <Field label={t("Service", "الخدمة")} required>
            <Select className="field-select" label={t("Service", "الخدمة")} value={draft.booking.serviceId} onChange={(event) => setBooking({ serviceId: event.target.value })} options={serviceOptions} />
          </Field>
          <Field label={t("Date", "التاريخ")} required>
            <input className="field-input" type="date" dir="ltr" min={isoDate(new Date())} value={draft.booking.date} onChange={(event) => setBooking({ date: event.target.value })} />
          </Field>
        </div>
        <div className="intake-slots" role="radiogroup" aria-label={t("Available times", "الأوقات المتاحة")}>
          {availability === null && <Skeleton rows={1} label={t("Loading times", "تحميل الأوقات")} />}
          {availability === "error" && <p className="intake-muted" role="alert">{t("Could not load times.", "تعذر تحميل الأوقات.")}</p>}
          {availability && availability !== "error" && availability.status === "unconfigured" && <p className="intake-muted">{t("Availability is not set up for this branch yet.", "الإتاحة غير مضبوطة لهذا الفرع بعد.")}</p>}
          {availability && availability !== "error" && availability.status === "available" && availability.slots.length === 0 && <p className="intake-muted">{t("No free times on this date.", "لا توجد أوقات متاحة في هذا التاريخ.")}</p>}
          {availability && availability !== "error" && availability.status === "available" && availability.slots.map((slot) => <button key={slot.dropoffTime} type="button" role="radio" aria-checked={draft.booking.time === slot.dropoffTime} className="intake-chip" onClick={() => setBooking({ time: slot.dropoffTime })}>
            <bdi dir="ltr">{slot.dropoffTime}</bdi>
          </button>)}
        </div>
        {draft.booking.time && <p className="intake-muted"><DateText value={`${draft.booking.date}T${draft.booking.time}`} lang={lang} /></p>}
      </FormSection>}
    </div>
  </DetailDrawer>;
}

function formatPlateText(plate: string): string {
  return plate;
}

function SelectedRow({ entry, lang, onQuantity, onRemove }: { entry: SelectedItem; lang: Locale; onQuantity: (quantity: number) => void; onRemove: () => void }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const total = lineTotal(entry);
  return <li className="intake-item">
    <div className="intake-item-main">
      <span className="intake-item-name"><bdi>{itemName(entry.item, lang)}</bdi></span>
      <span className="intake-item-meta"><span className="tag">{kindLabels[entry.item.kind][lang]}</span></span>
    </div>
    <div className="intake-stepper" role="group" aria-label={t("Quantity", "الكمية")}>
      <button type="button" className="btn btn-sm" aria-label={t("Decrease", "إنقاص")} onClick={() => onQuantity(entry.quantity - 1)}><Minus size={14} aria-hidden="true" /></button>
      <span className="intake-qty" aria-live="polite"><bdi dir="ltr">{entry.quantity}</bdi></span>
      <button type="button" className="btn btn-sm" aria-label={t("Increase", "زيادة")} onClick={() => onQuantity(entry.quantity + 1)}><Plus size={14} aria-hidden="true" /></button>
    </div>
    <div className="intake-item-price">{total !== null && entry.item.price ? <Amount minor={total} currency={entry.item.price.currency} lang={lang} variant="detail" /> : <span className="intake-muted">—</span>}</div>
    <button type="button" className="btn btn-quiet btn-sm" aria-label={t("Remove", "إزالة")} onClick={onRemove}><X size={14} aria-hidden="true" /></button>
  </li>;
}

export { effectiveVehicle };
export type { VehicleChoice };
