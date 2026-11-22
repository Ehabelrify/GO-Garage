import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@garage/domain";
import { Camera, Check, Flag } from "lucide-react";
import { Collapsible, DateText, EmptyState, Field, Notice, Skeleton } from "../../shared/components";
import {
  issueKindLabels, phaseLabels, photoKindLabels, techApi,
  type IssueKind, type PhotoKind, type TechChecklistItem, type TechExtras,
} from "./tech-api";

interface Props {
  jobId: string;
  lang: Locale;
  t: (en: string, ar: string) => string;
  closed: boolean;
  isDemo: boolean;
  isManager: boolean;
  notify: (message: string) => void;
  /** Called after anything that changes issue counts so the page badge can refresh. */
  onIssuesChanged: () => void;
  /** Reloads when this changes (stage moved elsewhere). */
  stage: string;
}

const demoCopy = (t: Props["t"]) => t("Not available in a demo session.", "غير متاح في جلسة العرض التجريبي.");

function errorCopy(code: string | undefined, t: Props["t"]) {
  switch (code) {
    case "DEMO_ACTION_DISABLED": return demoCopy(t);
    case "PRIVATE_STORAGE_UNAVAILABLE": return t("Photo storage is not configured.", "تخزين الصور غير مُفعّل.");
    case "PHOTO_TOO_LARGE": return t("The photo is larger than 8 MB.", "الصورة أكبر من 8 ميجابايت.");
    case "UNSUPPORTED_PHOTO": return t("Use a JPG, PNG or WebP photo.", "استخدم صورة JPG أو PNG أو WebP.");
    case "PHOTO_LIMIT": return t("This job has reached the photo limit.", "وصل أمر الشغل للحد الأقصى من الصور.");
    case "JOB_CLOSED": return t("This job is closed.", "أمر الشغل مغلق.");
    case "ROLE_FORBIDDEN": return t("Not allowed for this job.", "غير مسموح لهذا الأمر.");
    case "NETWORK": return t("No connection. Try again.", "لا يوجد اتصال. حاول مرة أخرى.");
    default: return t("Could not save. Try again.", "تعذر الحفظ. حاول مرة أخرى.");
  }
}

