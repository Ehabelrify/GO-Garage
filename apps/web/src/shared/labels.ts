import type { JobStage } from "@garage/domain";

/** Job stage labels. Arabic follows DESIGN_SYSTEM section 7 (one register, MSA). */
export const stageNames: Record<JobStage, { en: string; ar: string }> = {
  booked: { en: "Booked", ar: "محجوزة" },
  received: { en: "Received at branch", ar: "تم الاستلام" },
  "in-service": { en: "In service", ar: "تحت التنفيذ" },
  qc: { en: "Quality check", ar: "فحص الجودة" },
  ready: { en: "Ready", ar: "جاهزة" },
  delivered: { en: "Delivered to customer", ar: "تم التسليم" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
  "no-show": { en: "No-show", ar: "لم يحضر" },
};
