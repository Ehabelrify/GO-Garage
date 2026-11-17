import { useEffect, useState } from "react";
import { benefitApi, type BenefitDetailData } from "../../shared/store";

export function BenefitDetail({ id, lang, onChanged }: { id: string; lang: "ar" | "en"; onChanged: () => void }) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const [detail, setDetail] = useState<BenefitDetailData | null>(null);
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [fulfillmentRef, setFulfillmentRef] = useState("");
  const [eligibility, setEligibility] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const next = await benefitApi.detail(id);
    setDetail(next);
    setBranchId((current) => current || next.entitlement.branchIds[0] || "");
    onChanged();
  }
  useEffect(() => { void refresh().catch((error) => setMessage(error instanceof Error ? error.message : String(error))); }, [id]);
  async function evaluate() {
    try {
      const result = await benefitApi.evaluate({ entitlementId: id, on, branchId });
      setEligibility(result.state === "eligible" ? t("Eligible under the accepted policy.", "مؤهل وفق السياسة المقبولة.") : `${result.state}: ${result.reasons.join(", ")}`);
    } catch (error) { setEligibility(error instanceof Error ? error.message : String(error)); }
  }
  async function redeem() {
    if (!detail) return;
    try {
      const result = await benefitApi.redeem({ entitlementId: id, quantity, on, branchId, fulfillmentRef, expectedRevision: detail.entitlement.revision, idempotencyKey: crypto.randomUUID() });
      await refresh();
      setMessage(`${t("Redemption recorded. Remaining", "تم تسجيل الاستفادة. المتبقي")}: ${result.remaining ?? t("policy evaluated", "يحدد بالسياسة")}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }
  async function reverse(redemptionId: string) {
    try {
      await benefitApi.reverse({ redemptionId, reason, evidenceRef, idempotencyKey: crypto.randomUUID() });
      await refresh();
      setMessage(t("Reversal recorded without deleting fulfillment history.", "تم تسجيل العكس دون حذف سجل التنفيذ."));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }
  const item = detail?.entitlement;
  return <section className="panel section-gap" dir={lang === "ar" ? "rtl" : "ltr"}>
    <h2>{t("Benefit detail", "تفاصيل المنفعة")}</h2>
    {item && <>
      <p><strong>{item.benefit.id}</strong> · {t("version", "الإصدار")} {item.benefit.version} · {item.status}</p>
      <p>{t("Accepted source quote", "عرض السعر المقبول المصدر")}: {item.sourceQuote.quoteId} / {item.sourceQuote.revision}</p>
      <p>{t("Customer / vehicle", "العميل / المركبة")}: {item.customerId} / {item.vehicleId}</p>
      <p>{t("Activation", "التفعيل")}: {detail.promise.activationTrigger} · {t("Responsible team", "الفريق المسؤول")}: {item.responsibleTeamId ?? "—"}</p>
      <p>{t("Transfer / cancellation / expiry", "النقل / الإلغاء / الانتهاء")}: {detail.promise.transferRule} / {detail.promise.cancellationRule} / {JSON.stringify(detail.promise.expiryRule)}</p>
      <p>{detail.promise.eligibilityRule[lang]}</p>
      <p>{t("Approved limit", "الحد المعتمد")}: {item.limit.state === "approved" ? JSON.stringify(item.limit.value) : `${item.limit.state}: ${item.limit.missing.join(", ")}`}</p>
      <h3>{t("Evaluate and fulfill", "التقييم والتنفيذ")}</h3>
      <label>{t("Date", "التاريخ")}<input type="date" value={on} onChange={(event) => setOn(event.target.value)} /></label>
      <label>{t("Branch", "الفرع")}<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{item.branchIds.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select></label>
      <label>{t("Quantity", "الكمية")}<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
      <label>{t("Fulfillment reference", "مرجع التنفيذ")}<input value={fulfillmentRef} onChange={(event) => setFulfillmentRef(event.target.value)} /></label>
      <button className="btn" type="button" onClick={() => void evaluate()}>{t("Check eligibility", "فحص الأهلية")}</button>
      <button className="btn btn-primary" type="button" disabled={item.status !== "active"} onClick={() => void redeem()}>{t("Record fulfillment", "تسجيل التنفيذ")}</button>
      {eligibility && <p role="status">{eligibility}</p>}
      <h3>{t("Immutable fulfillment history", "سجل التنفيذ غير القابل للحذف")}</h3>
      <label>{t("Reversal reason", "سبب العكس")}<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <label>{t("Protected evidence reference", "مرجع الدليل المحمي")}<input placeholder="private:benefits/..." value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} /></label>
      <ul>{detail.history.map((entry) => <li key={entry.id}>{entry.on_date} · {entry.quantity} · {entry.branch_id} · {entry.fulfillment_ref} · {entry.reversed ? t("reversed", "معكوس") : <button className="btn" type="button" onClick={() => void reverse(entry.id)}>{t("Reverse", "عكس")}</button>}</li>)}</ul>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
