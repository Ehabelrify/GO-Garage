/**
 * Every table that points at a customer (or at a vehicle that belongs to one), and what a merge does with it.
 * These names are the ONLY identifiers ever interpolated into merge SQL; undo validates the names it reads back from
 * the move log against this list.
 */
export interface MoveSpec {
  key: string;
  table: string;
  /** Primary key columns, used to log and re-find each moved row. */
  pk: string[];
  customerCol?: string;
  vehicleCol?: string;
  labelEn: string;
  labelAr: string;
}

export const moveSpecs: readonly MoveSpec[] = [
  { key: "bookings", table: "bookings", pk: ["id"], customerCol: "customer_id", vehicleCol: "vehicle_id", labelEn: "Bookings", labelAr: "الحجوزات" },
  { key: "quotes", table: "quote_heads", pk: ["id"], customerCol: "customer_id", vehicleCol: "vehicle_id", labelEn: "Quotes", labelAr: "عروض الأسعار" },
  { key: "reservations", table: "promotion_reservations", pk: ["id"], customerCol: "beneficiary_id", vehicleCol: "vehicle_id", labelEn: "Reservations", labelAr: "الحجوزات المسبقة" },
  { key: "allocations", table: "promotion_allocations", pk: ["id"], customerCol: "beneficiary_id", vehicleCol: "vehicle_id", labelEn: "Promotion allocations", labelAr: "تخصيصات العروض" },
  { key: "memberships", table: "promotion_membership_verifications", pk: ["id"], customerCol: "beneficiary_id", labelEn: "Membership checks", labelAr: "التحقق من العضوية" },
  { key: "benefits", table: "benefit_entitlements", pk: ["id"], customerCol: "customer_id", vehicleCol: "vehicle_id", labelEn: "Benefits", labelAr: "المزايا" },
  { key: "transport", table: "transport_requests", pk: ["id"], customerCol: "customer_id", vehicleCol: "vehicle_id", labelEn: "Transport requests", labelAr: "طلبات النقل" },
  { key: "warranties", table: "warranties", pk: ["id"], customerCol: "customer_id", vehicleCol: "vehicle_id", labelEn: "Warranties and claims", labelAr: "الضمانات والمطالبات" },
  { key: "invoices", table: "invoices", pk: ["id"], customerCol: "customer_id", vehicleCol: "vehicle_id", labelEn: "Invoices", labelAr: "الفواتير" },
  { key: "special-requests", table: "special_requests", pk: ["id"], customerCol: "customer_id", vehicleCol: "vehicle_id", labelEn: "Special requests", labelAr: "الطلبات الخاصة" },
  { key: "conversations", table: "whatsapp_conversations", pk: ["id"], customerCol: "customer_id", vehicleCol: "vehicle_id", labelEn: "WhatsApp conversations", labelAr: "محادثات واتساب" },
  { key: "contact-links", table: "messaging_contact_links", pk: ["channel_id", "provider_contact_hash"], customerCol: "customer_id", vehicleCol: "vehicle_id", labelEn: "WhatsApp contact links", labelAr: "روابط جهات اتصال واتساب" },
  { key: "intake", table: "intake_requests", pk: ["actor_id", "idempotency_key"], customerCol: "customer_id", vehicleCol: "vehicle_id", labelEn: "Intake records", labelAr: "سجلات الاستقبال" },
];

/** The vehicles table itself: moved (customer_id) or merged away. */
export const vehicleSpec: MoveSpec = { key: "vehicles", table: "vehicles", pk: ["id"], customerCol: "customer_id", labelEn: "Vehicles", labelAr: "المركبات" };

/** Append-only history that is never rewritten: it stays on the archived customer and is reachable through the merge record. */
export const leftInPlace: readonly { key: string; table: string; col: string; labelEn: string; labelAr: string }[] = [
  { key: "quote-confirmations", table: "quote_customer_confirmations", col: "customer_id", labelEn: "Quote confirmation evidence", labelAr: "أدلة تأكيد عروض الأسعار" },
  { key: "qualifications", table: "promotion_qualifications", col: "beneficiary_id", labelEn: "Promotion qualification history", labelAr: "سجل تأهيل العروض" },
  { key: "money-events", table: "operational_money_events", col: "customer_id", labelEn: "Money events", labelAr: "الحركات المالية" },
  { key: "consent-history", table: "messaging_customer_consent_events", col: "customer_id", labelEn: "Consent history", labelAr: "سجل الموافقات" },
];

const allowed = new Map<string, MoveSpec>([...moveSpecs, vehicleSpec].map((spec) => [spec.table, spec]));
export const specForTable = (table: string): MoveSpec | undefined => allowed.get(table);
export const isColumnOf = (spec: MoveSpec, column: string) => column === spec.customerCol || column === spec.vehicleCol;
const SAFE = /^[a-z_]+$/;
export const isSafeIdentifier = (value: string) => SAFE.test(value);
