export const recordTypes = ["customer", "vehicle", "booking", "job", "quote", "reservation", "warranty", "claim", "invoice", "conversation", "benefit", "transport", "catalogue-package", "special-request"] as const;
export type RecordType = (typeof recordTypes)[number];

export const recordTypeLabels: Record<RecordType, { en: string; ar: string; pluralEn: string; pluralAr: string }> = {
  customer: { en: "Customer", ar: "عميل", pluralEn: "Customers", pluralAr: "العملاء" },
  vehicle: { en: "Vehicle", ar: "مركبة", pluralEn: "Vehicles", pluralAr: "المركبات" },
  booking: { en: "Booking", ar: "حجز", pluralEn: "Bookings", pluralAr: "الحجوزات" },
  job: { en: "Job", ar: "أمر شغل", pluralEn: "Jobs", pluralAr: "أوامر الشغل" },
  quote: { en: "Quote", ar: "عرض سعر", pluralEn: "Quotes", pluralAr: "عروض الأسعار" },
  reservation: { en: "Reservation", ar: "حجز مؤجل", pluralEn: "Reservations", pluralAr: "الحجوزات المؤجلة" },
  warranty: { en: "Warranty", ar: "ضمان", pluralEn: "Warranties", pluralAr: "الضمانات" },
  claim: { en: "Claim", ar: "مطالبة", pluralEn: "Claims", pluralAr: "المطالبات" },
  invoice: { en: "Invoice", ar: "فاتورة", pluralEn: "Invoices", pluralAr: "الفواتير" },
  conversation: { en: "Conversation", ar: "محادثة", pluralEn: "Conversations", pluralAr: "المحادثات" },
  benefit: { en: "Benefit", ar: "منفعة", pluralEn: "Benefits", pluralAr: "المنافع" },
  transport: { en: "Transport", ar: "نقل", pluralEn: "Transport requests", pluralAr: "طلبات النقل" },
  "catalogue-package": { en: "Package", ar: "باقة", pluralEn: "Packages", pluralAr: "الباقات" },
  "special-request": { en: "Special request", ar: "طلب خاص", pluralEn: "Special requests", pluralAr: "الطلبات الخاصة" },
};

export function isRecordType(value: unknown): value is RecordType {
  return typeof value === "string" && (recordTypes as readonly string[]).includes(value);
}

/** Default full-page routes. Features may override through the record registry. */
export const defaultRecordRoutes: Record<RecordType, (id: string) => string> = {
  customer: (id) => `/workspace/customers?customer=${encodeURIComponent(id)}`,
  vehicle: (id) => `/workspace/customers?vehicle=${encodeURIComponent(id)}`,
  booking: (id) => `/workspace/bookings?record=${encodeURIComponent(id)}`,
  job: (id) => `/workspace/workshop?record=${encodeURIComponent(id)}`,
  quote: (id) => `/workspace/quotes?record=${encodeURIComponent(id)}`,
  reservation: (id) => `/workspace/quotes?tab=reservations&record=${encodeURIComponent(id)}`,
  warranty: (id) => `/workspace/warranties?record=${encodeURIComponent(id)}`,
  claim: (id) => `/workspace/warranties?tab=claims&record=${encodeURIComponent(id)}`,
  invoice: (id) => `/workspace/warranties?tab=invoices&record=${encodeURIComponent(id)}`,
  conversation: (id) => `/workspace/whatsapp?record=${encodeURIComponent(id)}`,
  benefit: (id) => `/workspace/quotes?tab=benefits&record=${encodeURIComponent(id)}`,
  transport: (id) => `/workspace/bookings?tab=transport&record=${encodeURIComponent(id)}`,
  "catalogue-package": (id) => `/workspace/catalogue?record=${encodeURIComponent(id)}`,
  "special-request": (id) => `/workspace/customers?tab=requests&record=${encodeURIComponent(id)}`,
};
