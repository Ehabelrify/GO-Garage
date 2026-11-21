import type { Customer, Locale } from "@garage/domain";
import type { StatusDomain } from "../../shared/components/StatusBadge";
import type { RecordType } from "../../shared/record-types";
import { formatMoney } from "../../shared/format";

/** Pure rules for the Customers module: list filter, plate match, 360 parsing/description, timeline, form validation. */

export const sectionKeys = [
  "quotes", "jobs", "customRequests", "bookings", "conversations", "warranties",
  "claims", "invoices", "reservations", "benefits", "transport", "purchases",
] as const;
export type SectionKey = (typeof sectionKeys)[number];

export const normalisePlate = (value: string) => value.replace(/[\s-]/g, "").toUpperCase();
export const digitsOf = (value: string) => value.replace(/\D/g, "");

/** Search by name, phone digits, plate (spaces/dashes ignored) or make/model. */
export function filterCustomers(customers: Customer[], query: string): Customer[] {
  const text = query.trim().toLowerCase();
  if (!text) return customers;
  const plate = normalisePlate(text);
  const digits = digitsOf(text);
  return customers.filter((customer) =>
    customer.name.toLowerCase().includes(text)
    || (digits.length >= 3 && digitsOf(customer.phone).includes(digits))
    || customer.vehicles.some((vehicle) =>
      (plate.length >= 2 && normalisePlate(vehicle.plate).includes(plate)) || vehicle.makeModel.toLowerCase().includes(text)));
}

export function findByPlate(customers: Customer[], plate: string): { customer: Customer; vehicle: Customer["vehicles"][number] } | null {
  const wanted = normalisePlate(plate);
  if (wanted.length < 2) return null;
  for (const customer of customers) {
    const vehicle = customer.vehicles.find((item) => normalisePlate(item.plate) === wanted);
    if (vehicle) return { customer, vehicle };
  }
  return null;
}

export type CustomerFormFields = { name: string; phone: string; plate: string; makeModel: string };
export type CustomerFormErrors = Partial<Record<keyof CustomerFormFields, "required" | "phone">>;

export function validateCustomerForm(form: CustomerFormFields, options: { vehicle?: boolean } = {}): CustomerFormErrors {
  const needVehicle = options.vehicle ?? true;
  const errors: CustomerFormErrors = {};
  if (!form.name.trim()) errors.name = "required";
  const digits = digitsOf(form.phone);
  if (!form.phone.trim()) errors.phone = "required";
  else if (digits.length < 8 || digits.length > 15) errors.phone = "phone";
  if (needVehicle && form.plate.trim().length < 2) errors.plate = "required";
  if (needVehicle && form.makeModel.trim().length < 2) errors.makeModel = "required";
  return errors;
}

/** Branch preselected in the add form: the current branch when specific, else the first branch the actor may use. */
export function defaultFormBranch(allowed: string[], current: string): string {
  if (current !== "all" && allowed.includes(current)) return current;
  return allowed[0] ?? "";
}

// ---------- 360 payload ----------

export interface RawSection { count: number; items: Array<Record<string, unknown>>; restricted: boolean; unavailable: boolean }
export interface VehicleFact { id: string; plate: string; make: string; model: string; year: number | null; color?: string }
export interface Parsed360 {
  kind: "customer" | "vehicle";
  customer: { id: string; name: string; phone: string | null; language?: string; archived: boolean; consent?: string } | null;
  vehicle: VehicleFact | null;
  vehicles: VehicleFact[];
  vehiclesCount: number;
  sections: Record<SectionKey, RawSection>;
}

const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : undefined);
const obj = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);

function parseVehicle(raw: unknown): VehicleFact | null {
  const v = obj(raw);
  const id = str(v?.id);
  const plate = str(v?.plate);
  if (!v || !id || !plate) return null;
  return { id, plate, make: str(v.make) ?? "", model: str(v.model) ?? "", year: typeof v.year === "number" ? v.year : null, color: str(v.color) };
}

export function parseSection(raw: unknown): RawSection {
  const s = obj(raw);
  const items = Array.isArray(s?.items) ? (s.items as unknown[]).map(obj).filter((item): item is Record<string, unknown> => item !== null && !!str(item.id)) : [];
  const count = typeof s?.count === "number" && s.count >= items.length ? s.count : items.length;
  return { count, items, restricted: s?.restricted === true, unavailable: s?.unavailable === true };
}