export function JobExtras({ jobId, lang, t, closed, isDemo, isManager, notify, onIssuesChanged, stage }: Props) {
  const [extras, setExtras] = useState<TechExtras | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [noteText, setNoteText] = useState("");
  const [photoKind, setPhotoKind] = useState<PhotoKind>("before");
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueKind, setIssueKind] = useState<IssueKind>("damage-found");
  const [issueNote, setIssueNote] = useState("");
  const [issueFile, setIssueFile] = useState<File | null>(null);
  const [resolveText, setResolveText] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const issueFileRef = useRef<HTMLInputElement>(null);
  const writable = !closed && !isDemo;

  const load = useCallback(async () => {
    const result = await techApi.extras(jobId);
    if (result.ok && result.data) { setExtras(result.data); setFailed(false); } else setFailed(true);
  }, [jobId]);

  useEffect(() => { setExtras(null); setFailed(false); void load(); }, [load, stage]);

  const run = async (key: string, action: () => Promise<{ ok: boolean; code?: string }>, success?: string) => {
    if (busy) return false;
    setBusy(key);
    const result = await action();
    setBusy("");
    if (!result.ok) { notify(errorCopy(result.code, t)); return false; }
    if (success) notify(success);
    await load();
    return true;
  };

  const toggle = (item: TechChecklistItem) => run(`c:${item.id}`, () => techApi.toggle(jobId, item.id, !item.done));

  const addNote = async () => {
    const body = noteText.trim();
    if (!body) return;
    if (await run("note", () => techApi.addNote(jobId, body), t("Note added.", "تمت إضافة الملاحظة."))) setNoteText("");
  };

  const onPhoto = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    await run("photo", () => techApi.uploadPhoto(jobId, photoKind, file), t("Photo added.", "تمت إضافة الصورة."));
  };

  const submitIssue = async () => {
    const note = issueNote.trim();
    if (!note || busy) return;
    setBusy("issue");
    let photoId: string | undefined;
    if (issueFile && extras?.storage.available) {
      const up = await techApi.uploadPhoto(jobId, "damage", issueFile);
      if (!up.ok) { setBusy(""); notify(errorCopy(up.code, t)); return; }
      photoId = up.data?.photoId;
    }
    const result = await techApi.reportIssue(jobId, { kind: issueKind, note, photoId });
    setBusy("");
    if (!result.ok) { notify(errorCopy(result.code, t)); return; }
    notify(t("Issue sent to the manager.", "تم إرسال المشكلة للمدير."));
    setIssueOpen(false); setIssueNote(""); setIssueFile(null);
    if (issueFileRef.current) issueFileRef.current.value = "";
    onIssuesChanged();
    await load();
  };

  const resolve = async (issueId: string) => {
    if (await run(`r:${issueId}`, () => techApi.resolveIssue(jobId, issueId, resolveText[issueId]?.trim() || undefined), t("Issue resolved.", "تم حل المشكلة."))) onIssuesChanged();
  };

  if (failed) return <Notice tone="warning">{t("Could not load notes, checklist and photos.", "تعذر تحميل الملاحظات وقائمة التحقق والصور.")} <button type="button" className="btn btn-sm" onClick={() => void load()}>{t("Retry", "إعادة المحاولة")}</button></Notice>;
  if (!extras) return <Skeleton rows={3} label={t("Loading", "جارٍ التحميل")} />;

  const { checklist, checklistSummary: sum, notes, photos, issues, storage } = extras;
  const openIssues = issues.filter((i) => i.status === "open");
  const phases = Object.keys(phaseLabels).filter((p) => checklist.some((c) => c.phase === p));
  const label = (item: TechChecklistItem) => lang === "ar" ? item.labelAr : item.labelEn;

  return <div className="ws-extras">
    {writable && <button type="button" className="btn btn-lg ws-report-btn" onClick={() => setIssueOpen((v) => !v)} aria-expanded={issueOpen}><Flag size={18} aria-hidden="true" /> {t("Report an issue", "الإبلاغ عن مشكلة")}</button>}
    {isDemo && <Notice tone="info">{demoCopy(t)}</Notice>}

    {issueOpen && writable && <section className="ws-issue-form" aria-label={t("Report an issue", "الإبلاغ عن مشكلة")}>
      <div className="ws-chip-row" role="radiogroup" aria-label={t("Issue type", "نوع المشكلة")}>
        {(Object.keys(issueKindLabels) as IssueKind[]).map((k) => <button key={k} type="button" role="radio" aria-checked={issueKind === k} className={`ws-chip${issueKind === k ? " on" : ""}`} onClick={() => setIssueKind(k)}>{issueKindLabels[k][lang]}</button>)}
      </div>
      <Field label={t("What happened?", "ماذا حدث؟")} required>
        <textarea className="field-textarea" value={issueNote} maxLength={2000} onChange={(e) => setIssueNote(e.target.value)} />
      </Field>
      {storage.available
        ? <label className="btn ws-file-btn"><Camera size={18} aria-hidden="true" /> {issueFile ? issueFile.name : t("Add a photo (optional)", "إضافة صورة (اختياري)")}
          <input ref={issueFileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="ws-file-input" onChange={(e) => setIssueFile(e.target.files?.[0] ?? null)} /></label>
        : <p className="ws-reason">{t("Photo storage is not configured. You can still send the issue.", "تخزين الصور غير مُفعّل. يمكنك إرسال المشكلة بدونها.")}</p>}
      <div className="ws-actions">
        <button type="button" className="btn btn-primary btn-lg ws-big-action" disabled={!issueNote.trim() || Boolean(busy)} onClick={() => void submitIssue()}>{busy === "issue" ? t("Sending…", "جارٍ الإرسال…") : t("Send to manager", "إرسال للمدير")}</button>
        <button type="button" className="btn btn-lg" onClick={() => setIssueOpen(false)}>{t("Cancel", "إلغاء")}</button>
      </div>
    </section>}

    <Collapsible title={t("Checklist", "قائمة التحقق")} count={sum.total || undefined} defaultOpen>
      {!checklist.length ? <p className="ws-reason">{t("No checklist for this job.", "لا توجد قائمة تحقق لهذا الأمر.")}</p> : <>
        <p className={`ws-reason${sum.readyForStage ? " ws-ok" : ""}`}>{sum.readyForStage
          ? t("All required steps are done.", "كل الخطوات المطلوبة تمت.")
          : t(`${sum.mandatoryTotal - sum.mandatoryDone} required step(s) left before Ready.`, `متبقي ${sum.mandatoryTotal - sum.mandatoryDone} خطوة مطلوبة قبل الجاهزية.`)}</p>
        {phases.map((phase) => <div key={phase} className="ws-phase">
          <h4 className="ws-phase-title">{phaseLabels[phase][lang]}</h4>
          <ul className="ws-check-list">
            {checklist.filter((c) => c.phase === phase).map((item) => <li key={item.id}>
              <button type="button" className={`ws-check${item.done ? " done" : ""}`} role="checkbox" aria-checked={item.done} disabled={!writable || Boolean(busy)} onClick={() => void toggle(item)}>
                <span className="ws-check-box" aria-hidden="true">{item.done && <Check size={20} />}</span>
                <span className="ws-check-text">{label(item)}{!item.mandatory && <span className="ws-optional"> · {t("optional", "اختياري")}</span>}</span>
              </button>
            </li>)}
          </ul>
        </div>)}
      </>}
    </Collapsible>

    <Collapsible title={t("Notes", "الملاحظات")} count={notes.length} defaultOpen={notes.length > 0 || !closed}>
      {writable && <div className="ws-note-form">
        <Field label={t("Add a note", "إضافة ملاحظة")} hint={t("Internal: customers do not see it.", "داخلية: لا يراها العميل.")}>
          <textarea className="field-textarea" value={noteText} maxLength={2000} onChange={(e) => setNoteText(e.target.value)} />
        </Field>
        <button type="button" className="btn btn-primary btn-lg" disabled={!noteText.trim() || Boolean(busy)} onClick={() => void addNote()}>{t("Save note", "حفظ الملاحظة")}</button>
      </div>}
      {notes.length === 0 ? <p className="ws-reason">{t("No notes yet.", "لا توجد ملاحظات بعد.")}</p>
        : <ul className="record-ref-list">{notes.map((n) => <li className="record-ref-row" key={n.id}><span className="ws-note-body">{n.body}<div className="record-ref-sub"><bdi>{n.authorName}</bdi> · <DateText value={n.createdAt} lang={lang} /></div></span></li>)}</ul>}
    </Collapsible>

    <Collapsible title={t("Photos", "الصور")} count={photos.length}>
      {!storage.available && <Notice tone="info">{t("Photo storage is not configured. Notes and the checklist still work.", "تخزين الصور غير مُفعّل. الملاحظات وقائمة التحقق تعمل.")}</Notice>}
      {storage.available && writable && <div className="ws-photo-add">
        <div className="ws-chip-row" role="radiogroup" aria-label={t("Photo type", "نوع الصورة")}>
          {(Object.keys(photoKindLabels) as PhotoKind[]).map((k) => <button key={k} type="button" role="radio" aria-checked={photoKind === k} className={`ws-chip${photoKind === k ? " on" : ""}`} onClick={() => setPhotoKind(k)}>{photoKindLabels[k][lang]}</button>)}
        </div>
        <label className={`btn btn-primary btn-lg ws-file-btn${busy === "photo" ? " is-busy" : ""}`}><Camera size={18} aria-hidden="true" /> {busy === "photo" ? t("Uploading…", "جارٍ الرفع…") : t("Take or choose a photo", "التقاط أو اختيار صورة")}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="ws-file-input" disabled={Boolean(busy)} onChange={(e) => void onPhoto(e.target.files?.[0])} /></label>
      </div>}
      {photos.length === 0 ? <p className="ws-reason">{t("No photos yet.", "لا توجد صور بعد.")}</p>
        : <ul className="ws-photo-grid">{photos.map((p) => <li key={p.id}>
          <a href={techApi.photoUrl(jobId, p.id)} target="_blank" rel="noreferrer" className="ws-photo">
            <img src={techApi.photoUrl(jobId, p.id)} alt={`${photoKindLabels[p.kind][lang]}${p.caption ? ` - ${p.caption}` : ""}`} loading="lazy" />
            <span className="ws-photo-tag">{photoKindLabels[p.kind][lang]}</span>
          </a>
        </li>)}</ul>}
    </Collapsible>

    <Collapsible title={t("Issues", "المشكلات")} count={openIssues.length || issues.length} defaultOpen={openIssues.length > 0}>
      {issues.length === 0 ? <p className="ws-reason">{t("No issues reported.", "لا توجد مشكلات مبلغ عنها.")}</p>
        : <ul className="record-ref-list">{issues.map((i) => <li className="record-ref-row ws-issue-row" key={i.id}>
          <span>
            <strong>{issueKindLabels[i.kind][lang]}</strong> <span className={`ws-pill${i.status === "open" ? "" : " ws-pill-done"}`}>{i.status === "open" ? t("Open", "مفتوحة") : t("Resolved", "تم الحل")}</span>
            <div className="ws-note-body">{i.note}</div>
            {i.photoId && <a className="text-link" href={techApi.photoUrl(jobId, i.photoId)} target="_blank" rel="noreferrer">{t("View photo", "عرض الصورة")}</a>}
            <div className="record-ref-sub"><bdi>{i.reportedByName}</bdi> · <DateText value={i.createdAt} lang={lang} />{i.resolution ? ` · ${i.resolution}` : ""}</div>
            {isManager && i.status === "open" && !isDemo && <div className="ws-resolve">
              <input className="field-input" value={resolveText[i.id] ?? ""} maxLength={500} aria-label={t("Resolution note", "ملاحظة الحل")} placeholder={t("What was done (optional)", "ما تم (اختياري)")} onChange={(e) => setResolveText((c) => ({ ...c, [i.id]: e.target.value }))} />
              <button type="button" className="btn btn-sm" disabled={Boolean(busy)} onClick={() => void resolve(i.id)}>{t("Mark resolved", "تم الحل")}</button>
            </div>}
          </span>
        </li>)}</ul>}
    </Collapsible>
    {closed && <EmptyState title={t("This job is closed", "أمر الشغل مغلق")} text={t("Notes and photos are read-only.", "الملاحظات والصور للقراءة فقط.")} />}
  </div>;
}
