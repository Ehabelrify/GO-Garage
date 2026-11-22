import type { AuditKind } from "./audit-sources";

export type AuditLang = "en" | "ar";

export const kindLabels: Record<AuditKind, { en: string; ar: string }> = {
  settings: { en: "Settings", ar: "الإعدادات" },
  policy: { en: "Policies", ar: "السياسات" },
  catalogue: { en: "Catalogue", ar: "الكتالوج" },
  quote: { en: "Quotes", ar: "عروض الأسعار" },
  warranty: { en: "Warranties", ar: "الضمانات" },
  whatsapp: { en: "WhatsApp", ar: "واتساب" },
  job: { en: "Jobs", ar: "أوامر الشغل" },
  "owner-record": { en: "Archive and delete", ar: "الأرشفة والحذف" },
  availability: { en: "Capacity", ar: "السعة" },
  invoice: { en: "Invoices", ar: "الفواتير" },
  "special-request": { en: "Special requests", ar: "الطلبات الخاصة" },
  benefit: { en: "Benefits", ar: "المنافع" },
  transport: { en: "Transport", ar: "النقل" },
  reservation: { en: "Reservations", ar: "الحجوزات المؤجلة" },
  "customer-merge": { en: "Customer merges", ar: "دمج العملاء" },
  money: { en: "Money", ar: "الحركات المالية" },
  consent: { en: "Messaging consent", ar: "موافقة المراسلة" },
  "staff-access": { en: "Staff access", ar: "صلاحيات الفريق" },
  customer: { en: "Customers", ar: "العملاء" },
  reminder: { en: "Reminder rules", ar: "قواعد التذكير" },
};

/** Known action names. Anything else falls back to a readable form of the stored word. */
const actionLabels: Record<string, { en: string; ar: string }> = {
  "setting-changed": { en: "Setting changed", ar: "تغيير إعداد" },
  proposed: { en: "Proposed", ar: "اقتراح" },
  approved: { en: "Approved", ar: "اعتماد" },
  activated: { en: "Activated", ar: "تفعيل" },
  "draft-saved": { en: "Draft saved", ar: "حفظ مسودة" },
  "draft-created": { en: "Draft created", ar: "إنشاء مسودة" },
  "draft-updated": { en: "Draft updated", ar: "تعديل مسودة" },
  published: { en: "Published", ar: "نشر" },
  retired: { en: "Retired", ar: "إيقاف" },
  offered: { en: "Offered", ar: "تم العرض" },
  accepted: { en: "Accepted", ar: "تم القبول" },
  "acceptance-recorded": { en: "Acceptance recorded", ar: "تسجيل قبول" },
  archived: { en: "Archived", ar: "أرشفة" },
  restored: { en: "Restored", ar: "استعادة" },
  deleted: { en: "Deleted", ar: "حذف" },
  "approved-and-activated": { en: "Capacity approved", ar: "اعتماد السعة" },
  "warranty-issued": { en: "Warranty issued", ar: "إصدار ضمان" },
  "warranty-auto-issued": { en: "Warranty issued automatically", ar: "إصدار ضمان تلقائي" },
  "warranty-voided": { en: "Warranty voided", ar: "إلغاء ضمان" },
  "claim-opened": { en: "Claim opened", ar: "فتح مطالبة" },
  "claim-status-changed": { en: "Claim status changed", ar: "تغيير حالة مطالبة" },
  "policy-published": { en: "Warranty policy published", ar: "نشر سياسة ضمان" },
  "job-opened": { en: "Job opened", ar: "فتح أمر شغل" },
  "job-updated": { en: "Job updated", ar: "تعديل أمر شغل" },
  "stage-received": { en: "Car received", ar: "استلام السيارة" },
  "stage-in-service": { en: "Work started", ar: "بدء الشغل" },
  "stage-qc": { en: "Quality check", ar: "فحص الجودة" },
  "stage-ready": { en: "Marked ready", ar: "جاهزة للتسليم" },
  "stage-delivered": { en: "Delivered", ar: "تم التسليم" },
  "stage-cancelled": { en: "Cancelled", ar: "إلغاء" },
  "stage-no-show": { en: "No-show", ar: "لم يحضر" },
  generated: { en: "Generated", ar: "إنشاء" },
  created: { en: "Created", ar: "إنشاء" },
  edited: { en: "Edited", ar: "تعديل" },
  "vehicle-added": { en: "Vehicle added", ar: "إضافة مركبة" },
  issued: { en: "Issued", ar: "إصدار" },
  "payment-recorded": { en: "Payment recorded", ar: "تسجيل دفعة" },
  voided: { en: "Voided", ar: "إلغاء" },
  declined: { en: "Declined", ar: "رفض" },
  closed: { en: "Closed", ar: "إغلاق" },
  "review-started": { en: "Review started", ar: "بدء المراجعة" },
  "customers-merged": { en: "Customers merged", ar: "دمج عميلين" },
  "merge-undone": { en: "Merge undone", ar: "التراجع عن الدمج" },
  "collection-recorded": { en: "Collection recorded", ar: "تسجيل تحصيل" },
  "refund-recorded": { en: "Refund recorded", ar: "تسجيل استرداد" },
  "money-reversed": { en: "Money entry reversed", ar: "عكس حركة مالية" },
  "consent-granted": { en: "Consent granted", ar: "منح موافقة" },
  "consent-revoked": { en: "Consent withdrawn", ar: "سحب موافقة" },
  "inbox-granted": { en: "Inbox access granted", ar: "منح صلاحية صندوق الوارد" },
  "inbox-revoked": { en: "Inbox access removed", ar: "إزالة صلاحية صندوق الوارد" },
  "conversation-assigned": { en: "Conversation assigned", ar: "إسناد محادثة" },
  "contact-linked": { en: "Contact linked to customer", ar: "ربط جهة اتصال بعميل" },
  "invited": { en: "Staff invited", ar: "دعوة عضو فريق" },
  "invitation-cancelled": { en: "Invitation cancelled", ar: "إلغاء دعوة" },
  "claimed-invitation": { en: "Invitation claimed", ar: "قبول دعوة" },
  "permissions-changed": { en: "Permissions changed", ar: "تغيير الصلاحيات" },
  "access-removed": { en: "Access removed", ar: "إزالة الصلاحية" },
  "rule-updated": { en: "Rule updated", ar: "تعديل قاعدة" },
  "conversation-created": { en: "Conversation opened", ar: "فتح محادثة" },
};