export function parse360(json: unknown): Parsed360 | null {
  const root = obj(json);
  if (!root) return null;
  const vehicleRoot = obj(root.vehicle);
  const customerRoot = obj(root.customer);
  if (!customerRoot && !vehicleRoot) return null;
  const kind: "customer" | "vehicle" = vehicleRoot && str(vehicleRoot.plate) ? "vehicle" : "customer";
  const consentRaw = customerRoot?.consent;
  const customerId = str(customerRoot?.id);
  const customer = customerRoot && customerId
    ? {
        id: customerId, name: str(customerRoot.name) ?? "", phone: str(customerRoot.phone) ?? null, language: str(customerRoot.language),
        archived: customerRoot.archived === true, consent: str(obj(consentRaw)?.status) ?? str(consentRaw),
      }
    : null;
  const vehiclesRoot = obj(root.vehicles);
  const vehicles = Array.isArray(vehiclesRoot?.items) ? (vehiclesRoot.items as unknown[]).map(parseVehicle).filter((v): v is VehicleFact => v !== null) : [];
  const sections = {} as Record<SectionKey, RawSection>;
  for (const key of sectionKeys) sections[key] = key in root ? parseSection(root[key]) : { count: 0, items: [], restricted: false, unavailable: true };
  return {
    kind, customer, vehicle: parseVehicle(vehicleRoot), vehicles,
    vehiclesCount: typeof vehiclesRoot?.count === "number" ? vehiclesRoot.count : vehicles.length, sections,
  };
}

// ---------- describing items ----------

export interface SectionRow {
  type: RecordType | null;
  id: string;
  label: string;
  subtitle?: string;
  status?: string;
  domain?: StatusDomain;
  date?: string | null;
  /** Money shown at the end of the row (rendered with the Money component, honouring its own currency). */
  amount?: { minor: number; currency: string } | null;
  /** Source records of a derived row (purchases): booking, job, warranty, invoice. */
  links?: Array<{ type: RecordType; id: string }>;
}
export interface DescribeEnv {
  lang: Locale;
  serviceName: (serviceId: string) => string | undefined;
  plateOf: (vehicleId: string) => string | undefined;
  bookingServiceId: (bookingId: string) => string | undefined;
}

export function shortDate(value: string | null | undefined, lang: Locale): string | undefined {
  if (!value) return undefined;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.valueOf())) return undefined;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

/** A quote total may be minor units or { minor, currency } / { amount: { minor } }. */
export function quoteTotal(raw: unknown): { minor: number; currency: string } | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return { minor: raw, currency: "EGP" };
  const o = obj(raw);
  if (!o) return null;
  const inner = obj(o.amount) ?? o;
  const minor = inner.minor;
  return typeof minor === "number" && Number.isFinite(minor) ? { minor, currency: str(inner.currency) ?? "EGP" } : null;
}

const join = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(" · ") || undefined;
const humanise = (value: string | undefined) => (value ? value.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase()) : undefined);

