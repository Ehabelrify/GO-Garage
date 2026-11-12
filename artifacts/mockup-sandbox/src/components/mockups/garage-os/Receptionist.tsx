import "./_group.css";
import "./Receptionist.css";
import { useState, type FormEvent } from "react";
import {
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  MessageCircle,
  Search,
  ShieldCheck,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";
import { AppLayout, Hold, PageHeading, Stage, useGarageLang } from "./_shared/AppLayout";

type BookingStatus = "مؤكد" | "بانتظار التأكيد" | "تم الاستلام";
type Booking = {
  id: number;
  customer: string;
  vehicle: string;
  plate: string;
  service: string;
  time: string;
  status: BookingStatus;
};
type Customer = { name: string; phone: string; vehicle: string; plate: string; lastVisit: string };

const initialBookings: Booking[] = [
  { id: 1, customer: "مروان السيد", vehicle: "Toyota Corolla 2022", plate: "س ن ج ٤٨٢١", service: "تظليل نوافذ", time: "١٠:٠٠", status: "مؤكد" },
  { id: 2, customer: "هبة مجدي", vehicle: "Mercedes C200 2020", plate: "ع ص م ٨٤٤٠", service: "فحص أولي", time: "١١:٠٠", status: "بانتظار التأكيد" },
  { id: 3, customer: "كريم عادل", vehicle: "Kia Sportage 2021", plate: "د ط ب ٣٠٦٥", service: "طلاء سيراميك", time: "١٢:٣٠", status: "مؤكد" },
  { id: 4, customer: "سلمى فؤاد", vehicle: "Hyundai Tucson 2023", plate: "ر م ك ١٢٩٧", service: "حماية طلاء", time: "١٤:٠٠", status: "تم الاستلام" },
];
const branchCustomers: Customer[] = [
  { name: "مروان السيد", phone: "010 •••• 4821", vehicle: "Toyota Corolla 2022", plate: "س ن ج ٤٨٢١", lastVisit: "١٢ نوفمبر" },
  { name: "هبة مجدي", phone: "011 •••• 8440", vehicle: "Mercedes C200 2020", plate: "ع ص م ٨٤٤٠", lastVisit: "١٠ نوفمبر" },
  { name: "كريم عادل", phone: "012 •••• 3065", vehicle: "Kia Sportage 2021", plate: "د ط ب ٣٠٦٥", lastVisit: "٠٨ نوفمبر" },
  { name: "سلمى فؤاد", phone: "010 •••• 1297", vehicle: "Hyundai Tucson 2023", plate: "ر م ك ١٢٩٧", lastVisit: "٠٤ نوفمبر" },
];

export function Receptionist() {
  const [rows, setRows] = useState(initialBookings);
  const [bookingSearch, setBookingSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const ar = useGarageLang() === "ar";

  const addBooking = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const record: Booking = {
      id: Date.now(),
      customer: String(data.get("customer")),
      vehicle: String(data.get("vehicle")),
      plate: String(data.get("plate")),
      service: String(data.get("service")),
      time: String(data.get("time")),
      status: "بانتظار التأكيد",
    };
    setRows((current) => [record, ...current]);
    setShowForm(false);
    setNotice(ar ? "تم تسجيل الطلب للمراجعة قبل التأكيد." : "Request saved for review before confirmation.");
    form.reset();
  };

  const updateBooking = (id: number) => {
    setRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      return { ...row, status: row.status === "بانتظار التأكيد" ? "مؤكد" : "تم الاستلام" };
    }));
    setNotice(ar ? "تم تحديث حالة الحجز لهذا الفرع." : "Booking status updated for this branch.");
  };

  const filteredBookings = rows.filter((row) =>
    `${row.customer} ${row.vehicle} ${row.plate} ${row.service}`.toLowerCase().includes(bookingSearch.toLowerCase()),
  );
  const filteredCustomers = branchCustomers.filter((customer) =>
    `${customer.name} ${customer.phone} ${customer.vehicle} ${customer.plate}`.toLowerCase().includes(customerSearch.toLowerCase()),
  );
  const pendingCount = rows.filter((row) => row.status === "بانتظار التأكيد").length;
  const arrivedCount = rows.filter((row) => row.status === "تم الاستلام").length;

  return (
    <AppLayout page="Receptionist" branch={ar ? "الفرع أ" : "Branch A"}>
      <div className="receptionist-scope receptionist-page">
        <PageHeading
          eyebrow={ar ? "الاستقبال · الفرع أ" : "RECEPTION · BRANCH A"}
          title={ar ? "استقبال اليوم" : "Today’s reception"}
          subtitle={ar
            ? "الحجوزات وسجل العملاء الخاص بفرعك. الصلاحيات هنا لا تشمل إعدادات المالك أو إدارة المستخدمين."
            : "Bookings and customer records for your branch. Owner settings and staff administration stay outside this role."}
          extra={<span className="go-context"><ShieldCheck size={14} />{ar ? "موظف استقبال · الفرع أ" : "Receptionist · Branch A"}</span>}
        />

        <div className="receptionist-access-note">
          <ShieldCheck size={16} />
          <div>
            <strong>{ar ? "مساحة استقبال محدودة بالفرع" : "Branch-scoped receptionist access"}</strong>
            <p>{ar
              ? "يمكنك البحث في عملاء الفرع ومتابعة الحجوزات. إعدادات التشغيل وإدارة صلاحيات الفريق لا تظهر لهذا الحساب."
              : "Search this branch’s customers and manage bookings. Operating settings and team access are not available to this account."}</p>
          </div>
        </div>

        <div className="receptionist-summary">
          <Stat label={ar ? "حجوزات اليوم" : "Today’s bookings"} value={String(rows.length)} foot={ar ? "الفرع أ · جميع الخدمات" : "Branch A · all services"} />
          <Stat label={ar ? "بانتظار المراجعة" : "Awaiting review"} value={String(pendingCount)} foot={ar ? "تأكيد الاستقبال قبل الموعد" : "Confirm before arrival"} />
          <Stat label={ar ? "تم استلامها" : "Checked in"} value={String(arrivedCount)} foot={ar ? "تسليم واضح للورشة" : "Ready for workshop handoff"} />
        </div>

        <section className="go-panel receptionist-channel-hold">
          <div className="go-panel-title">
            <div>
              <h2><MessageCircle size={15} />{ar ? "صندوق واتساب المشترك" : "Shared WhatsApp inbox"}</h2>
              <p>{ar ? "قنوات الفرعين غير متصلة. لن تظهر رسائل أو تُرسل ردود من هذا النظام حالياً." : "The branch lines are not connected. No messages appear here and nothing can be sent from Garage OS yet."}</p>
            </div>
            <span className="go-hold-label">{ar ? "قيد التجهيز" : "ON HOLD"}</span>
          </div>
          <div className="receptionist-status-strip">
            <span><strong>{ar ? "حالة القنوات" : "Line status"}:</strong> {ar ? "غير متصلة" : "Not connected"}</span>
            <span>{ar ? "تفعيل الربط قبل استقبال الرسائل" : "Connect approved business lines before receiving messages"}</span>
          </div>
        </section>

        {showForm && (
          <section className="go-panel">
            <div className="go-panel-title">
              <div>
                <h2>{ar ? "طلب حجز جديد" : "New booking request"}</h2>
                <p>{ar ? "طلب مراجعة لهذا الفرع فقط." : "A request for review at this branch."}</p>
              </div>
              <button type="button" className="go-button" aria-label={ar ? "إغلاق النموذج" : "Close form"} onClick={() => setShowForm(false)}><X size={15} /></button>
            </div>
            <form className="go-grid go-columns" onSubmit={addBooking}>
              <Field name="customer" label={ar ? "اسم العميل" : "Customer name"} required />
              <Field name="vehicle" label={ar ? "الماركة والطراز والسنة" : "Make, model and year"} required />
              <Field name="plate" label={ar ? "رقم اللوحة" : "Plate number"} required />
              <div className="go-field">
                <label htmlFor="new-service">{ar ? "الخدمة" : "Service"}</label>
                <select id="new-service" name="service">
                  <option>{ar ? "فحص أولي" : "Initial inspection"}</option>
                  <option>{ar ? "تظليل نوافذ" : "Window tint"}</option>
                  <option>{ar ? "طلاء سيراميك" : "Ceramic coating"}</option>
                  <option>{ar ? "حماية PPF" : "PPF protection"}</option>
                </select>
              </div>
              <div className="go-field">
                <label htmlFor="new-time">{ar ? "وقت الوصول" : "Arrival time"}</label>
                <input id="new-time" name="time" type="time" required />
              </div>
              <div className="go-toolbar">
                <button type="submit" className="go-button primary"><CalendarDays size={14} />{ar ? "حفظ الطلب" : "Save request"}</button>
                <button type="button" className="go-button" onClick={() => setShowForm(false)}>{ar ? "إلغاء" : "Cancel"}</button>
              </div>
            </form>
          </section>
        )}

        <div className="receptionist-content">
          <div className="receptionist-stack">
            <section className="go-panel">
              <div className="go-panel-title">
                <div>
                  <h2>{ar ? "الحجوزات والاستلام" : "Bookings & vehicle intake"}</h2>
                  <p>{ar ? "متابعة الطلبات ومركبات الفرع خلال اليوم." : "Review requests and today’s vehicle arrivals for this branch."}</p>
                </div>
                <div className="receptionist-panel-actions">
                  <button className="go-button primary" type="button" onClick={() => setShowForm((current) => !current)}><UserRoundPlus size={14} />{ar ? "طلب حجز" : "New booking"}</button>
                </div>
              </div>
              <div className="go-toolbar">
                <label className="receptionist-search">
                  <Search size={15} />
                  <span className="sr-only">{ar ? "البحث في الحجوزات" : "Search bookings"}</span>
                  <input value={bookingSearch} onChange={(event) => setBookingSearch(event.target.value)} placeholder={ar ? "ابحث بالعميل أو اللوحة أو الخدمة" : "Search customer, plate or service"} />
                </label>
                <span className="go-context">{filteredBookings.length} {ar ? "مواعيد" : "appointments"}</span>
              </div>
              <div className="go-table-wrap">
                <table className="go-table">
                  <thead><tr>
                    <th>{ar ? "العميل والمركبة" : "Customer & vehicle"}</th>
                    <th>{ar ? "الخدمة" : "Service"}</th>
                    <th>{ar ? "الوصول" : "Arrival"}</th>
                    <th>{ar ? "الحالة" : "Status"}</th>
                    <th>{ar ? "الإجراء" : "Action"}</th>
                  </tr></thead>
                  <tbody>
                    {filteredBookings.map((row) => (
                      <tr key={row.id}>
                        <td><div className="go-primary-cell">{row.customer}</div><div className="go-secondary-cell go-ltr-data">{row.vehicle} · <strong>{row.plate}</strong></div></td>
                        <td>{row.service}</td>
                        <td className="go-mono">{row.time}</td>
                        <td><Stage tone={row.status === "مؤكد" ? "ok" : row.status === "تم الاستلام" ? "info" : "warn"}>{ar ? row.status : row.status === "مؤكد" ? "Confirmed" : row.status === "تم الاستلام" ? "Checked in" : "Awaiting review"}</Stage></td>
                        <td>{row.status !== "تم الاستلام"
                          ? <button className="receptionist-row-action" type="button" onClick={() => updateBooking(row.id)}>{row.status === "بانتظار التأكيد" ? ar ? "تأكيد الحجز" : "Confirm" : ar ? "تسجيل الاستلام" : "Check in"}</button>
                          : <span className="go-context">{ar ? "تم التسليم للورشة" : "Handed to workshop"}</span>}</td>
                      </tr>
                    ))}
                    {!filteredBookings.length && <tr><td colSpan={5}><div className="go-empty"><strong>{ar ? "لا توجد حجوزات مطابقة" : "No matching bookings"}</strong>{ar ? "جرّب البحث باسم أو لوحة أخرى." : "Try another customer or plate."}</div></td></tr>}
                  </tbody>
                </table>
              </div>
              {notice && <div className="go-form-notice" role="status">{notice}</div>}
            </section>

            <section className="go-panel">
              <div className="go-panel-title">
                <div><h2>{ar ? "سجل عملاء الفرع" : "Branch customer records"}</h2><p>{ar ? "بحث في بيانات العملاء والمركبات التي يسمح لك فرعك بالوصول إليها." : "Search customer and vehicle records available to your branch."}</p></div>
                <span className="go-context"><Users size={14} />{ar ? "نطاق الفرع" : "Branch scope"}</span>
              </div>
              <div className="go-toolbar">
                <label className="receptionist-search">
                  <Search size={15} />
                  <span className="sr-only">{ar ? "البحث في العملاء" : "Search customers"}</span>
                  <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder={ar ? "ابحث بالاسم أو المركبة أو اللوحة" : "Search name, vehicle or plate"} />
                </label>
                <span className="go-context">{filteredCustomers.length} {ar ? "عملاء" : "customers"}</span>
              </div>
              <div className="go-table-wrap">
                <table className="go-table receptionist-customer-table">
                  <thead><tr>
                    <th>{ar ? "العميل" : "Customer"}</th>
                    <th>{ar ? "المركبة" : "Vehicle"}</th>
                    <th>{ar ? "آخر زيارة" : "Last visit"}</th>
                    <th>{ar ? "السجل" : "Record"}</th>
                  </tr></thead>
                  <tbody>
                    {filteredCustomers.map((customer) => (
                      <tr key={customer.plate}>
                        <td><div className="go-primary-cell">{customer.name}</div><div className="go-secondary-cell go-mono">{customer.phone}</div></td>
                        <td><div>{customer.vehicle}</div><div className="go-secondary-cell go-ltr-data">{customer.plate}</div></td>
                        <td>{customer.lastVisit}</td>
                        <td><span className="receptionist-flow-label">{ar ? "عميل محفوظ" : "Saved customer"}</span></td>
                      </tr>
                    ))}
                    {!filteredCustomers.length && <tr><td colSpan={4}><div className="go-empty"><strong>{ar ? "لم يتم العثور على العميل" : "Customer not found"}</strong>{ar ? "يمكن إنشاء سجل جديد من نموذج الحجز." : "Create a new record from the booking form."}</div></td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="receptionist-small-note">{ar ? "رقم الهاتف مخفي جزئياً في هذه النظرة لتقليل عرض البيانات غير الضرورية." : "Phone numbers are partially masked in this summary to reduce unnecessary exposure."}</p>
            </section>
          </div>

          <div className="receptionist-stack">
            <section className="go-panel">
              <div className="go-panel-title"><div><h2>{ar ? "تسليم الورشة" : "Workshop handoff"}</h2><p>{ar ? "انتقال واضح من الاستقبال إلى فريق العمل." : "A clear move from reception into workshop work."}</p></div><CheckCheck size={17} color="var(--garage-green)" /></div>
              <div className="go-handoff">
                {(ar
                  ? ["تمت مطابقة رقم اللوحة مع العميل", "تمت مراجعة الخدمة وموعد الاستلام", "تم تسجيل وقت وصول المركبة"]
                  : ["Vehicle plate matched with the customer", "Service and arrival time reviewed", "Vehicle arrival time recorded"]
                ).map((item, index) => <div className="go-handoff-row" key={item}>
                  <span className="go-handoff-mark"><Check size={14} /></span>
                  <div className="go-handoff-copy">{item}</div>
                  <span className="go-hold-label">{String(index + 1).padStart(2, "0")}</span>
                </div>)}
              </div>
              <div className="receptionist-status-strip"><span><strong>{ar ? "الفرع" : "Branch"}:</strong> {ar ? "أ" : "A"}</span><span>{ar ? "الصلاحيات محفوظة على مستوى الحساب" : "Access enforced per account"}</span></div>
            </section>

            <Hold
              title={ar ? "صور الاستلام" : "Intake photos"}
              detail={ar ? "متطلبات الصور غير مفعّلة بعد. لن تُطلب صور أو تُحفظ في النظام حالياً." : "Photo requirements are not active. No intake images are requested or stored yet."}
            />
            <div className="receptionist-status-strip">
              <span><Clock3 size={14} /><strong>{ar ? "مزامنة البيانات" : "Data access"}</strong></span>
              <span>{ar ? "حسب الفرع والصلاحية" : "By branch and account role"}</span>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, foot }: { label: string; value: string; foot: string }) {
  return <div className="go-stat">
    <div className="go-stat-top"><span>{label}</span><CalendarDays size={15} /></div>
    <div><div className="go-stat-value">{value}</div><div className="go-stat-foot">{foot}</div></div>
  </div>;
}

function Field({ name, label, required = false }: { name: string; label: string; required?: boolean }) {
  return <div className="go-field"><label htmlFor={name}>{label}</label><input id={name} name={name} required={required} /></div>;
}