export function humanizeAction(value: string): string {
  const text = value.replace(/[-_]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export function actionLabel(action: string, lang: AuditLang): string {
  const known = actionLabels[action];
  if (known) return known[lang];
  if (action.startsWith("status-")) return humanizeAction(action.slice(7));
  return humanizeAction(action);
}

export function kindLabel(kind: string, lang: AuditLang): string {
  return (kindLabels as Record<string, { en: string; ar: string }>)[kind]?.[lang] ?? humanizeAction(kind);
}

export const entityTypeLabels: Record<string, { en: string; ar: string }> = {
  setting: { en: "Setting", ar: "إعداد" }, "commercial-policy": { en: "Policy", ar: "سياسة" },
  "catalogue-package": { en: "Package", ar: "باقة" }, "catalogue-grade": { en: "Grade", ar: "درجة" },
  quote: { en: "Quote", ar: "عرض سعر" }, claim: { en: "Claim", ar: "مطالبة" }, warranty: { en: "Warranty", ar: "ضمان" },
  "warranty-policy": { en: "Warranty policy", ar: "سياسة ضمان" }, conversation: { en: "Conversation", ar: "محادثة" },
  job: { en: "Job", ar: "أمر شغل" }, branch: { en: "Branch", ar: "فرع" }, invoice: { en: "Invoice", ar: "فاتورة" },
  "special-request": { en: "Special request", ar: "طلب خاص" }, benefit: { en: "Benefit", ar: "منفعة" },
  transport: { en: "Transport", ar: "نقل" }, reservation: { en: "Reservation", ar: "حجز مؤجل" },
  customer: { en: "Customer", ar: "عميل" }, "reminder-rule": { en: "Reminder rule", ar: "قاعدة تذكير" }, "money-event": { en: "Money entry", ar: "حركة مالية" }, staff: { en: "Staff member", ar: "عضو فريق" },
};

export function entityTypeLabel(type: string, lang: AuditLang): string {
  return entityTypeLabels[type]?.[lang] ?? humanizeAction(type);
}