export function describeItem(section: SectionKey, raw: Record<string, unknown>, env: DescribeEnv): SectionRow | null {
  const id = str(raw.id);
  if (!id) return null;
  const lang = env.lang;
  const ar = lang === "ar";
  const vehicleId = str(raw.vehicleId);
  const plate = vehicleId ? env.plateOf(vehicleId) : undefined;
  switch (section) {
    case "bookings": {
      const serviceId = str(raw.serviceId);
      const service = serviceId ? env.serviceName(serviceId) : undefined;
      const date = str(raw.dropoffDate);
      return { type: "booking", id, label: service ?? (ar ? "حجز" : "Booking"), subtitle: join(plate, shortDate(date, lang)), status: str(raw.status), domain: "booking", date };
    }
    case "jobs": {
      const bookingId = str(raw.bookingId);
      const serviceId = bookingId ? env.bookingServiceId(bookingId) : undefined;
      const service = serviceId ? env.serviceName(serviceId) : undefined;
      const date = str(raw.updatedAt);
      return { type: "job", id, label: service ?? (ar ? "أمر شغل" : "Job"), subtitle: shortDate(date, lang), status: str(raw.stage), domain: "job", date };
    }
    case "quotes": {
      const total = quoteTotal(raw.total);
      const revision = typeof raw.revision === "number" ? raw.revision : undefined;
      return {
        type: "quote", id, label: ar ? `عرض سعر${revision ? ` (${revision})` : ""}` : `Quote${revision ? ` (rev ${revision})` : ""}`,
        subtitle: join(plate, total ? formatMoney(total.minor, total.currency, lang) : undefined), status: str(raw.state), domain: "quote", date: null,
      };
    }
    case "reservations": {
      const date = str(raw.effectiveOn);
      const expires = shortDate(str(raw.expiresOn), lang);
      return { type: "reservation", id, label: ar ? "حجز مؤجل" : "Reservation", subtitle: join(plate, expires ? (ar ? `حتى ${expires}` : `until ${expires}`) : undefined), status: str(raw.status), domain: "reservation", date };
    }
    case "benefits":
      return { type: null, id, label: ar ? "ميزة" : "Benefit", subtitle: plate, status: str(raw.status), domain: "benefit", date: null };
    case "transport":
      return { type: null, id, label: ar ? "نقل" : "Transport", subtitle: join(humanise(str(raw.direction)), humanise(str(raw.mode)), plate), status: str(raw.status), domain: "transport", date: null };
    case "warranties": {
      const date = str(raw.startDate);
      const until = shortDate(str(raw.expiresOn), lang);
      const lifetime = raw.coverageKind === "lifetime" ? (ar ? "مدى الحياة" : "Lifetime") : undefined;
      return { type: "warranty", id, label: ar ? "ضمان" : "Warranty", subtitle: join(plate, until ? (ar ? `حتى ${until}` : `until ${until}`) : lifetime), status: str(raw.status), domain: "warranty", date };
    }
    case "claims":
      return { type: "claim", id, label: str(raw.summary) ?? (ar ? "مطالبة" : "Claim"), status: str(raw.status), domain: "claim", date: null };
    case "invoices":
      return { type: "invoice", id, label: ar ? "مسودة فاتورة" : "Invoice draft", status: str(raw.status), domain: "invoice", date: null };
    case "conversations": {
      const unreadCount = typeof raw.unreadCount === "number" ? raw.unreadCount : 0;
      const unread = unreadCount > 0 ? (ar ? `${unreadCount} غير مقروءة` : `${unreadCount} unread`) : undefined;
      const date = str(raw.updatedAt);
      return { type: "conversation", id, label: ar ? "محادثة" : "Chat", subtitle: join(unread, shortDate(date, lang)), date };
    }
    case "purchases": {
      const date = str(raw.purchasedOn);
      const label = (ar ? str(raw.labelAr) ?? str(raw.labelEn) : str(raw.labelEn) ?? str(raw.labelAr)) ?? (ar ? "عملية شراء" : "Purchase");
      const quantity = typeof raw.quantity === "number" && raw.quantity > 1 ? `× ${raw.quantity}` : undefined;
      const quoteId = str(raw.quoteId);
      const jobId = str(raw.jobId);
      const links: Array<{ type: RecordType; id: string }> = [];
      const bookingId = str(raw.bookingId);
      if (bookingId) links.push({ type: "booking", id: bookingId });
      if (jobId && quoteId) links.push({ type: "job", id: jobId });
      for (const [key, type] of [["warrantyId", "warranty"], ["invoiceId", "invoice"]] as const) { const value = str(raw[key]); if (value) links.push({ type, id: value }); }
      return {
        type: quoteId ? "quote" : jobId ? "job" : null, id: quoteId ?? jobId ?? id, label,
        subtitle: join(quantity, plate, shortDate(date, lang)), status: str(raw.status), domain: "purchase", date,
        amount: quoteTotal(raw.amount), links,
      };
    }
    case "customRequests": {
      const date = str(raw.createdAt) ?? str(raw.requestedFrom);
      const price = quoteTotal(raw.quotedPrice);
      return {
        type: "special-request", id, label: str(raw.title) ?? (ar ? "طلب خاص" : "Special request"), subtitle: join(plate, shortDate(str(raw.requestedFrom), lang)),
        status: str(raw.status), domain: "request", date, amount: price,
      };
    }
    default:
      return null;
  }
}

export interface TimelineEntry extends SectionRow { section: SectionKey }

/** Dated entries newest first; undated ones returned separately so nothing is hidden. */
export function buildTimeline(entries: TimelineEntry[]): { dated: TimelineEntry[]; undated: TimelineEntry[] } {
  const stamp = (entry: TimelineEntry) => (entry.date ? Date.parse(entry.date) : Number.NaN);
  const dated = entries.filter((entry) => !Number.isNaN(stamp(entry))).sort((a, b) => stamp(b) - stamp(a));
  const undated = entries.filter((entry) => Number.isNaN(stamp(entry)));
  return { dated, undated };
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Which URL params open a record. Accepts the shared defaults (customer/vehicle) and the server routes (customerId/vehicleId). */
export function recordFromParams(params: URLSearchParams): { kind: "customer" | "vehicle"; id: string } | null {
  const customer = params.get("customer") ?? params.get("customerId");
  if (customer) return { kind: "customer", id: customer };
  const vehicle = params.get("vehicle") ?? params.get("vehicleId");
  return vehicle ? { kind: "vehicle", id: vehicle } : null;
}

export function vehicleLabel(vehicle: { make: string; model: string; year: number | null }): string {
  return [vehicle.make, vehicle.model, vehicle.year ?? ""].filter(Boolean).join(" ");
}
