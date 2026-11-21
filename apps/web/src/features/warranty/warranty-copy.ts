import type { Locale } from "@garage/domain";
import { unknownWriteOutcomeCopy } from "../../shared/store";

type Pair = { en: string; ar: string };
const pick = (pair: Pair, lang: Locale) => (lang === "ar" ? pair.ar : pair.en);

const errors: Record<string, Pair> = {
  FORBIDDEN: { en: "Your role cannot do this.", ar: "دورك لا يسمح بهذا الإجراء." },
  ROLE_FORBIDDEN: { en: "Your role or branch access does not allow this.", ar: "دورك أو صلاحية فرعك لا تسمح بهذا الإجراء." },
  INVALID_WARRANTY_POLICY: { en: "The policy terms are incomplete or invalid.", ar: "شروط السياسة ناقصة أو غير صالحة." },
  INVALID_WARRANTY_SERVICE: { en: "A selected service is unavailable.", ar: "إحدى الخدمات المختارة غير متاحة." },
  AUTO_ISSUE_REQUIRES_DELIVERY_START: { en: "Automatic coverage must start on the delivery date.", ar: "التغطية التلقائية يجب أن تبدأ من تاريخ التسليم." },
  AUTO_WARRANTY_POLICY_CONFLICT: { en: "Another published automatic policy already covers a selected service.", ar: "توجد سياسة تلقائية منشورة تغطي إحدى الخدمات المختارة." },
  POLICY_VERSION_LOCKED: { en: "Published terms cannot change. Create a new version.", ar: "لا يمكن تعديل الشروط بعد نشرها. أنشئ إصداراً جديداً." },
  POLICY_NOT_ACTIVE: { en: "Only a published policy can issue coverage.", ar: "لا تصدر التغطية إلا من سياسة منشورة." },
  OWNER_APPROVAL_REQUIRED: { en: "The Owner must confirm the terms are approved.", ar: "يجب أن يؤكد المالك اعتماد الشروط." },
  JOB_NOT_DELIVERED: { en: "Coverage needs a delivered job.", ar: "التغطية تتطلب أمر شغل تم تسليمه." },
  SERVICE_NOT_ELIGIBLE: { en: "This service is not covered by the policy.", ar: "هذه الخدمة غير مشمولة بالسياسة." },
  DELIVERY_DATE_MISSING: { en: "The job has no recorded delivery date.", ar: "لا يوجد تاريخ تسليم مسجل لأمر الشغل." },
  START_DATE_REQUIRED: { en: "Enter a valid start date.", ar: "أدخل تاريخ بداية صحيحاً." },
  WARRANTY_ALREADY_ISSUED: { en: "Coverage already exists for this job and policy.", ar: "توجد تغطية لهذا الأمر والسياسة." },
  WARRANTY_NOT_ACTIVE: { en: "This warranty is no longer active.", ar: "هذا الضمان لم يعد ساري المفعول." },
  WARRANTY_VOID: { en: "A claim cannot be opened for a void warranty.", ar: "لا يمكن فتح مطالبة لضمان ملغى." },
  WARRANTY_EXPIRED: { en: "A claim cannot be opened after coverage expired.", ar: "لا يمكن فتح مطالبة بعد انتهاء مدة الضمان." },
  CLAIM_FINALIZED: { en: "Evidence cannot be added after the claim is finalized.", ar: "لا يمكن إضافة أدلة بعد إنهاء المطالبة." },
  CLAIM_STATUS_TRANSITION: { en: "Review a claim before a final decision; closed claims stay closed.", ar: "راجع المطالبة قبل القرار النهائي؛ المطالبة المغلقة لا تُفتح مجدداً." },
  CLAIM_RESOLUTION_REQUIRED: { en: "Write a resolution before a final decision.", ar: "اكتب نتيجة المراجعة قبل القرار النهائي." },
  INVALID_VERIFICATION_SETTINGS: { en: "Choose valid customer-facing fields.", ar: "اختر حقولاً صالحة للعرض على العميل." },
  VERIFICATION_FIELDS_REQUIRED: { en: "Approve Service and Coverage status before enabling.", ar: "اعتمد الخدمة وحالة التغطية قبل التفعيل." },
  VERIFICATION_DISABLED: { en: "The Owner must enable public verification first.", ar: "يجب أن يفعّل المالك التحقق العام أولاً." },
  VERIFICATION_TOKEN_NOT_FOUND: { en: "There is no active QR code to revoke.", ar: "لا يوجد رمز QR فعال لإلغائه." },
  WARRANTY_NOT_FOUND: { en: "This warranty is no longer available.", ar: "هذا الضمان لم يعد متاحاً." },
  INVALID_WARRANTY_CLAIM: { en: "Describe the issue and evidence (5+ characters each).", ar: "صف المشكلة والأدلة (٥ أحرف على الأقل لكل منهما)." },
  INVALID_INVOICE_DRAFT: { en: "Check the draft items, amounts and payment fields.", ar: "راجع بنود المسودة والمبالغ وبيانات الدفع." },
  INVOICE_DRAFT_NOT_FOUND: { en: "Create a draft invoice first.", ar: "أنشئ مسودة فاتورة أولاً." },
  REQUEST_FAILED: { en: "The request failed. Check your connection and try again.", ar: "فشل الطلب. تحقق من الاتصال وحاول مجدداً." },
};

