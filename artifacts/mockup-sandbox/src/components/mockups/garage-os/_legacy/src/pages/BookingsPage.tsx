import { useEffect, useState, type FormEvent } from "react";
import { Plus, Search, ShieldAlert } from "lucide-react";
import { configuredServiceHours } from "../domain";
import { useGarageStore } from "../store";
import type { BranchId } from "../types";
import { customerDisplay, dateLabel, EmptyState, PageHeading, SectionTitle, serviceDisplay, Status, type ModalConfig, type RecordPageProps } from "../ui";

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

export function BookingsPage({ lang, t, state, branchName, customerName, serviceName, vehicleFor, notify, confirmModal }: BookingsPageProps) {
  const store = useGarageStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<BookingForm>({
    customerId: "",
    vehicleId: "",
    serviceId: "",
    branchId: state.currentBranch === "all" ? "branch-a" : state.currentBranch,
    dropoffDate: "",
    dropoffTime: "09:00",
  });
  const availableCustomers = state.customers;
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

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const result = store.createBookingRequest(form);
    if (result.ok) {
      setShowForm(false);
      setForm({ customerId: "", vehicleId: "", serviceId: "", branchId: state.currentBranch === "all" ? "branch-a" : state.currentBranch, dropoffDate: "", dropoffTime: "09:00" });
      notify(t("Booking request saved. Recheck capacity before confirming.", "تم حفظ طلب الحجز. أعد التحقق من السعة قبل التأكيد."));
      return;
    }
    const errors: Record<string, string> = {
      record: t("Choose a valid customer, vehicle, branch and service.", "اختر عميلاً ومركبة وفرعاً وخدمة صحيحة."),
      date: t("Choose a drop-off date and time.", "اختر تاريخ ووقت الاستلام."),
      closed: t("The selected branch is closed on this weekday. Choose another date.", "الفرع مغلق في يوم الأسبوع المحدد. اختر تاريخاً آخر."),
      "daily-cap": t("The daily drop-off limit is reached. Review capacity or choose another date.", "تم بلوغ الحد اليومي للاستلام. راجع السعة أو اختر تاريخاً آخر."),
      "bay-capacity": t("Bay-hour capacity does not fit this request. Choose another date or service.", "ساعات سعة البايات لا تكفي لهذا الطلب. اختر تاريخاً أو خدمة أخرى."),
    };
    setError(errors[result.error] ?? t("Could not save this request.", "تعذر حفظ هذا الطلب."));
  };

  const confirm = (bookingId: string) => {
    const result = store.confirmBookingForDemo(bookingId);
    if (result.ok) {
      notify(t("Booking confirmed for this demo after capacity recheck.", "تم تأكيد الحجز للعرض التجريبي بعد إعادة التحقق من السعة."));
      return;
    }
    const errors: Record<string, string> = {
      record: t("This request is no longer pending.", "لم يعد هذا الطلب قيد الانتظار."),
      "daily-cap": t("Daily limit has filled. The request was not confirmed.", "اكتمل الحد اليومي. لم يتم تأكيد الطلب."),
      "bay-capacity": t("Bay capacity no longer fits. The request was not confirmed.", "لم تعد سعة البايات كافية. لم يتم تأكيد الطلب."),
    };
    notify(errors[result.error] ?? t("Capacity check failed.", "فشل التحقق من السعة."));
  };

  const cancel = (bookingId: string) => confirmModal({
    title: t("Cancel this booking?", "إلغاء هذا الحجز؟"),
    body: t("This changes the sample booking to cancelled on this device. It does not contact the customer.", "سيغير هذا الحجز التجريبي إلى ملغي على هذا الجهاز. لن يتم التواصل مع العميل."),
    danger: true,
    confirm: () => {
      store.cancelBooking(bookingId);
      confirmModal(null);
      notify(t("Booking cancelled in demo data.", "تم إلغاء الحجز في البيانات التجريبية."));
    },
  });

  return <>
    <PageHeading eyebrow={t("Reception · Scheduling", "الاستقبال · المواعيد")} title={t("Bookings", "الحجوزات")} subtitle={t("Requests are checked against the selected branch's sample day limit and bay-hour capacity before confirmation.", "تُراجع الطلبات مقابل الحد اليومي التجريبي وساعات سعة البايات للفرع قبل التأكيد.")} action={<button className="btn btn-primary" onClick={() => { setShowForm((value) => !value); setError(""); }}><Plus size={16} />{t("New request", "طلب جديد")}</button>} />
    <div className="warning-banner"><ShieldAlert size={17} /><div>{t("Sample customer and vehicle records only. Confirming creates a demo job; no WhatsApp message is sent.", "سجلات العملاء والمركبات تجريبية فقط. التأكيد ينشئ وظيفة تجريبية؛ لا يتم إرسال رسالة واتساب.")}</div></div>
    {showForm && <form className="form-panel" onSubmit={create}>
      <SectionTitle title={t("Create booking request", "إنشاء طلب حجز")} description={t("A request stays pending until a staff member rechecks capacity and confirms it.", "يبقى الطلب قيد الانتظار حتى يعيد الموظف التحقق من السعة ويؤكده.")} />
      <div className="form-grid">
        <div className="form-field"><label className="field-label">{t("Customer", "العميل")} *</label><select className="field-select" required value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value, vehicleId: "" })}><option value="">{t("Choose a customer", "اختر عميلاً")}</option>{availableCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customerDisplay(customer.name, lang)} · {customer.phone}</option>)}</select></div>
        <div className="form-field"><label className="field-label">{t("Vehicle", "المركبة")} *</label><select className="field-select" required value={form.vehicleId} onChange={(event) => setForm({ ...form, vehicleId: event.target.value })}><option value="">{t("Choose a vehicle", "اختر مركبة")}</option>{state.customers.find((customer) => customer.id === form.customerId)?.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.makeModel}</option>)}</select></div>
        <div className="form-field"><label className="field-label">{t("Service", "الخدمة")} *</label><select className="field-select" required value={form.serviceId} onChange={(event) => setForm({ ...form, serviceId: event.target.value })}><option value="">{t("Choose a service", "اختر خدمة")}</option>{state.services.map((service) => <option key={service.id} value={service.id}>{serviceDisplay(service.name, lang)} · {configuredServiceHours(service, state.decisions)} {t("bay hours", "ساعات باي")}</option>)}</select></div>
        <div className="form-field"><label className="field-label">{t("Branch", "الفرع")} *</label><select className="field-select" value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value as BranchId })}>{state.branches.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch.id)}</option>)}</select></div>
        <div className="form-field"><label className="field-label">{t("Drop-off date", "تاريخ الاستلام")} *</label><input className="field-input" type="date" required value={form.dropoffDate} onChange={(event) => setForm({ ...form, dropoffDate: event.target.value })} /></div>
        <div className="form-field"><label className="field-label">{t("Drop-off time", "وقت الاستلام")} *</label><input className="field-input" type="time" required value={form.dropoffTime} onChange={(event) => setForm({ ...form, dropoffTime: event.target.value })} /></div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-actions"><button type="button" className="btn" onClick={() => setShowForm(false)}>{t("Close", "إغلاق")}</button><button className="btn btn-primary" type="submit">{t("Save request", "حفظ الطلب")}</button></div>
    </form>}
    <div className="toolbar"><div className="toolbar-start"><label className="search-wrap"><Search size={16} /><span className="sr-only">{t("Search bookings", "البحث في الحجوزات")}</span><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search name, phone, plate or booking ID…", "ابحث بالاسم أو الهاتف أو اللوحة أو رقم الحجز…")} /></label><select className="filter-select" style={{ width: "auto" }} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">{t("All statuses", "كل الحالات")}</option><option value="pending">{t("Pending", "قيد الانتظار")}</option><option value="confirmed">{t("Confirmed", "مؤكد")}</option><option value="cancelled">{t("Cancelled", "ملغي")}</option></select></div><span className="top-meta">{filtered.length} {t("records", "سجلات")}</span></div>
    <div className="table-wrap"><table><thead><tr><th>{t("Customer / vehicle", "العميل / المركبة")}</th><th>{t("Service", "الخدمة")}</th><th>{t("Branch", "الفرع")}</th><th>{t("Drop-off", "الاستلام")}</th><th>{t("Expected pickup", "التسليم المتوقع")}</th><th>{t("Status", "الحالة")}</th><th>{t("Actions", "الإجراءات")}</th></tr></thead><tbody>
      {filtered.map((booking) => {
        const vehicle = vehicleFor(booking.customerId, booking.vehicleId);
        return <tr key={booking.id}><td><div className="primary-cell">{customerName(booking.customerId)}</div><div className="secondary-cell mono">{vehicle?.plate} · {vehicle?.makeModel}</div></td><td>{serviceName(booking.serviceId)}</td><td>{branchName(booking.branchId)}</td><td><span className="mono">{dateLabel(booking.dropoffDate, lang)}</span><div className="secondary-cell mono">{booking.dropoffTime}</div></td><td>{dateLabel(booking.expectedPickup, lang)}</td><td><Status status={booking.status} lang={lang} /></td><td><div className="action-row">{booking.status === "pending" && <button className="btn btn-sm btn-primary" onClick={() => confirm(booking.id)}>{t("Recheck & confirm", "تحقق وأكد")}</button>}{booking.status !== "cancelled" && <button className="btn btn-sm btn-danger" onClick={() => cancel(booking.id)}>{t("Cancel", "إلغاء")}</button>}</div></td></tr>;
      })}
      {!filtered.length && <tr><td colSpan={7}><EmptyState title={t("No matching bookings", "لا توجد حجوزات مطابقة")} text={t("Create a new request or adjust the search and status filter.", "أنشئ طلباً جديداً أو غيّر البحث ومرشح الحالة.")} /></td></tr>}
    </tbody></table></div>
  </>;
}
