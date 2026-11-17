import { useEffect, useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { bookingAvailabilityApi, unknownWriteOutcomeCopy, useGarageStore, type SlotAvailability } from "../../shared/store";
import type { BranchId } from "@garage/domain";
import { customerDisplay, dateLabel, EmptyState, PageHeading, SectionTitle, serviceDisplay, Status, timeLabel, type ModalConfig, type RecordPageProps } from "../../shared/ui";
import { reconcileBookingDraft } from "../../shared/task-steps";

interface BookingsPageProps extends RecordPageProps {
  confirmModal: (config: ModalConfig | null) => void;
}

interface BookingForm {
  customerId: string;
  vehicleId: string;
  serviceId: string;
  branchId: BranchId;
  dropoffDate: string;
  dropoffTime: string;
}

const bookingErrorCopy: Record<string, { en: string; ar: string }> = {
  INVALID_BOOKING: { en: "Check the customer, vehicle, service, date, and branch.", ar: "راجع بيانات العميل والعربية والخدمة والتاريخ والفرع." },
  BRANCH_CLOSED: { en: "The branch is closed on this weekday.", ar: "الفرع مقفول في اليوم ده." },
  DAILY_CAP_REACHED: { en: "The branch has reached its daily vehicle intake limit.", ar: "الفرع وصل للحد اليومي لاستقبال العربيات." },
  BAY_CAPACITY_REACHED: { en: "Bay-hour capacity is full for this date and service.", ar: "ساعات البايات خلصت للتاريخ والخدمة دول." },
  BOOKING_NOT_PENDING: { en: "This booking is no longer waiting for confirmation.", ar: "الحجز ده مش مستني تأكيد دلوقتي." },
  MANAGER_REVIEW_REQUIRED: { en: "This booking needs a manager to confirm it.", ar: "مدير الفرع لازم يأكد الحجز ده." },
  JOB_ALREADY_STARTED: { en: "The job has started; use the workshop workflow instead.", ar: "الشغل على العربية بدأ؛ كمّل من صفحة الورشة." },
};

export function BookingsPage({ lang, t, state, branchName, customerName, serviceName, vehicleFor, notify, confirmModal }: BookingsPageProps) {
  const store = useGarageStore();
  const firstBranchId = (state.branches[0]?.id ?? "branch-a") as BranchId;
  const defaultBranch = state.currentBranch === "all" ? firstBranchId : state.currentBranch;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [invalidated, setInvalidated] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [availability,setAvailability]=useState<SlotAvailability|null>(null);
  const [moving,setMoving]=useState<{bookingId:string;date:string;time:string}|null>(null);
  const [moveAvailability,setMoveAvailability]=useState<SlotAvailability|null>(null);
  const [form, setForm] = useState<BookingForm>({
    customerId: "",
    vehicleId: "",
    serviceId: "",
    branchId: defaultBranch,
    dropoffDate: "",
    dropoffTime: "09:00",
  });
  const availableCustomers = state.customers;
  const draftIdentity = `${store.actor?.userId ?? "anonymous"}:${store.actor?.isDemo ? "demo" : "live"}`;
  const updateDraft = (update: Partial<BookingForm>) => setForm((previous) => {
    const result = reconcileBookingDraft(
      { ...previous, identityKey: draftIdentity },
      { ...previous, ...update, identityKey: draftIdentity },
    );
    setInvalidated(result.invalidated);
    const { identityKey: _identityKey, availabilityVersion: _availabilityVersion, ...draft } = result.draft;
    return draft as BookingForm;
  });
  const discardDraft = () => {
    setForm({ customerId: "", vehicleId: "", serviceId: "", branchId: defaultBranch, dropoffDate: "", dropoffTime: "09:00" });
    setStep(1); setInvalidated([]); setError(""); setShowForm(false);
  };
  const filtered = state.bookings.filter((booking) => {
    const customer = state.customers.find((item) => item.id === booking.customerId);
    const vehicle = vehicleFor(booking.customerId, booking.vehicleId);
    const searchable = `${customer?.name ?? ""} ${customer?.phone ?? ""} ${vehicle?.plate ?? ""} ${booking.id}`.toLowerCase();
    return searchable.includes(query.toLowerCase()) &&
      (filter === "all" || booking.status === filter) &&
      (state.currentBranch === "all" || booking.branchId === state.currentBranch);
  });

  useEffect(() => {
    const customer = availableCustomers.find((item) => item.id === form.customerId);
    if (customer && !customer.vehicles.some((vehicle) => vehicle.id === form.vehicleId)) {
      setForm((previous) => ({ ...previous, vehicleId: customer.vehicles[0]?.id ?? "" }));
    }
  }, [form.customerId, form.vehicleId, availableCustomers]);

  useEffect(()=>{
    let live=true;setAvailability(null);
    if(!showForm||!form.branchId||!form.serviceId||!form.dropoffDate)return;
    void bookingAvailabilityApi.slots({branchId:form.branchId,serviceId:form.serviceId,fromDate:form.dropoffDate,toDate:form.dropoffDate}).then(result=>{
      if(live)setAvailability(result);
    }).catch(()=>{if(live)setAvailability({status:"unconfigured",missing:["availability could not be loaded"]});});
    return()=>{live=false};
  },[showForm,form.branchId,form.serviceId,form.dropoffDate]);
  useEffect(()=>{
    let live=true;setMoveAvailability(null);
    if(!moving?.date)return;
    const booking=state.bookings.find(item=>item.id===moving.bookingId);if(!booking)return;
    const selector=booking.acceptedQuoteRef?{quoteId:booking.acceptedQuoteRef.quoteId,quoteRevision:booking.acceptedQuoteRef.revision}:{serviceId:booking.serviceId};
    void bookingAvailabilityApi.slots({branchId:booking.branchId,fromDate:moving.date,toDate:moving.date,bookingId:booking.id,...selector}).then(result=>{if(live)setMoveAvailability(result)}).catch(()=>{if(live)setMoveAvailability({status:"unconfigured",missing:["availability could not be loaded"]})});
    return()=>{live=false};
  },[moving?.bookingId,moving?.date,state.bookings]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    if(availability?.status!=="available"||!availability.slots.some(slot=>slot.dropoffTime===form.dropoffTime)){
      setSaving(false);setError(t("Choose an available slot first.","اختر موعداً متاحاً أولاً."));return;
    }
    const result = await store.createBookingRequest({...form,configurationVersion:availability.configurationVersion} as typeof form);
    setSaving(false);
    if (result.ok) {
      setShowForm(false);
      setForm({ customerId: "", vehicleId: "", serviceId: "", branchId: defaultBranch, dropoffDate: "", dropoffTime: "09:00" });
      notify(result.status === "confirmed"
        ? t("Booking confirmed and added to the workshop.", "الحجز اتأكد واتضاف للورشة.")
        : t("Booking request saved for staff review.", "طلب الحجز اتحفظ عشان الفريق يراجعه."));
      return;
    }
    const copy = bookingErrorCopy[result.error];
    setError(unknownWriteOutcomeCopy(result.error, lang) ?? (copy ? t(copy.en, copy.ar) : t("The booking could not be saved. Check your access and try again.", "ماقدرناش نحفظ الحجز. راجع صلاحيتك وجرّب تاني.")));
  };

  const confirm = async (bookingId: string) => {
    const result = await store.confirmBooking(bookingId);
    if (result.ok) {
      notify(t("Booking confirmed and added to the workshop.", "الحجز اتأكد واتضاف للورشة."));
      return;
    }
    const copy = bookingErrorCopy[result.error];
    notify(unknownWriteOutcomeCopy(result.error, lang) ?? (copy ? t(copy.en, copy.ar) : t("The booking could not be confirmed.", "ماقدرناش نأكد الحجز.")));
  };

  const cancel = (bookingId: string) => confirmModal({
    title: t("Cancel this booking?", "إلغاء هذا الحجز؟"),
    body: t("This updates the booking and its workshop status. No customer message is sent.", "حالة الحجز والورشة هتتحدّث. مش هنبعت أي رسالة للعميل."),
    danger: true,
    confirm: async () => {
      const result = await store.cancelBooking(bookingId);
      confirmModal(null);
      if (result.ok) {
        notify(t("Booking cancelled.", "الحجز اتلغى."));
        return;
      }
      const copy = bookingErrorCopy[result.error];
      notify(unknownWriteOutcomeCopy(result.error, lang) ?? (copy ? t(copy.en, copy.ar) : t("The booking could not be cancelled.", "ماقدرناش نلغي الحجز.")));
    },
  });

  const reschedule=async()=>{
    if(!moving)return;
    if(moveAvailability?.status!=="available"||!moveAvailability.slots.some(slot=>slot.dropoffTime===moving.time)){notify(t("Choose an available new slot.","اختر موعداً جديداً متاحاً."));return;}
    try {await bookingAvailabilityApi.reschedule(moving.bookingId,moving.date,moving.time);await store.refresh();setMoving(null);notify(t("Booking rescheduled.","تم تغيير موعد الحجز."));}
    catch {notify(t("The new slot is unavailable. The original booking is unchanged.","الموعد الجديد غير متاح. بقي الحجز الأصلي كما هو."));}
  };

  return <>
    <PageHeading
      eyebrow={t("Reception · Scheduling", "الاستقبال · المواعيد")}
      title={t("Bookings", "الحجوزات")}
      subtitle={t("Create and review appointments against the active branch capacity rules.", "اعمل مواعيد وراجعها حسب قواعد سعة الفرع اللي شغالة دلوقتي.")}
      action={<button className="btn btn-primary" type="button" onClick={() => { setShowForm((value) => !value); setError(""); }}><Plus size={16} />{t("New booking", "حجز جديد")}</button>}
    />

    {showForm && <form className="form-panel" onSubmit={(event) => void create(event)}>
      <SectionTitle title={t("New booking", "حجز جديد")} description={t("Capacity and branch access are checked by the server before a booking is stored.", "النظام بيتأكد من السعة وصلاحية الفرع قبل ما يحفظ الحجز.")} />
      <p className="top-meta" role="status">{t("Step", "الخطوة")} {step} {t("of 3", "من 3")} · {step === 1 ? t("Customer and vehicle", "العميل والعربية") : step === 2 ? t("Service and branch", "الخدمة والفرع") : t("Available appointment", "الموعد المتاح")}</p>
      {invalidated.length > 0 && <p className="form-hint" role="status">{t("A prerequisite changed, so dependent choices were cleared:", "اتغير اختيار أساسي، فتم مسح الاختيارات التابعة:")} {invalidated.join(", ")}</p>}
      <div className="form-grid">
        {step === 1 && <>
        <div className="form-field"><label className="field-label" htmlFor="booking-customer"><span>{t("Customer", "العميل")}</span><span aria-hidden="true">*</span></label><select id="booking-customer" className="field-select" required value={form.customerId} onChange={(event) => updateDraft({ customerId: event.target.value })}><option value="">{t("Choose a customer", "اختار عميل")}</option>{availableCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customerDisplay(customer.name, lang)} · {customer.phone}</option>)}</select></div>
        <div className="form-field"><label className="field-label" htmlFor="booking-vehicle"><span>{t("Vehicle", "العربية")}</span><span aria-hidden="true">*</span></label><select id="booking-vehicle" className="field-select vehicle-select" required value={form.vehicleId} onChange={(event) => setForm({ ...form, vehicleId: event.target.value })}><option value="">{t("Choose a vehicle", "اختار عربية")}</option>{state.customers.find((customer) => customer.id === form.customerId)?.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.makeModel}</option>)}</select>{form.vehicleId && <span className="vehicle-selection">{state.customers.find((customer) => customer.id === form.customerId)?.vehicles.find((vehicle) => vehicle.id === form.vehicleId)?.plate} · {state.customers.find((customer) => customer.id === form.customerId)?.vehicles.find((vehicle) => vehicle.id === form.vehicleId)?.makeModel}</span>}</div>
        </>}
        {step === 2 && <>
        <div className="form-field"><label className="field-label" htmlFor="booking-service"><span>{t("Service", "الخدمة")}</span><span aria-hidden="true">*</span></label><select id="booking-service" className="field-select" required value={form.serviceId} onChange={(event) => updateDraft({ serviceId: event.target.value })}><option value="">{t("Choose a service", "اختار خدمة")}</option>{state.services.map((service) => <option key={service.id} value={service.id}>{serviceDisplay(service.name, lang)} · {service.id === "tint" || service.id === "ceramic" ? state.effectiveServiceHoursByBranch?.[form.branchId]?.[service.id] ?? service.bayHours : service.bayHours} {t("bay-hours", "ساعة باي")}</option>)}</select></div>
        <div className="form-field"><label className="field-label" htmlFor="booking-branch"><span>{t("Branch", "الفرع")}</span><span aria-hidden="true">*</span></label><select id="booking-branch" className="field-select" required value={form.branchId} onChange={(event) => updateDraft({ branchId: event.target.value as BranchId })}>{state.branches.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch.id)}</option>)}</select></div>
        </>}
        {step === 3 && <>
        <div className="form-field"><label className="field-label" htmlFor="booking-date"><span>{t("Drop-off date", "تاريخ الاستلام")}</span><span aria-hidden="true">*</span></label><input id="booking-date" className="field-input" type="date" required value={form.dropoffDate} onChange={(event) => setForm({ ...form, dropoffDate: event.target.value })} /></div>
        <div className="form-field"><label className="field-label" htmlFor="booking-time"><span>{t("Drop-off time", "وقت تسليم العربية للفرع")}</span><span aria-hidden="true">*</span></label><input id="booking-time" className="field-input" type="time" lang="en-GB" dir="ltr" step={60} required aria-describedby="booking-time-hint" value={form.dropoffTime} onChange={(event) => setForm({ ...form, dropoffTime: event.target.value })} /><span id="booking-time-hint" className="form-hint">{t("24-hour time (00:00 midnight, 12:00 noon)", "الوقت بنظام 24 ساعة (00:00 منتصف الليل، 12:00 الظهر)")}</span></div>
        </>}
      </div>
      {step === 3 && <><div role="status" aria-live="polite">{availability?.status==="unconfigured"&&t("Availability is not configured for this branch and service.","المواعيد المتاحة غير مهيأة لهذا الفرع والخدمة.")}{availability?.status==="available"&&availability.slots.length===0&&t("No available slots on this date.","لا توجد مواعيد متاحة في هذا التاريخ.")}</div>
      {availability?.status==="available"&&<div className="action-row" aria-label={t("Available slots","المواعيد المتاحة")}>{availability.slots.map(slot=><button key={slot.dropoffTime} type="button" className={form.dropoffTime===slot.dropoffTime?"btn btn-sm btn-primary":"btn btn-sm"} onClick={()=>setForm({...form,dropoffTime:slot.dropoffTime})}>{slot.dropoffTime}</button>)}</div>}</>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-actions"><button type="button" className="btn btn-danger" onClick={discardDraft}>{t("Discard", "تجاهل")}</button>{step > 1 && <button type="button" className="btn" onClick={() => setStep((step - 1) as 1 | 2)}>{t("Back", "رجوع")}</button>}{step < 3 ? <button type="button" className="btn btn-primary" disabled={step === 1 ? !form.customerId || !form.vehicleId : !form.serviceId || !form.branchId} onClick={() => setStep((step + 1) as 2 | 3)}>{t("Continue", "متابعة")}</button> : <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? t("Saving…", "بنحفظ…") : t("Save booking", "احفظ الحجز")}</button>}</div>
    </form>}

    <div className="toolbar"><div className="toolbar-start"><label className="search-wrap"><Search size={16} /><span className="sr-only">{t("Search bookings", "دوّر على الحجوزات")}</span><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search name, phone, plate or booking…", "دوّر بالاسم أو رقم الموبايل أو اللوحة أو الحجز…")} /></label>
      <select className="filter-select" style={{ width: "auto" }} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">{t("All statuses", "كل الحالات")}</option><option value="pending">{t("Pending", "مستني")}</option><option value="confirmed">{t("Confirmed", "اتأكد")}</option><option value="cancelled">{t("Cancelled", "اتلغى")}</option><option value="no-show">{t("No-show", "ماجاش")}</option></select>
    </div><span className="top-meta">{filtered.length} {t("records", "سجلات")}</span></div>

    <div className="table-wrap"><table><thead><tr>
      <th>{t("Customer / vehicle", "العميل / المركبة")}</th><th>{t("Service", "الخدمة")}</th><th>{t("Branch", "الفرع")}</th><th>{t("Drop-off", "الاستلام")}</th><th>{t("Expected pickup", "التسليم المتوقع")}</th><th>{t("Status", "الحالة")}</th><th>{t("Actions", "الإجراءات")}</th>
    </tr></thead><tbody>
      {filtered.map((booking) => {
        const vehicle = vehicleFor(booking.customerId, booking.vehicleId);
        return <tr key={booking.id}>
          <td><div className="primary-cell">{customerName(booking.customerId)}</div><div className="secondary-cell mono">{vehicle?.plate} · {vehicle?.makeModel}</div></td>
          <td>{booking.workSummary?.[lang] ?? serviceName(booking.serviceId)}{booking.acceptedQuoteRef && <div className="secondary-cell mono">{t("Accepted quote", "عرض السعر المقبول")}: {booking.acceptedQuoteRef.quoteId} · {t("revision", "الإصدار")} {booking.acceptedQuoteRef.revision}</div>}</td><td>{branchName(booking.branchId)}</td>
          <td><bdi className="localized-datetime">{dateLabel(booking.dropoffDate, lang)}</bdi><div className="secondary-cell"><bdi className="localized-datetime">{timeLabel(booking.dropoffTime, lang)}</bdi></div></td>
          <td><bdi className="localized-datetime">{dateLabel(booking.expectedPickup, lang)}</bdi></td><td><Status status={booking.status} lang={lang} /></td>
          <td><div className="action-row">{booking.status === "pending" && <button className="btn btn-sm btn-primary" onClick={() => void confirm(booking.id)}>{t("Confirm", "تأكيد")}</button>}{booking.status === "confirmed" && <button className="btn btn-sm" onClick={() => setMoving({bookingId:booking.id,date:booking.dropoffDate,time:booking.dropoffTime})}>{t("Reschedule","تغيير الموعد")}</button>}{(booking.status === "pending" || booking.status === "confirmed") && <button className="btn btn-sm btn-danger" onClick={() => cancel(booking.id)}>{t("Cancel", "إلغاء")}</button>}</div></td>
        </tr>;
      })}
      {!filtered.length && <tr><td colSpan={7}><EmptyState title={t("No matching bookings", "مفيش حجوزات مطابقة")} text={t("Create a booking or adjust the search and status filter.", "اعمل حجز جديد أو غيّر كلمة البحث وفلتر الحالة.")} /></td></tr>}
    </tbody></table></div>
    {moving&&<div className="form-panel" dir={lang==="ar"?"rtl":"ltr"}><SectionTitle title={t("Reschedule booking","تغيير موعد الحجز")} description={t("The original booking remains if the new slot cannot be confirmed.","يبقى الحجز الأصلي إذا تعذر تأكيد الموعد الجديد.")}/><div className="form-grid"><label className="form-field">{t("Date","التاريخ")}<input className="field-input" type="date" value={moving.date} onChange={event=>setMoving({...moving,date:event.target.value})}/></label><label className="form-field">{t("Time","الوقت")}<select className="field-select" value={moving.time} onChange={event=>setMoving({...moving,time:event.target.value})}><option value="">{t("Choose available time","اختر موعداً متاحاً")}</option>{moveAvailability?.status==="available"&&moveAvailability.slots.map(slot=><option key={slot.dropoffTime} value={slot.dropoffTime}>{slot.dropoffTime}</option>)}</select></label></div><div className="form-actions"><button className="btn" onClick={()=>setMoving(null)}>{t("Close","إغلاق")}</button><button className="btn btn-primary" onClick={()=>void reschedule()}>{t("Confirm new slot","تأكيد الموعد الجديد")}</button></div></div>}
  </>;
}
