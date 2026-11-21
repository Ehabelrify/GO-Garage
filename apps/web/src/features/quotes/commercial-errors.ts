import type { Locale } from "@garage/domain";

const messages: Record<string, [string, string]> = {
  QUOTE_CONTEXT_NOT_FOUND: ["Choose a customer, vehicle and branch that belong together.", "اختر عميلاً ومركبة وفرعاً مرتبطين ببعضهم."],
  QUOTE_CONTEXT_CHANGED: ["Refresh the customer and vehicle choices, then try again.", "حدّث اختيارات العميل والمركبة ثم حاول مرة أخرى."],
  VEHICLE_SELECTION_STALE: ["The vehicle details changed. Reopen the form and try again.", "تغيرت بيانات المركبة. أعد فتح النموذج وحاول مرة أخرى."],
  UNKNOWN_SERVICE: ["Choose an active service for every work item.", "اختر خدمة نشطة لكل بند عمل."],
  INVALID_SCOPE: ["Match each price line and work item to a service.", "اربط كل بند سعر وبند عمل بخدمة."],
  POLICY_UNCONFIGURED: ["An approved pricing, tax or acceptance rule is missing. Ask the Owner to set it up in Settings.", "قاعدة التسعير أو الضريبة أو القبول المعتمدة غير متاحة. اطلب من المالك إعدادها من الإعدادات."],
  INVALID_AMOUNT: ["Check the amounts and make sure discounts do not exceed the price.", "راجع المبالغ وتأكد من أن الخصم لا يتجاوز السعر."],
  INVALID_QUOTE: ["Some quote fields are incomplete or invalid.", "بعض حقول العرض غير مكتملة أو غير صحيحة."],
  STALE_QUOTE_REVISION: ["This quote changed. Reload it before saving another revision.", "تغير العرض. أعد تحميله قبل حفظ مراجعة أخرى."],
  STALE_QUOTE_DIGEST: ["This quote changed. Reload and review it again.", "تغير العرض. أعد تحميله وراجعه مرة أخرى."],
  ROLE_FORBIDDEN: ["Your account does not have permission for this action.", "حسابك لا يملك صلاحية لهذا الإجراء."],
  PRICING_AUTHORITY_REQUIRED: ["Your role cannot record a custom price without an approved pricing rule.", "لا يملك دورك صلاحية تسجيل سعر مخصص دون قاعدة تسعير معتمدة."],
  CATALOGUE_SCOPE_STALE: ["The selected package is no longer current. Pick it again.", "الباقة المحددة لم تعد سارية. اخترها مرة أخرى."],
  CATALOGUE_PRICE_STALE: ["The quote amount no longer matches the approved catalogue price.", "قيمة العرض لا تطابق سعر الكتالوج المعتمد."],
  QUOTE_EXPIRED: ["This quote has expired. Revise it with a new valid-through date.", "انتهت صلاحية العرض. أنشئ مراجعة بتاريخ صلاحية جديد."],
  QUOTE_NOT_FOUND: ["Quote not found.", "لم يتم العثور على العرض."],
  ACCEPTANCE_EVIDENCE_REQUIRED: ["Add the protected proof reference to record acceptance.", "أضف مرجع الإثبات المحمي لتسجيل القبول."],
  IDEMPOTENCY_CONFLICT: ["This request was already sent with different details. Reload and try again.", "تم إرسال هذا الطلب سابقاً بتفاصيل مختلفة. أعد التحميل وحاول مرة أخرى."],
  WRITE_OUTCOME_UNKNOWN: ["We could not confirm the save. Reload the list and check before trying again.", "لم نتمكن من تأكيد الحفظ. أعد تحميل القائمة وتحقق قبل المحاولة مجدداً."],
  WARRANTY_TERMS_UNAVAILABLE: ["Choose an approved, published warranty version.", "اختر إصداراً معتمداً ومنشوراً من الضمان."],
  INVALID_RESERVATION: ["Choose the quote and promotion to reserve.", "اختر العرض والعرض الترويجي للحجز."],
  INVALID_EFFECTIVE_DATE: ["Choose a valid start date.", "اختر تاريخ بداية صحيحاً."],
  RESERVATION_NOT_FOUND: ["Reservation not found.", "لم يتم العثور على الحجز."],
  STALE_RESERVATION: ["This reservation changed. Reload it and try again.", "تغير الحجز. أعد تحميله وحاول مرة أخرى."],
  RESERVATION_EXPIRED: ["This reservation has expired.", "انتهت صلاحية الحجز."],
  RESERVATION_OUTSIDE_VALIDITY: ["That date is outside the reservation validity.", "هذا التاريخ خارج فترة صلاحية الحجز."],
  QUOTE_ALREADY_SCHEDULED: ["This quote already has an installation booking.", "لدى هذا العرض موعد تركيب بالفعل."],
  GROUP_SCHEDULING_REQUIRED: ["Schedule these vehicles together as a group.", "جدول هذه المركبات معاً كمجموعة."],
  GROUP_TIMING_MISMATCH: ["The group installations are too far apart for this promotion.", "مواعيد تركيب المجموعة متباعدة أكثر من المسموح لهذا العرض."],
  GROUP_SOURCE_MISMATCH: ["These reservations do not belong to the same qualification.", "هذه الحجوزات ليست من نفس إثبات الأهلية."],
  INVALID_GROUP: ["Choose at least two reservations from the same qualification.", "اختر حجزين على الأقل من نفس إثبات الأهلية."],
  PROMOTION_EXHAUSTED: ["This promotion has no units left.", "لا توجد وحدات متبقية لهذا العرض."],
  INVALID_DEPOSIT_REFERENCE: ["Enter a valid deposit reference and a reason.", "أدخل مرجع عربون صحيحاً وسبباً."],
  DEPOSIT_STATE_CHANGED: ["The deposit status changed. Reload and try again.", "تغيرت حالة العربون. أعد التحميل وحاول مرة أخرى."],
  CORRECTION_EVIDENCE_REQUIRED: ["Add a reason and a protected proof reference.", "أضف السبب ومرجع إثبات محمياً."],
  CORRECTION_UNAVAILABLE: ["That correction is not available for this reservation.", "هذا التصحيح غير متاح لهذا الحجز."],
  RESTORE_UNAVAILABLE: ["This reservation cannot be restored.", "لا يمكن استعادة هذا الحجز."],
  NOT_EXPIRED: ["The reservation has not reached its expiry date.", "لم يصل الحجز إلى تاريخ انتهائه."],
  BOOKING_CORRECTION_REQUIRED: ["Cancel the linked booking first.", "ألغِ الحجز المرتبط أولاً."],
  BOOKING_NOT_CANCELLABLE: ["The linked booking can no longer be cancelled.", "لم يعد بالإمكان إلغاء الحجز المرتبط."],
  CANCELLATION_REVIEW_REQUIRED: ["This cancellation needs a manager review.", "يحتاج هذا الإلغاء إلى مراجعة المدير."],
  EXPIRY_REVIEW_REQUIRED: ["This expiry needs a manager review.", "يحتاج هذا الانتهاء إلى مراجعة المدير."],
  INVALID_REDEMPTION: ["Enter a quantity and a fulfilment reference.", "أدخل الكمية ومرجع التنفيذ."],
  INVALID_DATE: ["Choose a valid date.", "اختر تاريخاً صحيحاً."],
  BENEFIT_NOT_FOUND: ["Benefit not found.", "لم يتم العثور على المنفعة."],
  BENEFIT_NOT_ELIGIBLE: ["This benefit is not available for that date or quantity.", "هذه المنفعة غير متاحة لهذا التاريخ أو الكمية."],
  STALE_ENTITLEMENT: ["This benefit changed. Check eligibility again.", "تغيرت المنفعة. افحص الأهلية مرة أخرى."],
  REVERSAL_EVIDENCE_REQUIRED: ["Add a reason and a protected proof reference.", "أضف السبب ومرجع إثبات محمياً."],
  REVERSAL_REVIEW_REQUIRED: ["This reversal needs a manager review.", "يحتاج هذا العكس إلى مراجعة المدير."],
  ALREADY_REVERSED: ["This use was already reversed.", "تم عكس هذا الاستخدام بالفعل."],
  REDEMPTION_NOT_FOUND: ["Benefit use not found.", "لم يتم العثور على استخدام المنفعة."],
  BENEFIT_BRANCH_UNCONFIGURED: ["This benefit is not set up for that branch.", "هذه المنفعة غير مهيأة لهذا الفرع."],
  INVALID_PROMOTION: ["Choose a promotion and check the details.", "اختر عرضاً ترويجياً وراجع التفاصيل."],
  INVALID_QUALIFICATION: ["Check the promotion details.", "راجع تفاصيل العرض الترويجي."],
  INVALID_VERIFICATION: ["Check the membership verification details.", "راجع تفاصيل التحقق من العضوية."],
  VERIFIER_FORBIDDEN: ["Only a configured verifier role can record this.", "يمكن لدور التحقق المعتمد فقط تسجيل ذلك."],
  OVERRIDE_FORBIDDEN: ["Only a configured authority can correct this.", "يمكن للجهة المعتمدة فقط تصحيح ذلك."],
  VERIFICATION_EXPIRED: ["The membership verification has expired.", "انتهت صلاحية التحقق من العضوية."],
  VERIFICATION_REVOKED: ["The membership verification was revoked.", "تم إلغاء التحقق من العضوية."],
  VERIFICATION_NOT_FOUND: ["Membership verification not found.", "لم يتم العثور على التحقق من العضوية."],
  QUALIFICATION_NOT_FOUND: ["Qualification not found. Check it again.", "لم يتم العثور على إثبات الأهلية. افحصه مرة أخرى."],
  QUALIFICATION_REVIEW_REQUIRED: ["This qualification needs a manager review.", "يحتاج إثبات الأهلية إلى مراجعة المدير."],
  QUALIFICATION_CHANGED: ["The qualification changed. Check it again.", "تغير إثبات الأهلية. افحصه مرة أخرى."],
  STACKING_FORBIDDEN: ["This promotion cannot be combined with another one.", "لا يمكن الجمع بين هذا العرض وعرض آخر."],
  DISCOUNT_MISMATCH: ["The quote discount does not match the promotion.", "خصم العرض لا يطابق العرض الترويجي."],
  EVIDENCE_USED: ["This evidence was already used.", "تم استخدام هذا الدليل سابقاً."],
  ALLOCATION_NOT_FOUND: ["Allocation not found.", "لم يتم العثور على التخصيص."],
  ALLOCATION_ALREADY_FINAL: ["This allocation can no longer be changed.", "لم يعد بالإمكان تغيير هذا التخصيص."],
  ACCEPTED_QUOTE_NOT_FOUND: ["Accept the quote first.", "اقبل العرض أولاً."],
  ACCEPTED_QUOTE_MISMATCH: ["The accepted quote does not match.", "العرض المقبول لا يطابق."],
  REQUEST_FAILED: ["The request could not be completed. Try again.", "تعذر إكمال الطلب. حاول مرة أخرى."],
};

export function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) return String((error as { code: unknown }).code);
  return "";
}

/** Friendly bilingual message for any commercial API failure. Never shows raw JSON or stack text. */
export function commercialError(error: unknown, lang: Locale): string {
  const code = errorCode(error);
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const hit = messages[code] ?? Object.entries(messages).find(([key]) => raw.includes(key))?.[1];
  if (hit) return lang === "ar" ? hit[1] : hit[0];
  if (raw && !raw.startsWith("{") && !raw.startsWith("[") && !raw.includes("[object") && raw.length < 180 && lang === "en") return raw;
  return lang === "ar" ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Try again.";
}
