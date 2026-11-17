import { useEffect, useState } from "react";
import type { GradeVersion, PackageVersion } from "@garage/domain";

export function CataloguePage({ lang }: { lang: "ar" | "en" }) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const [versions, setVersions] = useState<PackageVersion[]>([]);
  const [grades, setGrades] = useState<GradeVersion[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: { ar: string; en: string } }>>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categoryEn, setCategoryEn] = useState("");
  const [categoryAr, setCategoryAr] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleCategoryId, setVehicleCategoryId] = useState("");
  const [gradeDraft, setGradeDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const read = async () => { const [response, gradeResponse, categoryResponse] = await Promise.all([fetch("/api/catalogue/versions"),fetch("/api/catalogue/grades"),fetch("/api/catalogue/categories")]); if (!response.ok || !gradeResponse.ok || !categoryResponse.ok) throw new Error("Catalogue unavailable."); setVersions(await response.json() as PackageVersion[]); setGrades(await gradeResponse.json() as GradeVersion[]); setCategories(await categoryResponse.json() as typeof categories); };
  useEffect(() => { void read().catch((error) => setMessage(String(error))); }, []);
  async function post(path: string, body: object) {
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/catalogue/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json() as { message?: string }; if (!response.ok) throw new Error(result.message ?? "Request failed."); await read(); setMessage(t("Saved. Review the version history.", "تم الحفظ. راجع سجل الإصدارات.")); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  const latest = new Map<string, PackageVersion>();
  for (const version of versions) if (!latest.has(version.ref.id)) latest.set(version.ref.id, version);
  const latestGrade = new Map<string, GradeVersion>();
  for (const grade of grades) if (!latestGrade.has(grade.ref.id)) latestGrade.set(grade.ref.id, grade);
  return <div dir={lang === "ar" ? "rtl" : "ltr"}>
    <h1>{t("Catalogue and packages", "الكتالوج والباقات")}</h1>
    <p>{t("Historical versions remain readable. No price is inferred from service display labels.", "تظل الإصدارات السابقة متاحة للقراءة. لا يُستنتج السعر من وصف الخدمة.")}</p>
    {versions.map((p) => <section className="panel section-gap" key={`${p.ref.id}:${p.ref.version}`}>
      <h2>{p.name[lang]} · {p.ref.id} · v{p.ref.version}</h2>
      <p>{p.state} · {p.kind} · {p.branchIds.join(", ")}</p>
      <p>{t("Vehicle categories", "فئات المركبة")}: {p.vehicleCategoryIds.join(", ") || t("Review required", "تحتاج مراجعة")}</p>
      <p>{t("Models", "الطرازات")}: {p.vehicleModels.join(", ") || t("All configured categories", "كل الفئات المحددة")}</p>
      <p>{t("Price", "السعر")}: {p.price.state === "approved" ? `${p.price.value.minor} ${p.price.value.currency} (${t("minor units", "وحدات صغرى")})` : t("Unavailable — approval missing", "غير متاح — الموافقة ناقصة")}</p>
      <p>{t("Tax", "الضريبة")}: {p.tax.state === "approved" ? (p.tax.value.amount ? `${p.tax.value.amount.minor} ${p.tax.value.amount.currency}` : t("Rule approved; amount pending", "القاعدة معتمدة؛ المبلغ معلق")) : t("Unavailable", "غير متاحة")}</p>
      <h3>{t("Exact included scope", "النطاق المشمول بالتحديد")}</h3>
      <ol>{p.scope.map((s) => <li key={s.id}>{s.serviceId} · {s.areas.join(", ")} · {t("Roof", "السقف")}: {s.roof} · {t("Add-ons", "الإضافات")}: {s.addOnIds.join(", ") || "—"} · {t("Excluded", "المستثنى")}: {s.exclusions.join(", ") || "—"}</li>)}</ol>
      <p>{t("Work components", "مكونات العمل")}: {p.work.map((w) => `${w.id} (${w.scopeItemIds.join(", ")})`).join("; ")}</p>
      <p>{t("Work aggregation", "تجميع العمل")}: {p.workAggregation.state === "approved" ? p.workAggregation.value.mode : t("Review required", "تحتاج مراجعة")}</p>
      {p.state === "draft" && <button className="btn" disabled={busy} onClick={() => setDraft(JSON.stringify({ ...p, ref: { id: p.ref.id, version: p.ref.version + 1 }, revision: p.revision + 1, approval: null }, null, 2))}>{t("Edit as new draft", "تحرير كمسودة جديدة")}</button>}
      {p.state === "draft" && latest.get(p.ref.id)?.ref.version === p.ref.version && <button className="btn" disabled={busy} onClick={() => void post("publications", { packageId: p.ref.id, expectedRevision: p.revision, evidenceRef, reason })}>{t("Publish approved draft", "نشر المسودة المعتمدة")}</button>}
      {p.state === "published" && latest.get(p.ref.id)?.ref.version === p.ref.version && <button className="btn" disabled={busy || !reason.trim()} onClick={() => void post("retirements", { packageId: p.ref.id, expectedVersion: p.ref.version, expectedRevision: p.revision, reason })}>{t("Retire package", "إيقاف الباقة")}</button>}
    </section>)}
    <section className="panel section-gap"><h2>{t("Package draft", "مسودة الباقة")}</h2>
      <p>{t("Enter the complete structured snapshot. Missing price must remain unconfigured.", "أدخل نسخة منظمة كاملة. يجب أن يظل السعر الناقص غير مهيأ.")}</p>
      <textarea className="field-input" rows={18} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t("Package JSON", "بيانات الباقة")} />
      <button className="btn" disabled={busy} onClick={() => { try { const value = JSON.parse(draft) as PackageVersion; const prior = latest.get(value.ref.id); void post("drafts", { package: value, expectedRevision: prior?.revision ?? 0 }); } catch { setMessage(t("Enter valid JSON.", "أدخل بيانات صحيحة.")); } }}>{t("Save new immutable draft", "حفظ مسودة جديدة ثابتة")}</button>
      <label>{t("Protected approval evidence", "مرجع الموافقة المحمي")}<input className="field-input" value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} placeholder="private:..." /></label>
      <label>{t("Approval reason", "سبب الموافقة")}<input className="field-input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </section>{message && <p role="status">{message}</p>}
    <section className="panel section-gap"><h2>{t("Grades", "الدرجات")}</h2>
      {grades.map((g) => <div key={`${g.ref.id}:${g.ref.version}`}><strong>{g.name[lang]} · {g.ref.id} v{g.ref.version}</strong> · {g.state} · {g.thicknessMicrometres === null ? t("Thickness unconfigured", "السُمك غير محدد") : `${g.thicknessMicrometres} μm`}
        {g.state === "draft" && latestGrade.get(g.ref.id)?.ref.version === g.ref.version && <button className="btn" disabled={busy} onClick={() => void post("grades/publications", { gradeId: g.ref.id, expectedRevision: g.revision, evidenceRef, reason })}>{t("Publish grade", "نشر الدرجة")}</button>}
        {g.state === "published" && latestGrade.get(g.ref.id)?.ref.version === g.ref.version && <button className="btn" disabled={busy || !reason.trim()} onClick={() => void post("grades/retirements", { gradeId: g.ref.id, expectedVersion: g.ref.version, expectedRevision: g.revision, reason })}>{t("Retire grade", "إيقاف الدرجة")}</button>}
      </div>)}
      <textarea className="field-input" rows={8} value={gradeDraft} onChange={(e) => setGradeDraft(e.target.value)} aria-label={t("Grade JSON", "بيانات الدرجة")} />
      <button className="btn" disabled={busy} onClick={() => { try { const value = JSON.parse(gradeDraft) as GradeVersion; void post("grades/drafts", { grade: value, expectedRevision: latestGrade.get(value.ref.id)?.revision ?? 0 }); } catch { setMessage(t("Enter valid JSON.", "أدخل بيانات صحيحة.")); } }}>{t("Save grade draft", "حفظ مسودة الدرجة")}</button>
    </section>
    <section className="panel section-gap"><h2>{t("Vehicle categories", "فئات المركبات")}</h2>
      <p>{t("Assign a category to a vehicle only after review. Historical vehicles remain unclassified.", "حدد فئة المركبة بعد المراجعة فقط. تظل المركبات السابقة بلا تصنيف.")}</p>
      {categories.map((c) => <p key={c.id}>{c.id} · {c.name[lang]}</p>)}
      <input className="field-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder={t("Category ID", "معرف الفئة")} />
      <input className="field-input" value={categoryEn} onChange={(e) => setCategoryEn(e.target.value)} placeholder="English name" />
      <input className="field-input" value={categoryAr} onChange={(e) => setCategoryAr(e.target.value)} placeholder="الاسم بالعربية" />
      <button className="btn" disabled={busy} onClick={() => void post("categories", { id: categoryId, name: { en: categoryEn, ar: categoryAr } })}>{t("Add category", "إضافة فئة")}</button>
      <h3>{t("Classify a reviewed vehicle", "تصنيف مركبة تمت مراجعتها")}</h3>
      <input className="field-input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} placeholder={t("Vehicle ID", "معرف المركبة")} />
      <select className="field-input" value={vehicleCategoryId} onChange={(e) => setVehicleCategoryId(e.target.value)}><option value="">{t("Choose category", "اختر الفئة")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name[lang]}</option>)}</select>
      <button className="btn" disabled={busy || !vehicleId || !vehicleCategoryId} onClick={() => void post("vehicle-classifications", { vehicleId, categoryId: vehicleCategoryId })}>{t("Save vehicle category", "حفظ فئة المركبة")}</button>
    </section>
  </div>;
}