const uploadErrors: Record<string, Pair> = {
  PRIVATE_STORAGE_UNAVAILABLE: { en: "Private file storage is not configured yet.", ar: "التخزين الخاص للملفات غير مهيأ بعد." },
  EVIDENCE_FILE_TOO_LARGE: { en: "Choose a file of 8 MB or less.", ar: "اختر ملفاً حجمه ٨ ميجابايت أو أقل." },
  UNSUPPORTED_EVIDENCE_FILE: { en: "Use a valid JPG, PNG, WebP or PDF file.", ar: "استخدم ملف JPG أو PNG أو WebP أو PDF صالحاً." },
  CLAIM_EVIDENCE_LIMIT: { en: "This claim already has 10 attachments.", ar: "بلغت المطالبة الحد الأقصى: ١٠ مرفقات." },
  ROLE_FORBIDDEN: { en: "Your account cannot access this claim.", ar: "حسابك لا يملك صلاحية هذه المطالبة." },
  EVIDENCE_STORAGE_FAILED: { en: "The file could not be stored. Try again later.", ar: "تعذر حفظ الملف. حاول لاحقاً." },
};

export const errorCopy = (code: string, lang: Locale): string =>
  unknownWriteOutcomeCopy(code, lang) ??
  (errors[code] ? pick(errors[code], lang)
    : pick({ en: "The request could not be saved. Check your access and the record, then retry.", ar: "تعذر حفظ الطلب. تحقق من صلاحيتك والسجل ثم حاول مجدداً." }, lang));

export const uploadErrorCopy = (code: string, lang: Locale): string =>
  unknownWriteOutcomeCopy(code, lang) ??
  (uploadErrors[code] ? pick(uploadErrors[code], lang) : pick({ en: "The attachment could not be saved.", ar: "تعذر حفظ المرفق." }, lang));

const audit: Record<string, Pair> = {
  "draft-created": { en: "Policy draft created", ar: "أُنشئت مسودة سياسة" },
  "draft-updated": { en: "Policy draft updated", ar: "حُدّثت مسودة السياسة" },
  "policy-published": { en: "Policy version published", ar: "نُشر إصدار السياسة" },
  "warranty-issued": { en: "Coverage issued", ar: "صدرت التغطية" },
  "warranty-voided": { en: "Warranty voided", ar: "أُلغي الضمان" },
  "verification-token-created": { en: "Customer QR code created", ar: "أُنشئ رمز QR للعميل" },
  "verification-token-revoked": { en: "Customer QR code revoked", ar: "أُلغي رمز QR للعميل" },
  "claim-opened": { en: "Claim opened", ar: "فُتحت المطالبة" },
  "claim-status-changed": { en: "Claim review updated", ar: "حُدّثت مراجعة المطالبة" },
  "claim-evidence-added": { en: "Claim evidence attached", ar: "أُضيف دليل للمطالبة" },
};
export const auditActionLabel = (action: string, lang: Locale) =>
  audit[action] ? pick(audit[action], lang) : action.replaceAll("-", " ");

const qr: Record<string, Pair> = {
  prepared: { en: "QR card prepared", ar: "جُهّز كارت QR" },
  printed: { en: "Printed", ar: "طُبع" },
  reprinted: { en: "Reprinted", ar: "أُعيدت الطباعة" },
  replaced: { en: "QR code replaced", ar: "استُبدل رمز QR" },
  revoked: { en: "QR code revoked", ar: "أُلغي رمز QR" },
};
export const qrActionLabel = (action: string, lang: Locale) => (qr[action] ? pick(qr[action], lang) : action);
