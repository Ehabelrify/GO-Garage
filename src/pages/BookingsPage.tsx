import { useEffect, useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<BookingForm>({
    customerId: "",
    vehicleId: "",
    serviceId: "",
    branchId: defaultBranch,
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

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    const result = await store.createBookingRequest(form);
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
    setError(copy ? t(copy.en, copy.ar) : t("The booking could not be saved. Check your access and try again.", "ماقدرناش نحفظ الحجز. راجع صلاحيتك وجرّب تاني."));
  };

  const confirm = async (bookingId: string) => {
    const result = await store.confirmBooking(bookingId);
    if (result.ok) {
      notify(t("Booking confirmed and added to the workshop.", "الحجز اتأكد واتضاف للورشة."));
      return;
    }
    const copy = bookingErrorCopy[result.error];
    notify(copy ? t(copy.en, copy.ar) : t("The booking could not be confirmed.", "ماقدرناش نأكد الحجز."));
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
      notify(copy ? t(copy.en, copy.ar) : t("The booking could not be cancelled.", "ماقدرناش نلغي الحجز."));
    },
  });

  return <>
    <PageHeading
      eyebrow={t("Reception · Scheduling", "الاستقبال · المواعيد")}
      title={t("Bookings", "الحجوزات")}
      subtitle={t("Create and review appointments against the active branch capacity rules.", "اعمل مواعيد وراجعها حسب قواعد سعة الفرع اللي شغالة دلوقتي.")}
      action={<button className="btn btn-primary" type="button" onClick={() => { setShowForm((value) => !value); setError(""); }}><Plus size={16} />{t("New booking", "حجز جديد")}</button>}
    />

    {showForm && <form className="form-panel" onSubmit={(event) => void create(event)}>
      <SectionTitle title={t("New booking", "حجز جديد")} description={t("Capacity and branch access are checked by the server before a booking is stored.", "النظام بيتأكد من السعة وصلاحية الفرع قبل ما يحفظ الحجز.")} />
      <div className="form-grid">
        <div className="form-field"><label className="field-label" htmlFor="booking-customer">{t("Customer", "العميل")} *</label><select id="booking-customer" className="field-select" required value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value, vehicleId: "" })}><option value="">{t("Choose a customer", "اختار عميل")}</option>{availableCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customerDisplay(customer.name, lang)} · {customer.phone}</option>)}</select></div>
        <div className="form-field"><label className="field-label" htmlFor="booking-vehicle">{t("Vehicle", "العربية")} *</label><select id="booking-vehicle" className="field-select" required value={form.vehicleId} onChange={(event) => setForm({ ...form, vehicleId: event.target.value })}><option value="">{t("Choose a vehicle", "اختار عربية")}</option>{state.customers.find((customer) => customer.id === form.customerId)?.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.makeModel}</option>)}</select></div>
        <div className="form-field"><label className="field-label" htmlFor="booking-service">{t("Service", "الخدمة")} *</label><select id="booking-service" className="field-select" required value={form.serviceId} onChange={(event) => setForm({ ...form, serviceId: event.target.value })}><option value="">{t("Choose a service", "اختار خدمة")}</option>{state.services.map((service) => <option key={service.id} value={service.id}>{serviceDisplay(service.name, lang)} · {configuredServiceHours(service, state.decisions)} {t("bay-hours", "ساعة باي")}</option>)}</select></div>
        <div className="form-field"><label className="field-label" htmlFor="booking-branch">{t("Branch", "الفرع")} *</label><select id="booking-branch" className="field-select" required value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value as BranchId })}>{state.branches.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch.id)}</option>)}</select></div>
        <div className="form-field"><label className="field-label" htmlFor="booking-date">{t("Drop-off date", "تاريخ الاستلام")} *</label><input id="booking-date" className="field-input" type="date" required value={form.dropoffDate} onChange={(event) => setForm({ ...form, dropoffDate: event.target.value })} /></div>
        <div className="form-field"><label className="field-label" htmlFor="booking-time">{t("Drop-off time", "وقت تسليم العربية للفرع")} *</label><input id="booking-time" className="field-input" type="time" required value={form.dropoffTime} onChange={(event) => setForm({ ...form, dropoffTime: event.target.value })} /></div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-actions"><button type="button" className="btn" onClick={() => setShowForm(false)}>{t("Close", "اقفل")}</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? t("Saving…", "بنحفظ…") : t("Save booking", "احفظ الحجز")}</button></div>
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
          <td>{serviceName(booking.serviceId)}</td><td>{branchName(booking.branchId)}</td>
          <td><span className="mono">{dateLabel(booking.dropoffDate, lang)}</span><div className="secondary-cell mono">{booking.dropoffTime}</div></td>
          <td>{dateLabel(booking.expectedPickup, lang)}</td><td><Status status={booking.status} lang={lang} /></td>
          <td><div className="action-row">{booking.status === "pending" && <button className="btn btn-sm btn-primary" onClick={() => void confirm(booking.id)}>{t("Confirm", "تأكيد")}</button>}{(booking.status === "pending" || booking.status === "confirmed") && <button className="btn btn-sm btn-danger" onClick={() => cancel(booking.id)}>{t("Cancel", "إلغاء")}</button>}</div></td>
        </tr>;
      })}
      {!filtered.length && <tr><td colSpan={7}><EmptyState title={t("No matching bookings", "مفيش حجوزات مطابقة")} text={t("Create a booking or adjust the search and status filter.", "اعمل حجز جديد أو غيّر كلمة البحث وفلتر الحالة.")} /></td></tr>}
    </tbody></table></div>
  </>;
}
