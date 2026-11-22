export type IssueKind = "damage-found" | "part-missing" | "customer-request" | "delay";
export type PhotoKind = "before" | "after" | "damage";

export interface TechNote { id: string; authorName: string; body: string; createdAt: string }
export interface TechChecklistItem { id: string; phase: string; labelEn: string; labelAr: string; mandatory: boolean; done: boolean; doneByName: string | null; doneAt: string | null }
export interface TechChecklistSummary { total: number; done: number; mandatoryTotal: number; mandatoryDone: number; readyForStage: boolean }
export interface TechPhoto { id: string; kind: PhotoKind; fileName: string; caption: string; uploadedByName: string; createdAt: string }
export interface TechIssue { id: string; kind: IssueKind; note: string; photoId: string | null; status: "open" | "resolved"; reportedByName: string; createdAt: string; resolvedByName: string | null; resolvedAt: string | null; resolution: string | null }
export interface TechExtras {
  stage: string;
  storage: { available: boolean };
  notes: TechNote[];
  photos: TechPhoto[];
  issues: TechIssue[];
  checklist: TechChecklistItem[];
  checklistSummary: TechChecklistSummary;
}
export interface OpenIssue { id: string; jobId: string; kind: IssueKind; note: string; createdAt: string; reportedByName: string; branchId: string }
export interface ChecklistBlock { code: "CHECKLIST_INCOMPLETE"; canOverride: boolean; remaining: { id: string; labelEn: string; labelAr: string }[] }

export interface ApiOutcome<T> { ok: boolean; status: number; code?: string; data?: T; raw?: Record<string, unknown> }

async function call<T>(url: string, init: RequestInit = {}): Promise<ApiOutcome<T>> {
  const headers = new Headers(init.headers);
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isForm) headers.set("Content-Type", "application/json");
  try {
    const response = await fetch(url, { ...init, headers, credentials: "same-origin" });
    const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
    return response.ok
      ? { ok: true, status: response.status, data: raw as T, raw }
      : { ok: false, status: response.status, code: typeof raw.code === "string" ? raw.code : "REQUEST_FAILED", raw };
  } catch {
    return { ok: false, status: 0, code: "NETWORK" };
  }
}

const base = (jobId: string) => `/api/jobs/${encodeURIComponent(jobId)}`;

export const techApi = {
  extras: (jobId: string) => call<TechExtras>(`${base(jobId)}/extras`),
  checklist: (jobId: string) => call<{ items: TechChecklistItem[]; summary: TechChecklistSummary }>(`${base(jobId)}/checklist`),
  toggle: (jobId: string, itemId: string, done: boolean) =>
    call<{ items: TechChecklistItem[]; summary: TechChecklistSummary }>(`${base(jobId)}/checklist/${encodeURIComponent(itemId)}`, { method: "PATCH", body: JSON.stringify({ done }) }),
  addNote: (jobId: string, body: string) => call<{ noteId: string }>(`${base(jobId)}/notes`, { method: "POST", body: JSON.stringify({ body }) }),
  uploadPhoto: (jobId: string, kind: PhotoKind, file: File) => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    return call<{ photoId: string }>(`${base(jobId)}/photos`, { method: "POST", body: form });
  },
  photoUrl: (jobId: string, photoId: string) => `${base(jobId)}/photos/${encodeURIComponent(photoId)}/file`,
  reportIssue: (jobId: string, input: { kind: IssueKind; note: string; photoId?: string }) =>
    call<{ issueId: string }>(`${base(jobId)}/issues`, { method: "POST", body: JSON.stringify(input) }),
  resolveIssue: (jobId: string, issueId: string, resolution?: string) =>
    call<{ ok: true }>(`${base(jobId)}/issues/${encodeURIComponent(issueId)}`, { method: "PATCH", body: JSON.stringify({ resolution }) }),
  openIssues: () => call<{ count: number; issues: OpenIssue[] }>("/api/jobs/issues/open"),
  /** Stage move that understands the checklist gate (the shared store only returns an error code). */
  moveStage: (jobId: string, nextStage: string, overrideReason?: string) =>
    call<{ ok: true }>(`${base(jobId)}/stage`, { method: "PATCH", body: JSON.stringify({ nextStage, ...(overrideReason ? { overrideReason } : {}) }) }),
};

export function asChecklistBlock(outcome: ApiOutcome<unknown>): ChecklistBlock | null {
  if (outcome.code !== "CHECKLIST_INCOMPLETE" || !outcome.raw) return null;
  const remaining = Array.isArray(outcome.raw.remaining) ? outcome.raw.remaining as ChecklistBlock["remaining"] : [];
  return { code: "CHECKLIST_INCOMPLETE", canOverride: outcome.raw.canOverride === true, remaining };
}

export const issueKindLabels: Record<IssueKind, { en: string; ar: string }> = {
  "damage-found": { en: "Damage found", ar: "تلف موجود" },
  "part-missing": { en: "Part missing", ar: "قطعة ناقصة" },
  "customer-request": { en: "Customer request", ar: "طلب العميل" },
  delay: { en: "Delay", ar: "تأخير" },
};
export const photoKindLabels: Record<PhotoKind, { en: string; ar: string }> = {
  before: { en: "Before", ar: "قبل" },
  after: { en: "After", ar: "بعد" },
  damage: { en: "Damage", ar: "تلف" },
};
export const phaseLabels: Record<string, { en: string; ar: string }> = {
  prep: { en: "Preparation", ar: "التجهيز" },
  application: { en: "Application", ar: "التنفيذ" },
  curing: { en: "Curing", ar: "التثبيت" },
  qc: { en: "Quality check", ar: "فحص الجودة" },
};
