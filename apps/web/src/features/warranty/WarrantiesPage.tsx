import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle, BadgeCheck, CalendarClock, Check, ClipboardCheck, Download, FileClock,
  FilePlus2, History, LockKeyhole, Paperclip, Plus, Printer, QrCode, RotateCcw, Search, ShieldCheck, Upload, Wrench,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type {
  GarageState, WarrantyClaim, WarrantyClaimStatus, WarrantyPolicy, WarrantyPolicyInput,
  WarrantyRecord, WarrantyStartRule, WarrantyVerificationField, LifetimeDefinition,
  QuoteRevision,
} from "@garage/domain";
import { filterWarrantyRecords } from "@garage/domain";
import { quoteApi, warrantyAuthorityApi, unknownWriteOutcomeCopy, useGarageStore } from "../../shared/store";
import { getWarrantyTaskPrerequisites, useWarrantyDraftState, warrantyDraftKey } from "./warranty-form-state";
import { reconcileWarrantyIssueDraft } from "../../shared/task-steps";
import { PolicySummary } from "./PolicySummary";
import { PolicyEditor } from "./PolicyEditor";
import { CoverageDetail } from "./CoverageDetail";
import { ClaimDetail } from "./ClaimDetail";
import {
  branchDisplay, customerDisplay, EmptyState, PageHeading, SectionTitle, serviceDisplay,
  type PageProps,
} from "../../shared/ui";
import { WarrantyVerificationCard } from "./PublicWarrantyVerificationPage";
import { WarrantyInvoicePanel } from "./WarrantyInvoicePanel";
import { startWarrantyPrint } from "./warranty-print";
import "./WarrantiesPage.css";

type Tab = "policies" | "coverage" | "claims" | "history" | "verification";
type PolicyFormState = {
  policyId: string;
  name: string;
  eligibleServiceIds: string[];
  autoIssue: boolean;
  startRule: "" | WarrantyStartRule;
  durationMonths: string;
  coverageKind: "fixed" | "lifetime";
  lifetimeSubject: LifetimeDefinition["subject"];
  lifetimeSubjectDefinition: string;
  lifetimeTerminationConditions: string;
  lifetimeTransferRule: string;
  lifetimeMaintenanceConditions: string;
  lifetimeIssuer: string;
  lifetimeRemedy: string;
  lifetimePublicAr: string;
  lifetimePublicEn: string;
  lifetimeEvidenceRef: string;
  lifetimeApprovalReason: string;
  lifetimeApproved: boolean;
  exclusions: string;
  evidenceRequirements: string;
  reviewRole: "" | "owner" | "branch-manager";
  responseDays: string;
};

const freshPolicyForm = (): PolicyFormState => ({
  policyId: "", name: "", eligibleServiceIds: [], autoIssue: false, startRule: "",
  durationMonths: "", exclusions: "", evidenceRequirements: "",
  coverageKind: "fixed", lifetimeSubject: "other", lifetimeSubjectDefinition: "", lifetimeTerminationConditions: "",
  lifetimeTransferRule: "", lifetimeMaintenanceConditions: "", lifetimeIssuer: "", lifetimeRemedy: "",
  lifetimePublicAr: "", lifetimePublicEn: "", lifetimeEvidenceRef: "", lifetimeApprovalReason: "", lifetimeApproved: false,
  reviewRole: "", responseDays: "",
});

function lifetimeFormFromPolicy(policy: WarrantyPolicy): Pick<PolicyFormState,
  "coverageKind" | "lifetimeSubject" | "lifetimeSubjectDefinition" | "lifetimeTerminationConditions" |
  "lifetimeTransferRule" | "lifetimeMaintenanceConditions" | "lifetimeIssuer" | "lifetimeRemedy" |
  "lifetimePublicAr" | "lifetimePublicEn" | "lifetimeEvidenceRef" | "lifetimeApprovalReason" | "lifetimeApproved"> {
  const snapshot = policy.lifetimeDefinition;
  const value = snapshot?.state === "approved" ? snapshot.value : snapshot?.draftValue;
  return {
    coverageKind: policy.coverageKind ?? "fixed", lifetimeSubject: value?.subject ?? "other",
    lifetimeSubjectDefinition: value?.subjectDefinition ?? "", lifetimeTerminationConditions: value?.terminationConditions ?? "",
    lifetimeTransferRule: value?.transferRule ?? "", lifetimeMaintenanceConditions: value?.maintenanceConditions ?? "",
    lifetimeIssuer: value?.issuer ?? "", lifetimeRemedy: value?.remedy ?? "",
    lifetimePublicAr: value?.publicWording?.ar ?? "", lifetimePublicEn: value?.publicWording?.en ?? "",
    lifetimeEvidenceRef: snapshot?.state === "approved" ? snapshot.approval.evidenceRef : "",
    lifetimeApprovalReason: snapshot?.state === "approved" ? snapshot.approval.reason : "",
    lifetimeApproved: snapshot?.state === "approved",
  };
}

function policyFormFrom(policy: WarrantyPolicy): PolicyFormState {
  return {
    policyId: policy.policyId, name: policy.name, eligibleServiceIds: [...policy.eligibleServiceIds],
    autoIssue: policy.autoIssue, startRule: policy.startRule,
    durationMonths: policy.durationMonths == null ? "" : String(policy.durationMonths),
    exclusions: policy.exclusions, ...lifetimeFormFromPolicy(policy),
    evidenceRequirements: policy.evidenceRequirements, reviewRole: policy.reviewRole,
    responseDays: String(policy.responseDays),
  };
}

const MAX_EVIDENCE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_EVIDENCE_ATTACHMENTS = 10;
const verificationFields: { key: WarrantyVerificationField; en: string; ar: string }[] = [
  { key: "service", en: "Service", ar: "الخدمة" },
  { key: "status", en: "Coverage status", ar: "حالة التغطية" },
  { key: "startDate", en: "Start date", ar: "تاريخ البداية" },
  { key: "expiresOn", en: "Expiry date", ar: "تاريخ الانتهاء" },
  { key: "branch", en: "Branch", ar: "الفرع" },
  { key: "coverage", en: "Coverage wording", ar: "صياغة التغطية" },
];

const statusText: Record<string, { en: string; ar: string }> = {
  draft: { en: "Draft", ar: "مسودة" },
  published: { en: "Published", ar: "منشورة" },
  retired: { en: "Retired", ar: "متوقفة" },
  active: { en: "Active", ar: "ساري" },
  expired: { en: "Expired", ar: "منتهي" },
  terminated: { en: "Terminated", ar: "منتهي التغطية" },
  void: { en: "Voided", ar: "ملغي" },
  open: { en: "Open", ar: "مفتوحة" },
  "under-review": { en: "Under review", ar: "مستنية المراجعة" },
  approved: { en: "Approved", ar: "اتوافقت" },
  denied: { en: "Denied", ar: "اترفضت" },
  closed: { en: "Closed", ar: "مقفولة" },
};

function branchAllowed(state: GarageState, branchId: string, allowed: string[]) {
  return allowed.includes(branchId) && (state.currentBranch === "all" || state.currentBranch === branchId);
}

function formatDateTime(value: string, lang: "ar" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value || "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium", timeStyle: "short",
  }).format(date);
}

function expiryPreview(start: string, months: number) {
  if (!start || !months) return "";
  const [year, month, day] = start.split("-").map(Number);
  if (!year || !month || !day) return "";
  const anniversary = new Date(Date.UTC(year, month - 1 + months, day));
  // JavaScript rolls dates such as 31 February into March; anniversary dates use the last valid day of that month.
  if (anniversary.getUTCDate() !== day) anniversary.setUTCDate(0);
  anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  return anniversary.toISOString().slice(0, 10);
}

function getPolicyForWarranty(state: GarageState, record: WarrantyRecord) {
  return state.warrantyPolicies.find((policy) => policy.policyId === record.policyId && policy.version === record.policyVersion);
}

function customerFor(state: GarageState, customerId: string) {
  return state.customers.find((customer) => customer.id === customerId);
}

function vehicleFor(state: GarageState, customerId: string, vehicleId: string) {
  return customerFor(state, customerId)?.vehicles.find((vehicle) => vehicle.id === vehicleId);
}

export function WarrantiesPage({ lang, t, state, notify }: PageProps) {
  const store = useGarageStore();
  const qrPrintCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => qrPrintCleanupRef.current?.(), []);
  const actor = store.actor;
  const isOwner = actor?.role === "owner";
  const isManager = actor?.role === "branch-manager";
  const isReception = actor?.role === "receptionist";
  const canIssue = isOwner || isManager;
  const canReview = isOwner || isManager;
  const allowedBranches = isOwner ? state.branches.map((branch) => branch.id) : actor?.branchIds ?? [];

  const [tab, setTab] = useState<Tab>(isOwner ? "policies" : "coverage");
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [templateMode, setTemplateMode] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<WarrantyPolicy | null>(null);
  const draftScope = { userId: actor?.userId ?? "anonymous", dataset: actor?.isDemo ? "demo" as const : "live" as const };
  const [policyForm, setPolicyForm, discardPolicyDraft] = useWarrantyDraftState<PolicyFormState>(
    { ...draftScope, task: "policy", entityId: editingPolicy?.policyId ?? "new", version: editingPolicy?.version ?? 0 },
    () => editingPolicy ? policyFormFrom(editingPolicy) : freshPolicyForm(),
  );
  const [policyError, setPolicyError] = useState("");
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [publishTarget, setPublishTarget] = useState<string | null>(null);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [issueSelection, setIssueSelection, discardIssueSelection] = useWarrantyDraftState(
    { ...draftScope, task: "issue", entityId: `selection:${state.currentBranch}`, version: 0 },
    () => ({ policy: "" }),
  );
  const issuePolicy = issueSelection.policy;
  const setIssuePolicy = (policy: string) => setIssueSelection({ policy });
  const [issueFields, setIssueFields, discardIssueFields] = useWarrantyDraftState(
    { ...draftScope, task: "issue", entityId: `policy:${issuePolicy}:${state.currentBranch}`, version: Number(issuePolicy.split(":").at(-1)) || 0 },
    () => ({ job: "", component: "", date: "" }),
  );
  const issueJob = issueFields.job;
  const issueComponent = issueFields.component;
  const issueDate = issueFields.date;
  const setIssueJob = (job: string) => setIssueFields((current) => reconcileWarrantyIssueDraft(current, { ...current, job }));
  const setIssueComponent = (component: string) => setIssueFields((current) => ({ ...current, component }));
  const setIssueDate = (date: string) => setIssueFields((current) => ({ ...current, date }));
  const [acceptedQuotes, setAcceptedQuotes] = useState<QuoteRevision[]>([]);
  const [quotesReady, setQuotesReady] = useState(false);
  const [retiredAuthority, setRetiredAuthority] = useState<{ key: string; outcome: "approved" | "not-retired" | "missing-accepted-binding" | "owner-exception-required" } | null>(null);
  const [issueError, setIssueError] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [savingVoid, setSavingVoid] = useState(false);
  const [claimSelection, setClaimSelection] = useWarrantyDraftState(
    { ...draftScope, task: "claim", entityId: `selection:${state.currentBranch}`, version: 0 },
    () => ({ warrantyId: "" }),
  );
  const claimWarrantyId = claimSelection.warrantyId;
  const setClaimWarrantyId = (warrantyId: string) => setClaimSelection({ warrantyId });
  const selectedClaimWarranty = state.warranties.find((record) => record.id === claimWarrantyId);
  const [claimFields, setClaimFields, discardClaimDraft] = useWarrantyDraftState(
    { ...draftScope, task: "claim", entityId: claimWarrantyId || "none", version: selectedClaimWarranty?.policyVersion ?? 0 },
    () => ({ summary: "", evidence: "" }),
  );
  const claimSummary = claimFields.summary;
  const claimEvidence = claimFields.evidence;
  const setClaimSummary = (summary: string) => setClaimFields((current) => ({ ...current, summary }));
  const setClaimEvidence = (evidence: string) => setClaimFields((current) => ({ ...current, evidence }));
  const [claimError, setClaimError] = useState("");
  const [savingClaim, setSavingClaim] = useState(false);
  const [evidenceStorageReady, setEvidenceStorageReady] = useState<boolean | null>(null);
  const [uploadingClaimId, setUploadingClaimId] = useState<string | null>(null);
  const [evidenceUploadErrors, setEvidenceUploadErrors] = useState<Record<string, string>>({});
  const [reviewDrafts, setReviewDrafts] = useWarrantyDraftState<Record<string, string>>(
    { ...draftScope, task: "review", entityId: `scope:${state.currentBranch}`, version: 0 }, () => ({}),
  );
  const reviewKey = (claim: WarrantyClaim) => warrantyDraftKey({ ...draftScope, task: "review", entityId: claim.id, version: Date.parse(claim.updatedAt) || 0 });
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [coverageStatusFilter, setCoverageStatusFilter] = useState<WarrantyRecord["status"] | "all">("all");
  const [verificationDraft, setVerificationDraft, discardVerificationDraft] = useWarrantyDraftState(
    { ...draftScope, task: "verification", entityId: "public-settings", version: 0 },
    () => ({ enabled: state.warrantyVerificationSettings?.enabled ?? false,
      fields: state.warrantyVerificationSettings?.approvedFields ?? [] as WarrantyVerificationField[] }),
  );
  const verificationEnabled = verificationDraft.enabled;
  const approvedFields = verificationDraft.fields;
  const setVerificationEnabled = (enabled: boolean) => setVerificationDraft((current) => ({ ...current, enabled }));
  const setApprovedFields = (next: WarrantyVerificationField[] | ((current: WarrantyVerificationField[]) => WarrantyVerificationField[])) =>
    setVerificationDraft((current) => ({ ...current, fields: typeof next === "function" ? next(current.fields) : next }));
  const [savingVerificationSettings, setSavingVerificationSettings] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [activeVerification, setActiveVerification] = useState<{ warrantyId: string; token: string } | null>(null);
  const [previewWarrantyId, setPreviewWarrantyId] = useState<string | null>(null);
  const [creatingVerificationFor, setCreatingVerificationFor] = useState<string | null>(null);
  const [revokingVerificationFor, setRevokingVerificationFor] = useState<string | null>(null);
  const [printingVerificationFor, setPrintingVerificationFor] = useState<string | null>(null);
  const canPrepareVerification = isOwner || isManager;
  const publicVerificationReady = Boolean(
    state.warrantyVerificationSettings?.enabled &&
    state.warrantyVerificationSettings.approvedFields.includes("service") &&
    state.warrantyVerificationSettings.approvedFields.includes("status"),
  );

  useEffect(() => {
    setShowPolicyForm(false);
    setEditingPolicy(null);
    setPolicyForm(freshPolicyForm());
    setIssuePolicy(""); setIssueJob(""); setIssueComponent(""); setIssueDate("");
    setClaimWarrantyId(""); setClaimSummary(""); setClaimEvidence("");
    setReviewDrafts({}); setVoidReason(""); setVoidingId(null);
    setActiveVerification(null);
  }, [actor?.userId, actor?.isDemo]);

  useEffect(() => {
    setIssueJob(""); setIssueComponent(""); setIssueDate("");
    setClaimWarrantyId(""); setClaimSummary(""); setClaimEvidence("");
    setReviewDrafts({}); setVoidingId(null); setVoidReason("");
  }, [state.currentBranch]);

  useEffect(() => {
    let active = true;
    void store.getWarrantyEvidenceStorageStatus().then((available) => {
      if (active) setEvidenceStorageReady(available);
    });
    return () => { active = false; };
  }, [store.getWarrantyEvidenceStorageStatus]);

  useEffect(() => {
    if (!canIssue) return;
    let active = true;
    setQuotesReady(false);
    void quoteApi.list().then((revisions) => {
      if (active) { setAcceptedQuotes(revisions.filter((revision) => revision.state === "accepted")); setQuotesReady(true); }
    }).catch(() => { if (active) { setAcceptedQuotes([]); setQuotesReady(false); } });
    return () => { active = false; };
  }, [canIssue, actor?.userId, actor?.isDemo]);

  const accessibleWarranties = useMemo(
    () => state.warranties.filter((item) => branchAllowed(state, item.branchId, allowedBranches)),
    [state.warranties, state.currentBranch, allowedBranches.join("|")],
  );
  const visibleClaims = useMemo(
    () => state.warrantyClaims.filter((claim) => branchAllowed(state, claim.branchId, allowedBranches)),
    [state.warrantyClaims, state.currentBranch, allowedBranches.join("|")],
  );
  const visiblePolicies = state.warrantyPolicies;
  const publishedPolicies = visiblePolicies.filter((policy) => policy.status === "published" &&
    Boolean(policy.name.trim() && policy.eligibleServiceIds.length && (policy.coverageKind === "lifetime" ? policy.lifetimeDefinition?.state === "approved" : (policy.durationMonths ?? 0) > 0) &&
      policy.exclusions.trim() && policy.evidenceRequirements.trim() && policy.responseDays > 0 &&
      (policy.startRule === "job-delivery" || policy.startRule === "owner-selected-date") &&
      (policy.reviewRole === "owner" || policy.reviewRole === "branch-manager")));
  const deliveredEligibleJobs = useMemo(() => {
    if (!canIssue) return [];
    return state.jobs.filter((job) =>
      job.stage === "delivered" &&
      branchAllowed(state, job.branchId, allowedBranches) &&
      state.warrantyPolicies.some((policy) => (policy.status === "published" ||
        (policy.status === "retired" && Boolean(state.bookings.find((booking) => booking.id === job.bookingId)?.acceptedQuoteRef))) &&
        policy.eligibleServiceIds.includes(job.serviceId) &&
        (Boolean(state.bookings.find((booking) => booking.id === job.bookingId)?.acceptedQuoteRef) ||
          !accessibleWarranties.some((record) => record.jobId === job.id && record.policyId === policy.policyId))),
    );
  }, [canIssue, state.jobs, state.bookings, state.warrantyPolicies, state.currentBranch, accessibleWarranties, allowedBranches.join("|")]);
  const filteredWarranties = filterWarrantyRecords(accessibleWarranties, query, coverageStatusFilter, (record) => {
    const customer = customerFor(state, record.customerId);
    const vehicle = vehicleFor(state, record.customerId, record.vehicleId);
    const invoice = state.warrantyInvoiceDrafts.find((item) => item.warrantyId === record.id);
    const service = state.services.find((item) => item.id === record.serviceId);
    return `${record.id} ${record.policyName} ${record.jobId} ${customer?.name ?? ""} ${customer?.phone ?? ""} ${vehicle?.plate ?? ""} ${vehicle?.makeModel ?? ""} ${service?.name ?? ""} ${service?.nameAr ?? ""} ${invoice?.id ?? ""}`;
  });
  const filteredClaims = visibleClaims.filter((claim) => {
    const warranty = state.warranties.find((item) => item.id === claim.warrantyId);
    const customer = warranty ? customerFor(state, warranty.customerId) : undefined;
    return `${claim.id} ${claim.summary} ${claim.evidence} ${customer?.name ?? ""} ${warranty?.policyName ?? ""}`.toLowerCase().includes(query.toLowerCase());
  });
  const accessibleWarrantyIds = new Set(accessibleWarranties.map((record) => record.id));
  const visibleClaimIds = new Set(visibleClaims.map((claim) => claim.id));
  const audit = state.warrantyAuditEvents.filter((event) =>
    (event.entityType === "policy" && isOwner) ||
    (event.entityType === "warranty" && accessibleWarrantyIds.has(event.entityId)) ||
    (event.entityType === "claim" && visibleClaimIds.has(event.entityId)),
  );

  const startPolicyCreate = (source?: WarrantyPolicy) => {
    setTab("policies");
    setEditingPolicy(null);
    setTemplateMode(false);
    setPolicyError("");
    setPolicyForm(source ? {
      policyId: source.policyId, name: source.name, eligibleServiceIds: [...source.eligibleServiceIds],
      autoIssue: source.autoIssue, startRule: source.startRule, durationMonths: source.durationMonths == null ? "" : String(source.durationMonths), exclusions: source.exclusions,
      ...lifetimeFormFromPolicy(source), lifetimeApproved: false,
      evidenceRequirements: source.evidenceRequirements, reviewRole: source.reviewRole, responseDays: String(source.responseDays),
    } : freshPolicyForm());
    setShowPolicyForm(true);
    setPublishTarget(null);
  };

  const startFromTemplate = () => {
    setTab("policies");
    setEditingPolicy(null);
    setPolicyError("");
    setTemplateMode(true);
    setPolicyForm(freshPolicyForm());
    setShowPolicyForm(true);
    setPublishTarget(null);
  };

  const startPolicyEdit = (policy: WarrantyPolicy) => {
    setTab("policies");
    setEditingPolicy(policy);
    setTemplateMode(false);
    setPolicyError("");
    setShowPolicyForm(true);
  };

  const policyInput = (): WarrantyPolicyInput => ({
    ...(policyForm.policyId ? { policyId: policyForm.policyId } : {}),
    name: policyForm.name.trim(),
    eligibleServiceIds: policyForm.eligibleServiceIds,
    autoIssue: policyForm.autoIssue,
    startRule: policyForm.startRule as WarrantyStartRule,
    coverageKind: policyForm.coverageKind,
    durationMonths: policyForm.coverageKind === "fixed" ? Number(policyForm.durationMonths) : null,
    lifetimeDefinition: policyForm.coverageKind === "lifetime" ? (() => {
      const value: LifetimeDefinition = {
        subject: policyForm.lifetimeSubject,
        subjectDefinition: policyForm.lifetimeSubjectDefinition.trim(),
        terminationConditions: policyForm.lifetimeTerminationConditions.trim(),
        transferRule: policyForm.lifetimeTransferRule.trim(),
        maintenanceConditions: policyForm.lifetimeMaintenanceConditions.trim(),
        issuer: policyForm.lifetimeIssuer.trim(), remedy: policyForm.lifetimeRemedy.trim(),
        publicWording: { ar: policyForm.lifetimePublicAr.trim(), en: policyForm.lifetimePublicEn.trim() },
      };
      const complete = [value.subjectDefinition, value.terminationConditions, value.transferRule,
        value.maintenanceConditions, value.issuer, value.remedy, value.publicWording.ar, value.publicWording.en,
        policyForm.lifetimeEvidenceRef.trim(), policyForm.lifetimeApprovalReason.trim()].every(Boolean);
      return complete && policyForm.lifetimeApproved
        ? { state: "approved" as const, value, policy: { id: policyForm.policyId || "new-draft", version: editingPolicy?.version ?? 1 },
          approval: { approvedBy: "owner", approvedAt: new Date().toISOString(), evidenceRef: policyForm.lifetimeEvidenceRef.trim(), reason: policyForm.lifetimeApprovalReason.trim() } }
        : { state: "unconfigured" as const, missing: ["approved lifetime definition"], draftValue: value };
    })() : null,
    exclusions: policyForm.exclusions.trim(),
    evidenceRequirements: policyForm.evidenceRequirements.trim(),
    reviewRole: policyForm.reviewRole as "owner" | "branch-manager",
    responseDays: Number(policyForm.responseDays),
  });

  const savePolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOwner || savingPolicy) return;
    if (editingPolicy && !state.warrantyPolicies.some((policy) =>
      policy.policyId === editingPolicy.policyId && policy.version === editingPolicy.version && policy.status === "draft")) {
      setPolicyError(t("This draft changed or is no longer editable. Reopen its current version.", "المسودة اتغيرت أو لم تعد قابلة للتعديل. افتح إصدارها الحالي."));
      return;
    }
    setSavingPolicy(true);
    setPolicyError("");
    const input = policyInput();
    const result = editingPolicy
      ? await store.updateWarrantyPolicy(editingPolicy.policyId, editingPolicy.version, {
        name: input.name, eligibleServiceIds: input.eligibleServiceIds, autoIssue: input.autoIssue, startRule: input.startRule,
        durationMonths: input.durationMonths, coverageKind: input.coverageKind, lifetimeDefinition: input.lifetimeDefinition,
        exclusions: input.exclusions, evidenceRequirements: input.evidenceRequirements,
        reviewRole: input.reviewRole, responseDays: input.responseDays,
      })
      : await store.createWarrantyPolicy(input);
    setSavingPolicy(false);
    if (!result.ok) {
      setPolicyError(errorCopy(result.error));
      return;
    }
    setShowPolicyForm(false);
    setEditingPolicy(null);
    discardPolicyDraft();
    notify(t("Policy draft saved.", "مسودة سياسة الضمان اتحفظت."));
  };

  const publishPolicy = async (policy: WarrantyPolicy) => {
    if (!publishConfirmed || !isOwner || publishing) return;
    setPublishing(true);
    setPolicyError("");
    const result = await store.publishWarrantyPolicy(policy.policyId, policy.version);
    setPublishing(false);
    if (!result.ok) {
      setPolicyError(errorCopy(result.error));
      return;
    }
    setPublishTarget(null);
    setPublishConfirmed(false);
    notify(t("Approved policy terms published.", "شروط السياسة المعتمدة اتنشرت."));
  };

  const duplicatePolicy = async (policy: WarrantyPolicy, target: "next-version" | "new-policy") => {
    setPolicyError("");
    const result = await store.duplicateWarrantyPolicy(policy.policyId, policy.version, target);
    if (!result.ok) { setPolicyError(errorCopy(result.error)); return; }
    notify(t("A new editable draft was created. Review all terms before publishing.", "اتعملت مسودة جديدة قابلة للتعديل. راجع كل الشروط قبل النشر."));
  };

  const retirePolicy = async (policy: WarrantyPolicy) => {
    const reason = window.prompt(t("Why is this policy version being retired?", "سبب إيقاف إصدار السياسة ده إيه؟"));
    if (!reason?.trim()) return;
    setPolicyError("");
    const result = await store.retireWarrantyPolicy(policy.policyId, policy.version, reason.trim());
    if (!result.ok) { setPolicyError(errorCopy(result.error)); return; }
    notify(t("Policy version retired. Existing coverage and claims remain available.", "تم إيقاف الإصدار. التغطيات والمطالبات الحالية محفوظة."));
  };

  const submitIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const policy = state.warrantyPolicies.find((item) => `${item.policyId}:${item.version}` === issuePolicy);
    const job = state.jobs.find((item) => item.id === issueJob);
    if (!issuePrerequisites.ready || !policy || !job ||
      (policy.startRule === "owner-selected-date" && !issueDate)) {
      setIssueError(t("Choose an eligible, delivered job and complete the required coverage date.", "اختار أمر شغل مؤهل واتسلم، وحدد تاريخ بداية التغطية المطلوب."));
      return;
    }
    setIssuing(true);
    setIssueError("");
    const result = await store.issueWarranty({
      policyId: policy.policyId, policyVersion: policy.version, jobId: job.id,
      componentId: issueComponent || null,
      ...(policy.startRule === "owner-selected-date" ? { startDate: issueDate } : {}),
    });
    setIssuing(false);
    if (!result.ok) {
      setIssueError(errorCopy(result.error));
      return;
    }
    setIssuePolicy("");
    setIssueJob("");
    setIssueComponent("");
    setIssueDate("");
    notify(t("Warranty coverage issued for the delivered job.", "اتعملت تغطية ضمان لأمر الشغل اللي اتسلم."));
  };

  const submitVoid = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!voidingId || !isOwner || !voidReason.trim()) return;
    setSavingVoid(true);
    setVoidError("");
    const result = await store.voidWarranty(voidingId, voidReason.trim());
    setSavingVoid(false);
    if (!result.ok) {
      setVoidError(errorCopy(result.error));
      return;
    }
    setVoidingId(null);
    setVoidReason("");
    notify(t("Warranty record voided.", "سجل الضمان اتلغى."));
  };

  const submitClaim = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!claimWarrantyId || !claimSummary.trim() || savingClaim) return;
    if (!selectedClaimWarranty || selectedClaimWarranty.status === "void" ||
      !branchAllowed(state, selectedClaimWarranty.branchId, allowedBranches)) {
      setClaimError(t("This coverage is no longer available in your branch scope. Choose a current record.", "التغطية دي لم تعد متاحة في فروعك. اختار سجلاً حالياً."));
      return;
    }
    setSavingClaim(true);
    setClaimError("");
    const result = await store.openWarrantyClaim({
      warrantyId: claimWarrantyId, summary: claimSummary.trim(), evidence: claimEvidence.trim(),
    });
    setSavingClaim(false);
    if (!result.ok) {
      setClaimError(errorCopy(result.error));
      return;
    }
    setClaimWarrantyId("");
    discardClaimDraft();
    setTab("claims");
    notify(t("Claim submitted for human review.", "المطالبة اتبعتت لمراجعة موظف."));
  };

  const updateClaim = async (claim: WarrantyClaim, status: WarrantyClaimStatus) => {
    const policy = state.warranties.find((record) => record.id === claim.warrantyId);
    const terms = policy ? getPolicyForWarranty(state, policy) : undefined;
    const allowed = isOwner || (isManager && terms?.reviewRole === "branch-manager");
    const resolution = (reviewDrafts[reviewKey(claim)] ?? claim.resolution ?? "").trim();
    const finalStatus = status === "approved" || status === "denied" || status === "closed";
    if (!allowed || !canReview || (finalStatus && !resolution)) {
      setReviewErrors((current) => ({ ...current, [claim.id]: finalStatus
        ? t("Write a resolution before recording a final decision.", "اكتب نتيجة المراجعة قبل ما تسجل القرار النهائي.")
        : t("You are not assigned to review this claim.", "مش مسموح لحسابك يراجع المطالبة دي.") }));
      return;
    }
    setReviewingId(claim.id);
    setReviewErrors((current) => ({ ...current, [claim.id]: "" }));
    const result = await store.updateWarrantyClaim(claim.id, status, resolution || undefined);
    setReviewingId(null);
    if (!result.ok) {
      setReviewErrors((current) => ({ ...current, [claim.id]: errorCopy(result.error) }));
      return;
    }
    setReviewDrafts((current) => { const next = { ...current }; delete next[reviewKey(claim)]; return next; });
    notify(t("Claim review updated.", "مراجعة المطالبة اتحدّثت."));
  };

  const uploadClaimEvidence = async (claim: WarrantyClaim, file: File) => {
    if (!evidenceStorageReady || uploadingClaimId) return;
    setEvidenceUploadErrors((current) => ({ ...current, [claim.id]: "" }));
    if (file.size > MAX_EVIDENCE_FILE_BYTES) {
      setEvidenceUploadErrors((current) => ({
        ...current,
        [claim.id]: t("Choose a file that is 8 MB or smaller.", "اختار ملف حجمه 8 ميجابايت أو أقل."),
      }));
      return;
    }
    if ((claim.attachments?.length ?? 0) >= MAX_EVIDENCE_ATTACHMENTS) {
      setEvidenceUploadErrors((current) => ({
        ...current,
        [claim.id]: t("This claim already has the maximum of 10 attachments.", "المطالبة دي فيها 10 مرفقات، وده الحد الأقصى."),
      }));
      return;
    }
    setUploadingClaimId(claim.id);
    const result = await store.uploadWarrantyClaimEvidence(claim.id, file);
    setUploadingClaimId(null);
    if (!result.ok) {
      const uploadErrors: Record<string, { en: string; ar: string }> = {
        PRIVATE_STORAGE_UNAVAILABLE: { en: "Private evidence storage is not configured. Attachments remain on hold.", ar: "التخزين الخاص للأدلة لسه مش متجهز. إضافة المرفقات موقوفة مؤقتاً." },
        EVIDENCE_FILE_TOO_LARGE: { en: "Choose a file that is 8 MB or smaller.", ar: "اختار ملف حجمه 8 ميجابايت أو أقل." },
        UNSUPPORTED_EVIDENCE_FILE: { en: "Use a valid JPG, PNG, WebP or PDF file.", ar: "استخدم ملف JPG أو PNG أو WebP أو PDF بصيغة صحيحة." },
        CLAIM_EVIDENCE_LIMIT: { en: "This claim already has the maximum of 10 attachments.", ar: "المطالبة دي فيها 10 مرفقات، وده الحد الأقصى." },
        ROLE_FORBIDDEN: { en: "Your account cannot access this claim.", ar: "حسابك مش مسموح له يفتح المطالبة دي." },
        EVIDENCE_STORAGE_FAILED: { en: "The private file could not be stored. Try again later.", ar: "ماقدرناش نحفظ الملف الخاص. جرّب تاني بعدين." },
      };
      const copy = uploadErrors[result.error];
      setEvidenceUploadErrors((current) => ({
        ...current,
        [claim.id]: unknownWriteOutcomeCopy(result.error, lang) ?? (copy ? t(copy.en, copy.ar) : t("The attachment could not be saved.", "ماقدرناش نحفظ المرفق.")),
      }));
      return;
    }
    notify(t("Evidence attachment added to the claim history.", "المرفق اتضاف لسجل المطالبة."));
  };

  const branchName = (branchId: string) => {
    const branch = state.branches.find((item) => item.id === branchId);
    return branch ? branchDisplay(branch.name, lang) : branchId;
  };
  const customerName = (customerId: string) => {
    const customer = customerFor(state, customerId);
    return customer ? customerDisplay(customer.name, lang) : "—";
  };
  const serviceName = (serviceId: string) => {
    const service = state.services.find((item) => item.id === serviceId);
    return service ? serviceDisplay(service.name, lang) : "—";
  };
  const labelStatus = (status: string) => t(statusText[status]?.en ?? status, statusText[status]?.ar ?? status);
  const auditActionLabel = (action: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      "draft-created": { en: "Policy draft created", ar: "اتعملت مسودة سياسة" },
      "draft-updated": { en: "Policy draft updated", ar: "مسودة السياسة اتحدّثت" },
      "policy-published": { en: "Policy version published", ar: "إصدار السياسة اتنشر" },
      "warranty-issued": { en: "Coverage issued", ar: "التغطية اتعملت" },
      "warranty-voided": { en: "Warranty voided", ar: "الضمان اتلغى" },
      "verification-token-created": { en: "Customer QR code created", ar: "رمز QR للعميل اتعمل" },
      "verification-token-revoked": { en: "Customer QR code revoked", ar: "رمز QR للعميل اتلغى" },
      "claim-opened": { en: "Claim opened", ar: "المطالبة اتفتحت" },
      "claim-status-changed": { en: "Claim review updated", ar: "مراجعة المطالبة اتحدّثت" },
      "claim-evidence-added": { en: "Claim evidence attached", ar: "دليل المطالبة اتضاف" },
    };
    const label = labels[action];
    return label ? t(label.en, label.ar) : action.replaceAll("-", " ");
  };
  const qrActionLabel = (action: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      prepared: { en: "QR card prepared", ar: "كارت QR اتجهز" },
      printed: { en: "Print requested", ar: "تم طلب الطباعة" },
      reprinted: { en: "Reprint requested", ar: "تم طلب إعادة الطباعة" },
      replaced: { en: "QR code replaced", ar: "تم استبدال رمز QR" },
      revoked: { en: "QR code revoked", ar: "تم إلغاء رمز QR" },
    };
    const label = labels[action];
    return label ? t(label.en, label.ar) : action;
  };
  const selectedIssueJob = state.jobs.find((job) => job.id === issueJob);
  const selectedBooking = state.bookings.find((booking) => booking.id === selectedIssueJob?.bookingId);
  const acceptedQuote = acceptedQuotes.find((quote) => quote.ref.quoteId === selectedBooking?.acceptedQuoteRef?.quoteId &&
    quote.ref.revision === selectedBooking?.acceptedQuoteRef?.revision);
  const currentIssuePolicy = state.warrantyPolicies.find((policy) => `${policy.policyId}:${policy.version}` === issuePolicy);
  const boundComponents = acceptedQuote?.input.warrantyBindings.filter((binding) =>
    binding.policy.id === currentIssuePolicy?.policyId && binding.policy.version === currentIssuePolicy?.version &&
    acceptedQuote.input.work.some((component) => component.id === binding.componentId && component.serviceId === selectedIssueJob?.serviceId)) ?? [];
  const authorityKey = `${actor?.userId}:${actor?.isDemo}:${issueJob}:${issueComponent}:${issuePolicy}`;
  useEffect(() => {
    if (currentIssuePolicy?.status !== "retired" || !issueJob || !issueComponent) return;
    let active = true;
    void warrantyAuthorityApi.retired({ jobId: issueJob, componentId: issueComponent,
      policyId: currentIssuePolicy.policyId, policyVersion: currentIssuePolicy.version })
      .then((result) => { if (active) setRetiredAuthority({ key: authorityKey, outcome: result.outcome }); })
      .catch(() => { if (active) setRetiredAuthority({ key: authorityKey, outcome: "owner-exception-required" }); });
    return () => { active = false; };
  }, [authorityKey, currentIssuePolicy?.status]);
  const currentRetiredOutcome = retiredAuthority?.key === authorityKey ? retiredAuthority.outcome : null;
  const issuePrerequisites = getWarrantyTaskPrerequisites({
    state, policy: currentIssuePolicy, jobId: issueJob, componentId: issueComponent || undefined,
    canIssue, allowedBranches, pending: issuing,
    componentIds: selectedBooking?.acceptedQuoteRef ? boundComponents.map((binding) => binding.componentId) : undefined,
    retiredBinding: currentIssuePolicy?.status === "retired" && boundComponents.length > 0 && currentRetiredOutcome === "approved",
  });
  const eligibleIssueJobs = currentIssuePolicy
    ? deliveredEligibleJobs.filter((job) => currentIssuePolicy.eligibleServiceIds.includes(job.serviceId) &&
      (Boolean(state.bookings.find((booking) => booking.id === job.bookingId)?.acceptedQuoteRef) ||
        !accessibleWarranties.some((record) => record.jobId === job.id && record.policyId === currentIssuePolicy.policyId)))
    : deliveredEligibleJobs;
  const issueReason = issuing ? t("Issuance is in progress.", "إصدار الضمان جارٍ الآن.")
    : !canIssue || !allowedBranches.length ? t("Your role or branch cannot issue coverage.", "صلاحيتك أو فرعك لا يسمح بإصدار التغطية.")
    : !state.warrantyPolicies.some((policy) => policy.status === "published" || policy.status === "retired") ? t("An Owner must publish complete policy terms first.", "لازم المالك ينشر شروط سياسة مكتملة أولاً.")
    : !deliveredEligibleJobs.length ? t("No eligible delivered job is available in your branches.", "مفيش أمر شغل مؤهل ومتسلم في فروعك.")
    : !issuePolicy || !currentIssuePolicy ? t("Choose a published policy version.", "اختار إصدار سياسة منشور.")
    : !issueJob ? t("Choose an eligible delivered job.", "اختار أمر شغل مؤهل ومتسلم.")
    : !eligibleIssueJobs.some((job) => job.id === issueJob) ? t("This job is ineligible or coverage already exists for this policy.", "أمر الشغل غير مؤهل أو له تغطية بالفعل من هذه السياسة.")
    : selectedBooking?.acceptedQuoteRef && !quotesReady ? t("Accepted component bindings are unavailable. Refresh before issuing.", "روابط المكونات المقبولة غير متاحة. حدّث البيانات قبل الإصدار.")
    : selectedBooking?.acceptedQuoteRef && !boundComponents.length ? t("The accepted quote has no matching component and policy version. Owner review is required; retired sold terms need explicit authority.", "العرض المقبول لا يحتوي مكوناً وإصدار سياسة مطابقين. يلزم مراجعة المالك وصلاحية صريحة للشروط المتقاعدة.")
    : selectedBooking?.acceptedQuoteRef && !issueComponent ? t("Choose the accepted component for this policy version.", "اختار المكون المقبول لإصدار السياسة ده.")
    : selectedBooking?.acceptedQuoteRef && !boundComponents.some((binding) => binding.componentId === issueComponent) ? t("The selected component no longer matches the accepted binding. Choose it again.", "المكون المختار لم يعد مطابقاً للرابط المقبول. اختاره من جديد.")
    : currentIssuePolicy.status === "retired" && currentRetiredOutcome === null ? t("Checking the accepted version's issuance authority…", "بنتحقق من صلاحية إصدار النسخة المقبولة…")
    : currentIssuePolicy.status === "retired" && currentRetiredOutcome === "missing-accepted-binding" ? t("This retired version lacks the exact accepted component binding.", "الإصدار المتقاعد ده مفيش له رابط مكون مقبول مطابق.")
    : currentIssuePolicy.status === "retired" && currentRetiredOutcome !== "approved" ? t("Owner exception required: the accepted issuance authority does not permit this retired version.", "مطلوب استثناء من المالك: صلاحية الإصدار المقبولة لا تسمح بالإصدار المتقاعد ده.")
    : issuePrerequisites.reasons.includes("duplicate") ? t("Coverage already exists for this component and policy.", "فيه تغطية بالفعل للمكون والسياسة دول.")
    : currentIssuePolicy.startRule === "owner-selected-date" && !issueDate ? t("Enter the Owner-selected coverage start date.", "حدد تاريخ بداية التغطية الذي اختاره المالك.")
    : "";

  const saveVerificationSettings = async () => {
    if (!isOwner || savingVerificationSettings || (verificationEnabled &&
      (!approvedFields.includes("service") || !approvedFields.includes("status")))) return;
    setSavingVerificationSettings(true);
    setVerificationError("");
    const result = await store.updateWarrantyVerificationSettings({ enabled: verificationEnabled, approvedFields });
    setSavingVerificationSettings(false);
    if (!result.ok) {
      setVerificationError(errorCopy(result.error));
      return;
    }
    notify(t("Public warranty verification settings saved.", "إعدادات التحقق العام من الضمان اتحفظت."));
  };

  const createVerification = async (record: WarrantyRecord) => {
    if (!canPrepareVerification || !publicVerificationReady) return;
    setCreatingVerificationFor(record.id);
    setVerificationError("");
    const result = await store.createWarrantyVerificationToken(record.id);
    setCreatingVerificationFor(null);
    if (!result.ok) {
      setVerificationError(errorCopy(result.error));
      return;
    }
    setActiveVerification({ warrantyId: record.id, token: result.token });
  };

  const revokeVerification = async (record: WarrantyRecord) => {
    if (!isOwner) return;
    if (!window.confirm(t("Revoke this QR code? Any printed copy will stop working.", "تلغي رمز QR ده؟ أي نسخة مطبوعة منه هتتوقف."))) return;
    setRevokingVerificationFor(record.id);
    setVerificationError("");
    const result = await store.revokeWarrantyVerificationToken(record.id);
    setRevokingVerificationFor(null);
    if (!result.ok) {
      setVerificationError(errorCopy(result.error));
      return;
    }
    if (activeVerification?.warrantyId === record.id) setActiveVerification(null);
    notify(t("Warranty verification code revoked.", "رمز التحقق من الضمان اتلغى."));
  };

  const printVerification = async (record: WarrantyRecord) => {
    setPrintingVerificationFor(record.id);
    setVerificationError("");
    const result = await store.recordWarrantyVerificationPrint(record.id);
    setPrintingVerificationFor(null);
    if (!result.ok) {
      setVerificationError(errorCopy(result.error));
      return;
    }
    qrPrintCleanupRef.current = startWarrantyPrint("qr");
  };

  const verificationPreview = (record: WarrantyRecord) => ({
    verified: true as const,
    status: record.status,
    ...((state.warrantyVerificationSettings?.approvedFields ?? []).includes("service") ? {
      serviceName: {
        en: state.services.find((item) => item.id === record.serviceId)?.name ?? "—",
        ar: state.services.find((item) => item.id === record.serviceId)?.nameAr ??
          serviceDisplay(state.services.find((item) => item.id === record.serviceId)?.name ?? "—", "ar"),
      },
    } : {}),
    ...((state.warrantyVerificationSettings?.approvedFields ?? []).includes("branch") ? {
      branchName: {
        en: state.branches.find((item) => item.id === record.branchId)?.name ?? record.branchId,
        ar: state.branches.find((item) => item.id === record.branchId)?.nameAr ??
          branchDisplay(state.branches.find((item) => item.id === record.branchId)?.name ?? record.branchId, "ar"),
      },
    } : {}),
    ...((state.warrantyVerificationSettings?.approvedFields ?? []).includes("startDate") ? { startDate: record.startDate } : {}),
    ...((state.warrantyVerificationSettings?.approvedFields ?? []).includes("expiresOn") && record.expiresOn ? { expiresOn: record.expiresOn } : {}),
    ...((state.warrantyVerificationSettings?.approvedFields ?? []).includes("coverage") ? { coverage: record.coverageKind === "lifetime"
      ? { kind: "lifetime" as const, ...(record.lifetimeDefinition ? { publicWording: record.lifetimeDefinition.publicWording } : {}) }
      : { kind: "fixed" as const } } : {}),
  });

  function errorCopy(code: string) {
    const unknown = unknownWriteOutcomeCopy(code, lang);
    if (unknown) return unknown;
    const known: Record<string, { en: string; ar: string }> = {
      FORBIDDEN: { en: "Your role is not allowed to complete this action.", ar: "دورك مش بيسمحلك تعمل الإجراء ده." },
      ROLE_FORBIDDEN: { en: "Your role or branch access does not allow this action.", ar: "دورك أو صلاحية فرعك مش بيسمحوا بالإجراء ده." },
      INVALID_WARRANTY_POLICY: { en: "The policy terms are incomplete or invalid. Review every required field.", ar: "شروط السياسة ناقصة أو فيها بيانات مش صحيحة. راجع كل الخانات المطلوبة." },
      INVALID_WARRANTY_SERVICE: { en: "One or more selected services are unavailable.", ar: "خدمة أو أكتر من اللي اخترتهم مش متاحة." },
      AUTO_ISSUE_REQUIRES_DELIVERY_START: { en: "Automatic coverage must start on the recorded delivery date.", ar: "التغطية التلقائية لازم تبدأ من تاريخ التسليم المسجل." },
      AUTO_WARRANTY_POLICY_CONFLICT: { en: "Another published automatic policy already covers one or more selected services.", ar: "في سياسة تلقائية منشورة بالفعل بتغطي خدمة أو أكتر من الخدمات المختارة." },
      POLICY_VERSION_LOCKED: { en: "Published terms cannot be changed. Create a new version instead.", ar: "مش ممكن تغيّر الشروط بعد نشرها. اعمل إصدار جديد بدل كده." },
      POLICY_NOT_ACTIVE: { en: "Only a currently published policy can issue coverage.", ar: "التغطية بتتصدر من سياسة منشورة وشغالة بس." },
      OWNER_APPROVAL_REQUIRED: { en: "The Owner must confirm Go Stores approved the complete terms.", ar: "لازم المالك يأكد إن Go Stores وافقت على الشروط كاملة." },
      JOB_NOT_DELIVERED: { en: "Coverage can only be issued for a delivered job.", ar: "التغطية بتتصدر لأمر شغل اتسلم بس." },
      SERVICE_NOT_ELIGIBLE: { en: "This job's service is not covered by the selected policy.", ar: "الخدمة دي مش موجودة ضمن تغطية السياسة المختارة." },
      DELIVERY_DATE_MISSING: { en: "The delivered job has no recorded delivery date.", ar: "مفيش تاريخ تسليم متسجل لأمر الشغل ده." },
      START_DATE_REQUIRED: { en: "Enter a valid Owner-approved coverage start date.", ar: "اكتب تاريخ بداية تغطية صحيح والمالك موافق عليه." },
      WARRANTY_ALREADY_ISSUED: { en: "Coverage has already been issued for this job and policy.", ar: "التغطية اتعملت بالفعل لأمر الشغل والسياسة دول." },
      WARRANTY_NOT_ACTIVE: { en: "This warranty is no longer active.", ar: "الضمان ده مبقاش ساري." },
      WARRANTY_VOID: { en: "A claim cannot be opened for a void warranty.", ar: "مش ممكن تفتح مطالبة لضمان اتلغى." },
      WARRANTY_EXPIRED: { en: "A claim cannot be opened after warranty coverage has expired.", ar: "مش ممكن تفتح مطالبة بعد انتهاء مدة الضمان." },
      CLAIM_FINALIZED: { en: "New evidence cannot be attached after a claim is finalized.", ar: "مش ممكن تضيف أدلة جديدة بعد ما المطالبة تخلص." },
      CLAIM_STATUS_TRANSITION: { en: "Claims must be reviewed before a final decision; closed claims cannot be reopened.", ar: "لازم المطالبة تتراجع قبل القرار النهائي، والمطالبة المقفولة مش هينفع تتفتح تاني." },
      CLAIM_RESOLUTION_REQUIRED: { en: "Write a resolution before recording a final decision.", ar: "اكتب نتيجة المراجعة قبل ما تسجل القرار النهائي." },
      INVALID_VERIFICATION_SETTINGS: { en: "Choose valid customer-facing fields and save the settings again.", ar: "اختار حقول صحيحة للعميل واحفظ الإعدادات تاني." },
      VERIFICATION_FIELDS_REQUIRED: { en: "Service and coverage status must both be approved before enabling verification.", ar: "لازم تعتمد الخدمة وحالة التغطية قبل تفعيل التحقق." },
      VERIFICATION_DISABLED: { en: "The Owner must enable public verification and approve its fields first.", ar: "لازم المالك يفعّل التحقق العام ويعتمد الحقول الأول." },
      VERIFICATION_TOKEN_NOT_FOUND: { en: "There is no active QR code to revoke for this warranty.", ar: "مفيش رمز QR شغال للضمان ده عشان تلغيه." },
      WARRANTY_NOT_FOUND: { en: "This warranty record is no longer available.", ar: "سجل الضمان ده مبقاش متاح." },
      INVALID_WARRANTY_CLAIM: { en: "Describe the issue and supporting evidence in at least five characters.", ar: "اكتب وصف للمشكلة والأدلة في ٥ حروف على الأقل." },
      INVALID_INVOICE_DRAFT: { en: "Check the invoice draft items, amounts and payment fields.", ar: "راجع بنود مسودة الفاتورة والمبالغ وبيانات الدفع." },
      INVOICE_DRAFT_NOT_FOUND: { en: "Create a draft invoice before editing it.", ar: "جهّز مسودة فاتورة قبل تعديلها." },
    };
    const copy = known[code];
    return copy ? t(copy.en, copy.ar) : t("The request could not be saved. Check your access and the record, then try again.", "ماقدرناش نحفظ الطلب. راجع صلاحيتك والبيانات وجرّب تاني.");
  }

  if (actor?.role === "technician") {
    return <section className="warranty-page panel" role="status">
      <div className="w-empty-symbol"><LockKeyhole size={19} /></div>
      <EmptyState title={t("Warranty access is not available", "مش مسموح لحسابك يفتح الضمان")}
        text={t("Technician accounts do not have access to warranty records or claims.", "حسابات الفنيين مش مسموح لها تفتح سجلات الضمان أو المطالبات.")} />
    </section>;
  }

  return <div className="warranty-page">
    <PageHeading
      eyebrow={t("Branch operations · Coverage", "شغل الفروع · الضمان")}
      title={t("Warranties", "الضمانات")}
      subtitle={t(
        "Approved terms stay explicit, coverage follows delivered work, and every claim is decided by an assigned person.",
        "شروط التغطية بتكون واضحة ومعتمدة، والضمان مرتبط بالشغل اللي اتسلم، وكل مطالبة بيراجعها شخص مسموح له.",
      )}
      action={isOwner ? <div className="w-actions">
        <button className="btn" type="button" onClick={startFromTemplate}><FilePlus2 size={15} />{t("Start from template", "ابدأ من قالب")}</button>
        <button className="btn btn-primary" type="button" onClick={() => startPolicyCreate()}><Plus size={16} />{t("New empty draft", "اعمل مسودة فاضية")}</button>
      </div> : undefined}
    />
    <div className="w-intro">
      <div className="w-intro-mark"><ShieldCheck size={20} /></div>
      <div><strong>{t("Coverage follows the Owner’s published policy", "التغطية بتمشي حسب سياسة المالك المنشورة")}</strong>
        <p>{t("The Owner can enable automatic coverage for eligible services after delivery. Other policies can be issued by authorised staff; claims still receive human review.", "المالك يقدر يفعّل التغطية التلقائية للخدمات المؤهلة بعد التسليم. السياسات التانية يصدرها الموظف المصرح له، ومراجعة المطالبات تفضل بشرية.")}</p>
      </div>
    </div>

    <div className="w-tabs" role="tablist" aria-label={t("Warranty workspace sections", "أقسام الضمان")}>
      {isOwner && <button className="w-tab" role="tab" aria-selected={tab === "policies"} onClick={() => { setTab("policies"); setQuery(""); }}><FilePlus2 size={15} />{t("Policy versions", "إصدارات السياسات")}<span className="w-tab-count">{visiblePolicies.length}</span></button>}
      <button className="w-tab" role="tab" aria-selected={tab === "coverage"} onClick={() => { setTab("coverage"); setQuery(""); }}><BadgeCheck size={15} />{t("Coverage records", "سجلات التغطية")}<span className="w-tab-count">{accessibleWarranties.length}</span></button>
      <button className="w-tab" role="tab" aria-selected={tab === "claims"} onClick={() => { setTab("claims"); setQuery(""); }}><ClipboardCheck size={15} />{t("Claims", "المطالبات")}<span className="w-tab-count">{visibleClaims.filter((claim) => claim.status === "open" || claim.status === "under-review").length}</span></button>
      <button className="w-tab" role="tab" aria-selected={tab === "history"} onClick={() => { setTab("history"); setQuery(""); }}><History size={15} />{t("History", "السجل")}</button>
      <button className="w-tab" role="tab" aria-selected={tab === "verification"} onClick={() => { setTab("verification"); setQuery(""); }}><QrCode size={15} />{t("QR verification", "التحقق برمز QR")}</button>
    </div>

    {tab === "policies" && isOwner && <>
      <SectionTitle title={t("Policy versions", "إصدارات السياسات")}
        description={t("Published versions are immutable. Save a new draft to change any term.", "الإصدارات المنشورة مش بتتعدل. اعمل مسودة جديدة لو عايز تغيّر أي شرط.")} />
      {showPolicyForm && <PolicyEditor onSubmit={(event) => void savePolicy(event)}>
        <h2 className="w-form-title">{editingPolicy ? t("Edit draft terms", "تعديل شروط المسودة") : policyForm.policyId ? t("Create a new policy version", "إنشاء إصدار جديد للسياسة") : templateMode ? t("Warranty policy template · draft only", "قالب سياسة ضمان · مسودة فقط") : t("Start an empty policy draft", "بدء مسودة سياسة فارغة")}</h2>
        <p className="w-form-desc">{t("No terms are prefilled for a new policy. Complete every field before saving.", "المسودة الجديدة مافيهاش شروط جاهزة. كمّل كل الخانات قبل الحفظ.")}</p>
        {templateMode && <div className="w-hold"><FilePlus2 size={16} /><span><strong>{t("Meeting outline only — not approved terms.", "مخطط للاجتماع بس — مش شروط معتمدة.")}</strong> {t("This template saves only an editable draft. Select eligible services and enter duration, exclusions, evidence rules, reviewer and response time yourself. It cannot be published or issue coverage until every term is completed and the Owner explicitly approves publication.", "القالب ده بيحفظ مسودة قابلة للتعديل بس. اختار الخدمات اللي هتدخل في التغطية واكتب المدة والاستثناءات والأدلة المطلوبة والمراجع ومدة الرد بنفسك. مش هينفع تنشره أو تعمل تغطية قبل ما تكمل كل الشروط والمالك يوافق صراحة على النشر.")}</span></div>}
        <div className="w-form-grid">
          <div><label className="field-label" htmlFor="wp-name">{t("Policy name", "اسم السياسة")} *</label><input id="wp-name" className="field-input" required maxLength={120} placeholder={templateMode ? t("Owner to name this policy", "المالك هيختار اسم السياسة") : ""} value={policyForm.name} onChange={(event) => setPolicyForm({ ...policyForm, name: event.target.value })} /></div>
          <div><label className="field-label" htmlFor="wp-kind">{t("Coverage kind", "نوع التغطية")}</label><select id="wp-kind" className="field-select" value={policyForm.coverageKind} onChange={(event) => setPolicyForm({ ...policyForm, coverageKind: event.target.value as "fixed" | "lifetime", lifetimeApproved: false })}><option value="fixed">{t("Fixed term", "مدة محددة")}</option><option value="lifetime">{t("Lifetime with approved conditions", "مدى الحياة وفق شروط معتمدة")}</option></select></div>
          {policyForm.coverageKind === "fixed" && <div><label className="field-label" htmlFor="wp-duration">{t("Coverage duration (months)", "مدة التغطية بالشهور")} *</label><input id="wp-duration" className="field-input" type="number" min="1" max="120" required placeholder={templateMode ? t("Not set — Owner must decide", "لسه ماتحددتش — المالك هو اللي يقرر") : ""} value={policyForm.durationMonths} onChange={(event) => setPolicyForm({ ...policyForm, durationMonths: event.target.value })} /></div>}
          {policyForm.coverageKind === "lifetime" && <div className="w-field-full">
            <p>{t("Define the subject and all conditions. An incomplete or unapproved lifetime draft cannot be published or issued.", "حدد موضوع التغطية وكل شروطها. لا يمكن نشر أو إصدار مسودة مدى الحياة الناقصة أو غير المعتمدة.")}</p>
            <label className="field-label" htmlFor="wp-subject">{t("Lifetime subject", "موضوع التغطية مدى الحياة")}</label>
            <select id="wp-subject" className="field-select" value={policyForm.lifetimeSubject} onChange={(event) => setPolicyForm({ ...policyForm, lifetimeSubject: event.target.value as LifetimeDefinition["subject"], lifetimeApproved: false })}><option value="purchaser">{t("Purchaser", "المشتري")}</option><option value="vehicle">{t("Vehicle", "المركبة")}</option><option value="ownership">{t("Ownership", "الملكية")}</option><option value="product">{t("Product", "المنتج")}</option><option value="other">{t("Other", "أخرى")}</option></select>
            {([
              ["lifetimeSubjectDefinition", "Subject definition", "تعريف الموضوع"],
              ["lifetimeTerminationConditions", "Termination conditions", "شروط انتهاء التغطية"],
              ["lifetimeTransferRule", "Transfer rule", "قاعدة نقل التغطية"],
              ["lifetimeMaintenanceConditions", "Maintenance conditions", "شروط الصيانة"],
              ["lifetimeIssuer", "Issuer", "جهة الإصدار"],
              ["lifetimeRemedy", "Remedy", "المعالجة"],
              ["lifetimePublicEn", "Approved public wording (English)", "الصياغة العامة المعتمدة بالإنجليزية"],
              ["lifetimePublicAr", "Approved public wording (Arabic)", "الصياغة العامة المعتمدة بالعربية"],
              ["lifetimeEvidenceRef", "Approval evidence reference", "مرجع إثبات الموافقة"],
              ["lifetimeApprovalReason", "Approval reason", "سبب الموافقة"],
            ] as const).map(([key, en, ar]) => <label key={key} className="field-label">{t(en, ar)}<textarea className="field-textarea" value={policyForm[key]} onChange={(event) => setPolicyForm({ ...policyForm, [key]: event.target.value, lifetimeApproved: false })} /></label>)}
            <label className="w-check"><input type="checkbox" checked={policyForm.lifetimeApproved} onChange={(event) => setPolicyForm({ ...policyForm, lifetimeApproved: event.target.checked })} /><span>{t("I am the Owner and approve this complete bilingual lifetime definition.", "أنا المالك وأوافق على تعريف التغطية مدى الحياة الكامل باللغتين.")}</span></label>
          </div>}
          <div><label className="field-label" htmlFor="wp-start">{t("Coverage start rule", "التغطية تبدأ إمتى")} *</label>
            <select id="wp-start" className="field-select" required value={policyForm.startRule} onChange={(event) => setPolicyForm({ ...policyForm, startRule: event.target.value as PolicyFormState["startRule"] })}>
              <option value="">{t("Not decided — choose a rule", "لسه ماتحددش — اختار قاعدة")}</option>
              <option value="job-delivery">{t("Recorded Cairo-local job delivery date", "تاريخ تسليم أمر الشغل المسجل بتوقيت القاهرة")}</option>
              <option value="owner-selected-date">{t("Owner-selected start date", "تاريخ بداية يحدده المالك")}</option>
            </select>
          </div>
          <div><label className="field-label" htmlFor="wp-response">{t("Response target (days)", "الرد خلال كام يوم")} *</label><input id="wp-response" className="field-input" type="number" min="1" max="365" required placeholder={templateMode ? t("Not set — Owner must decide", "لسه ماتحددش — المالك هو اللي يقرر") : ""} value={policyForm.responseDays} onChange={(event) => setPolicyForm({ ...policyForm, responseDays: event.target.value })} /></div>
          <div className="w-field-full"><span className="field-label">{t("Eligible services", "الخدمات المؤهلة")} *</span>
            {state.services.length ? <div className="w-checklist">{state.services.map((service) => <label className="w-check" key={service.id}>
              <input type="checkbox" checked={policyForm.eligibleServiceIds.includes(service.id)} onChange={(event) => setPolicyForm({
                ...policyForm, eligibleServiceIds: event.target.checked
                  ? [...policyForm.eligibleServiceIds, service.id]
                  : policyForm.eligibleServiceIds.filter((id) => id !== service.id),
              })} /><span>{serviceDisplay(service.name, lang)}</span>
            </label>)}</div> : <div className="w-hold"><AlertTriangle size={16} />{t("No services are available to select. Policy publishing is on hold until services are configured.", "مفيش خدمات متاحة للاختيار. نشر السياسة موقوف لحد ما الخدمات تتجهز.")}</div>}
          </div>
          <div className="w-field-full">
            <label className="w-check">
              <input type="checkbox" checked={policyForm.autoIssue} onChange={(event) => setPolicyForm({ ...policyForm, autoIssue: event.target.checked })} />
              <span><strong>{t("Automatically issue coverage when eligible work is delivered", "إصدار التغطية تلقائياً عند تسليم شغل مؤهل")}</strong><br />{t("This policy must use the recorded job delivery date. Only a published Owner-approved policy can issue coverage.", "السياسة دي لازم تبدأ من تاريخ تسليم أمر الشغل المسجل. السياسة المنشورة والمعتمدة من المالك فقط هي اللي تصدر تغطية.")}</span>
            </label>
            {policyForm.autoIssue && policyForm.startRule !== "job-delivery" && <div className="w-error" role="alert">{t("Choose the recorded delivery date to enable automatic issuance.", "اختار تاريخ التسليم المسجل عشان تفعّل الإصدار التلقائي.")}</div>}
          </div>
          <div className="w-field-full"><label className="field-label" htmlFor="wp-exclusions">{t("Exclusions", "الاستثناءات")} *</label><textarea id="wp-exclusions" className="field-textarea" required maxLength={3000} placeholder={templateMode ? t("Not set — specify what is outside coverage", "لسه ماتحددتش — اكتب الحاجات اللي مش داخلة في التغطية") : ""} value={policyForm.exclusions} onChange={(event) => setPolicyForm({ ...policyForm, exclusions: event.target.value })} /></div>
          <div className="w-field-full"><label className="field-label" htmlFor="wp-evidence">{t("Evidence required for a claim", "الأدلة المطلوبة للمطالبة")} *</label><textarea id="wp-evidence" className="field-textarea" required maxLength={3000} placeholder={templateMode ? t("Not set — define evidence and supporting details", "لسه ماتحددتش — اكتب الأدلة والتفاصيل المطلوبة") : ""} value={policyForm.evidenceRequirements} onChange={(event) => setPolicyForm({ ...policyForm, evidenceRequirements: event.target.value })} /></div>
          <div><label className="field-label" htmlFor="wp-review">{t("Claim review assigned to", "مين هيراجع المطالبة")} *</label><select id="wp-review" className="field-select" required value={policyForm.reviewRole} onChange={(event) => setPolicyForm({ ...policyForm, reviewRole: event.target.value as PolicyFormState["reviewRole"] })}>
            <option value="">{t("Not decided — choose a reviewer", "لسه ماتحددش — اختار مين يراجع")}</option>
            <option value="owner">{t("Owner only", "المالك بس")}</option><option value="branch-manager">{t("Owner or Branch Manager", "المالك أو مدير الفرع")}</option>
          </select></div>
        </div>
        {policyForm.coverageKind === "fixed" && <p className="w-inline-note"><CalendarClock size={13} /> {t("Expiry calculation: the last covered day is one day before the anniversary of the start date. For a Cairo-local delivery start, the recorded delivery calendar date is used.", "حساب الانتهاء: آخر يوم في التغطية بيكون اليوم اللي قبل ذكرى تاريخ البداية. ولو البداية من تاريخ تسليم العربية بتوقيت القاهرة، بنستخدم تاريخ التسليم المسجل.")}</p>}
        {policyError && <div className="w-error" role="alert">{policyError}</div>}
        <div className="w-form-actions"><button className="btn" type="button" onClick={() => { discardPolicyDraft(); setShowPolicyForm(false); setPolicyError(""); }}>{t("Discard and exit", "تجاهل واخرج")}</button><button className="btn btn-primary" type="submit" disabled={savingPolicy || !state.services.length || !policyForm.eligibleServiceIds.length}>{savingPolicy ? t("Saving…", "بنحفظ…") : t("Save draft", "احفظ المسودة")}</button></div>
      </PolicyEditor>}
      {visiblePolicies.length ? <div className="w-policy-grid">{visiblePolicies.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((policy) => <PolicySummary key={`${policy.policyId}:${policy.version}`} policy={policy} status={labelStatus(policy.status)} kind={policy.coverageKind === "lifetime" ? t("Lifetime", "مدى الحياة") : t("Fixed", "محدد المدة")} detailLabel={t("Terms and actions", "الشروط والإجراءات")} primaryAction={policy.status === "draft" ? <button type="button" className="btn btn-sm btn-primary" onClick={() => startPolicyEdit(policy)}>{t("Edit draft", "عدل المسودة")}</button> : policy.status === "published" ? <button type="button" className="btn btn-sm" onClick={() => void duplicatePolicy(policy, "next-version")}>{t("Duplicate as new version", "انسخ كإصدار جديد")}</button> : undefined}>
        <div className="w-policy-terms">
          <div className="w-term"><strong>{t("Duration", "المدة")}</strong>{policy.coverageKind === "lifetime" ? t("Lifetime under approved conditions", "مدى الحياة وفق شروط معتمدة") : `${policy.durationMonths} ${t("months", "أشهر")}`}</div>
          {policy.coverageKind === "lifetime" && policy.lifetimeDefinition?.state === "approved" && <div className="w-term"><strong>{t("Approved public wording", "الصياغة العامة المعتمدة")}</strong>{policy.lifetimeDefinition.value.publicWording[lang]}</div>}
           <div className="w-term"><strong>{t("Issuance", "الإصدار")}</strong>{policy.autoIssue ? t("Automatic after delivery", "تلقائي بعد التسليم") : t("Manual by authorised staff", "يدوي بواسطة موظف مصرح له")}</div>
          <div className="w-term"><strong>{t("Starts", "البداية")}</strong>{policy.startRule === "job-delivery" ? t("Cairo-local delivery", "تاريخ التسليم بتوقيت القاهرة") : t("Owner-selected date", "تاريخ يحدده المالك")}</div>
          <div className="w-term"><strong>{t("Eligible services", "الخدمات المؤهلة")}</strong>{policy.eligibleServiceIds.map(serviceName).join("، ") || "—"}</div>
          <div className="w-term"><strong>{t("Review role · response", "مين هيراجع · مدة الرد")}</strong>{policy.reviewRole === "owner" ? t("Owner only", "المالك بس") : t("Owner or manager", "المالك أو المدير")} · {policy.responseDays} {t("days", "يوم")}</div>
          <div className="w-term"><strong>{t("Exclusions", "الاستثناءات")}</strong>{policy.exclusions || "—"}</div>
          <div className="w-term"><strong>{t("Required evidence", "الأدلة المطلوبة")}</strong>{policy.evidenceRequirements || "—"}</div>
        </div>
        <div className="w-card-actions">
          {policy.status !== "draft" && <button type="button" className="btn btn-sm" onClick={() => void duplicatePolicy(policy, "new-policy")}><FilePlus2 size={13} />{t("Duplicate as new policy", "انسخ كسياسة جديدة")}</button>}
          {policy.status === "published" && <button type="button" className="btn btn-sm" onClick={() => void retirePolicy(policy)}>{t("Retire version", "أوقف الإصدار")}</button>}
          {policy.status === "draft" && <button type="button" className="btn btn-sm btn-primary" disabled={!policy.name.trim() || !policy.eligibleServiceIds.length || !policy.startRule || (policy.autoIssue && policy.startRule !== "job-delivery") || (policy.coverageKind === "lifetime" ? policy.lifetimeDefinition?.state !== "approved" : !policy.durationMonths || Number(policy.durationMonths) < 1) || !policy.exclusions.trim() || !policy.evidenceRequirements.trim() || !policy.reviewRole || !policy.responseDays || Number(policy.responseDays) < 1} onClick={() => { setPublishTarget(`${policy.policyId}:${policy.version}`); setPublishConfirmed(false); setPolicyError(""); }}><BadgeCheck size={13} />{t("Review & publish", "مراجعة ونشر")}</button>}
        </div>
        {publishTarget === `${policy.policyId}:${policy.version}` && <div className="w-detail-box">
          <label className="w-check"><input type="checkbox" checked={publishConfirmed} onChange={(event) => setPublishConfirmed(event.target.checked)} />
            <span>{t("I am the Owner and explicitly approve these complete Go Stores coverage terms for publication.", "أنا المالك وبوافق صراحة على شروط تغطية Go Stores كاملة ونشرها.")}</span>
          </label>
          <p>{policy.coverageKind === "lifetime" ? t("Publishing locks the approved lifetime definition and bilingual public wording. Claims still require review against its conditions.", "النشر يثبت تعريف التغطية مدى الحياة والصياغة العامة باللغتين. المطالبات تظل خاضعة لمراجعة الشروط.") : t("Publishing locks this version. Expiry is the final covered day before the start-date anniversary.", "بعد النشر مش هينفع تعدّل الإصدار ده. آخر يوم في التغطية هو اليوم اللي قبل ذكرى تاريخ البداية.")}</p>
          {policyError && <div className="w-error" role="alert">{policyError}</div>}
          <div className="w-card-actions"><button className="btn btn-sm" type="button" onClick={() => { setPublishTarget(null); setPublishConfirmed(false); }}>{t("Cancel", "إلغاء")}</button><button className="btn btn-sm btn-primary" type="button" disabled={!publishConfirmed || publishing} onClick={() => void publishPolicy(policy)}>{publishing ? t("Publishing…", "بننشر…") : t("Publish approved version", "انشر الإصدار المعتمد")}</button></div>
        </div>}
      </PolicySummary>)}</div> : <EmptyState title={t("No warranty policy versions", "مفيش إصدارات لسياسة ضمان")} text={t("Start with an empty draft. Terms are never pre-approved or silently published.", "ابدأ بمسودة فاضية. مافيش شروط بتتوافق أو تتنشر من غير موافقة.")} />}
    </>}

    {tab === "coverage" && <>
      {!publishedPolicies.length && <div className="w-hold"><AlertTriangle size={17} /><div><strong>{t("General issuance is on hold", "الإصدار العام موقوف مؤقتاً")}</strong><br />{t("No current policy is published. An exact retired version from a previously accepted component may require an Owner-approved exception; the server checks that authority.", "لا توجد سياسة حالية منشورة. الإصدار المتقاعد المرتبط بمكون مقبول سابقاً قد يتطلب استثناءً معتمداً من المالك؛ الخادم يتحقق من الصلاحية.")}</div></div>}
      <form className="w-form w-section-gap" onSubmit={(event) => void submitIssue(event)}>
        <h2 className="w-form-title">{t("Issue coverage for delivered work", "اعمل تغطية لشغل اتسلم")}</h2>
        <p className="w-form-desc">{t("Only delivered jobs, eligible services and your permitted branches are available here.", "هنا هتلاقي أوامر الشغل اللي اتسلمت، والخدمات المؤهلة، والفروع المسموح لك تدخلها بس.")}</p>
        <p className="w-inline-note" role="status">{t("Guided step", "الخطوة الموجهة")} {!issuePolicy ? `1/3 · ${t("Policy", "السياسة")}` : !issueJob ? `2/3 · ${t("Delivered job", "أمر الشغل المسلّم")}` : `3/3 · ${t("Binding and confirmation", "الرابط والتأكيد")}`}</p>
        {deliveredEligibleJobs.length ? <div className="w-form-grid">
          <div><label htmlFor="issue-policy" className="field-label">{t("Policy version", "إصدار السياسة")} *</label><select id="issue-policy" className="field-select" required value={issuePolicy} onChange={(event) => { setIssuePolicy(event.target.value); setIssueJob(""); setIssueComponent(""); setIssueDate(""); setIssueError(t("Policy version changed; choose an eligible job and binding again.", "إصدار السياسة اتغير؛ اختار أمر شغل ورابط مؤهل من جديد.")); }}>
            <option value="">{t("Choose policy version", "اختار إصدار السياسة")}</option>{state.warrantyPolicies.filter((policy) => policy.status === "published" || policy.status === "retired").map((policy) => <option key={`${policy.policyId}:${policy.version}`} value={`${policy.policyId}:${policy.version}`}>{policy.name} · v{policy.version} · {labelStatus(policy.status)}</option>)}
          </select></div>
          {issuePolicy && <div><label htmlFor="issue-job" className="field-label">{t("Delivered job", "أمر العمل المسلّم")} *</label><select id="issue-job" className="field-select" required value={issueJob} onChange={(event) => { setIssueJob(event.target.value); setIssueError(t("Job changed; choose its component and start date again.", "أمر الشغل اتغير؛ اختار المكون وتاريخ البداية من جديد.")); }}>
            <option value="">{t("Choose eligible job", "اختار أمر شغل مؤهل")}</option>{eligibleIssueJobs.map((job) => <option key={job.id} value={job.id}>{customerName(job.customerId)} · {serviceName(job.serviceId)} · {branchName(job.branchId)} · {job.id}</option>)}
          </select></div>}
          {selectedBooking?.acceptedQuoteRef && <div><label htmlFor="issue-component" className="field-label">{t("Accepted bundle component", "المكون المقبول في الحزمة")} *</label><select id="issue-component" className="field-select" required value={issueComponent} onChange={(event) => { setIssueComponent(event.target.value); setIssueError(""); }}><option value="">{t("Choose bound component", "اختار المكون المرتبط")}</option>{boundComponents.map((binding) => <option key={binding.componentId} value={binding.componentId}>{binding.componentId}</option>)}</select></div>}
          {currentIssuePolicy?.startRule === "owner-selected-date" && <div><label htmlFor="issue-date" className="field-label">{t("Owner-selected coverage start", "تاريخ بداية التغطية اللي حدده المالك")} *</label><input id="issue-date" className="field-input" type="date" required value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
            {issueDate && <p className="w-inline-note">{currentIssuePolicy.coverageKind === "lifetime" ? t("Lifetime under approved conditions; no fixed expiry", "مدى الحياة وفق شروط معتمدة؛ بدون تاريخ انتهاء محدد") : <>{t("Last covered day", "آخر يوم في التغطية")}: <strong>{currentIssuePolicy.durationMonths ? expiryPreview(issueDate, currentIssuePolicy.durationMonths) || "—" : "—"}</strong></>}</p>}</div>}
        </div> : <div className="w-empty-symbol"><Wrench size={18} /><p className="w-inline-note">{t("No eligible delivered jobs are available for the published policies in your branch scope.", "مفيش أوامر شغل مؤهلة واتسلمت للسياسات المنشورة ضمن الفروع المتاحة لحسابك.")}</p></div>}
        {issueError && <div className="w-error" role="alert">{issueError}</div>}
        <div className="w-form-actions"><button className="btn" type="button" disabled={issuing} onClick={() => { discardIssueFields(); discardIssueSelection(); setIssueError(""); }}>{t("Discard selection", "تجاهل الاختيار")}</button><button className="btn btn-primary" type="submit" aria-describedby={issueReason ? "w-issue-reason" : undefined} disabled={Boolean(issueReason)}>{issuing ? t("Issuing…", "بنجهّز الضمان…") : t("Issue warranty", "اعمل الضمان")}</button></div>
        {issueReason && <p id="w-issue-reason" className="w-inline-note" role="status">{issueReason}</p>}
        {currentIssuePolicy?.status === "retired" && currentRetiredOutcome === "approved" && <p className="w-inline-note" role="status">{t("The exact accepted issuance authority permits this retired version. The server will verify it again on issue.", "صلاحية الإصدار المقبولة تسمح بالإصدار المتقاعد ده. الخادم هيتحقق منها تاني عند الإصدار.")}</p>}
      </form>
      {isReception && <p className="w-inline-note"><LockKeyhole size={13} />{t("Reception can search records and open claims. Issuing coverage, changing policies and voiding records are restricted.", "الاستقبال يقدر يدور في السجلات ويفتح مطالبات. إصدار التغطية وتغيير السياسات وإلغاء السجلات صلاحيات محدودة.")}</p>}
      <div className="w-filterbar w-section-gap"><SectionTitle title={t("Warranty records", "سجلات الضمان")} description={t("Records shown only for branches available to your account and current branch selection.", "السجلات بتظهر للفروع المتاحة لحسابك والفرع المختار دلوقتي بس.")} />
        <label className="w-coverage-filter"><span>{t("Coverage status", "حالة التغطية")}</span><select className="field-select" value={coverageStatusFilter} onChange={(event) => setCoverageStatusFilter(event.target.value as WarrantyRecord["status"] | "all")}>
          <option value="all">{t("All statuses", "كل الحالات")}</option>
          <option value="active">{t("Active", "ساري")}</option>
          <option value="expired">{t("Expired", "منتهي")}</option>
          <option value="terminated">{t("Terminated", "انتهت التغطية")}</option>
          <option value="void">{t("Void", "ملغي")}</option>
        </select></label>
        <label className="search-wrap"><Search size={16} /><span className="sr-only">{t("Search warranty records", "دوّر في سجلات الضمان")}</span><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search customer, plate, policy or job…", "دوّر بالعميل أو اللوحة أو السياسة أو أمر الشغل…")} /></label></div>
      {filteredWarranties.length ? <div className="w-record-list">{filteredWarranties.map((record) => {
        const customer = customerFor(state, record.customerId);
        const vehicle = vehicleFor(state, record.customerId, record.vehicleId);
        const job = state.jobs.find((item) => item.id === record.jobId);
        const jobHistory = state.jobEvents.filter((event) => event.jobId === record.jobId)
          .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
        const qrEvents = state.warrantyQrPrintEvents.filter((event) => event.warrantyId === record.id)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        return <CoverageDetail key={record.id} record={record} title={customer ? customerDisplay(customer.name, lang) : "—"} status={labelStatus(record.status)} detailLabel={t("Coverage, history and invoice", "التغطية والسجل والفاتورة")} primaryAction={record.status !== "void" ? <button className="btn btn-sm" type="button" onClick={() => { setClaimWarrantyId(record.id); setClaimError(""); setTab("claims"); }}><ClipboardCheck size={13} />{t("Open claim", "افتح مطالبة")}</button> : undefined}>
          <div className="w-record-main">
            <div className="w-record-detail"><span>{vehicle?.makeModel ?? "—"}</span><span className="mono">{vehicle?.plate ?? "—"}</span><span>{serviceName(record.serviceId)}</span><span>{branchName(record.branchId)}</span><span>{t("Job", "أمر الشغل")} <bdi>{record.jobId}</bdi></span></div>
            <div className="w-job-history">
              <strong>{t("Work history", "سجل الشغل")}</strong>
              <span>{job ? `${labelStatus(job.stage)} · ${formatDateTime(job.updatedAt, lang)}` : t("Job record unavailable", "سجل أمر الشغل مش متاح")}</span>
              {jobHistory.slice(0, 5).map((event) => <span key={event.id}>{labelStatus(event.nextStage)} · {event.actorLabel} · {formatDateTime(event.occurredAt, lang)}</span>)}
            </div>
            <div className="w-qr-ledger">
              <div><strong>{t("Customer QR card", "كارت QR للعميل")}</strong><span>{record.verificationTokenActive ? t("Active code prepared", "الرمز جاهز وشغال") : qrEvents.length ? t("No active code", "مفيش رمز شغال") : t("Not prepared", "لسه ماتجهزش")}</span></div>
              {qrEvents.length ? <ul>{qrEvents.slice(0, 5).map((event) => <li key={event.id}>
                <span>{qrActionLabel(event.action)}</span><small>{formatDateTime(event.createdAt, lang)} · {event.actorLabel}</small>
                {event.replacesTokenId && <small>{t("Replaced token", "الرمز المستبدل")}: <bdi>{event.replacesTokenId}</bdi></small>}
              </li>)}</ul> : <p>{t("No QR preparation or print events recorded.", "مفيش سجل لتجهيز أو طباعة رمز QR.")}</p>}
            </div>
            {record.status === "void" && record.voidReason && <div className="w-detail-box">{t("Void reason", "سبب الإلغاء")}: {record.voidReason}</div>}
          </div>
          <div className="w-record-side"><span className="w-record-dates"><span>{t("Starts", "البداية")}<strong>{record.startDate}</strong></span><span>{record.coverageKind === "lifetime" ? t("Lifetime terms", "شروط مدى الحياة") : t("Expires", "الانتهاء")}<strong>{record.coverageKind === "lifetime" ? record.terminatedOn ? `${t("Terminated", "انتهت التغطية")}: ${record.terminatedOn}` : t("Subject to approved conditions", "وفق الشروط المعتمدة") : record.expiresOn}</strong></span></span><div className="w-actions">
             {isOwner && record.status !== "void" && <button className="btn btn-sm btn-danger" type="button" onClick={() => { setVoidingId(voidingId === record.id ? null : record.id); setVoidReason(""); setVoidError(""); }}><AlertTriangle size={13} />{t("Void", "إلغاء")}</button>}
          </div></div>
          {voidingId === record.id && <form className="w-detail-box" onSubmit={(event) => void submitVoid(event)}>
            <label className="field-label" htmlFor={`void-${record.id}`}>{t("Reason for voiding this warranty", "ليه عايز تلغي الضمان ده")} *</label><textarea id={`void-${record.id}`} className="field-textarea" required maxLength={1000} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
            {voidError && <div className="w-error" role="alert">{voidError}</div>}<div className="w-card-actions"><button className="btn btn-sm" type="button" onClick={() => setVoidingId(null)}>{t("Cancel", "إلغاء")}</button><button className="btn btn-sm btn-danger" type="submit" disabled={savingVoid || !voidReason.trim()}>{savingVoid ? t("Saving…", "بنحفظ…") : t("Confirm void", "أكد الإلغاء")}</button></div>
          </form>}
          <WarrantyInvoicePanel
            warranty={record}
            locale={lang}
            customerName={customer ? customerDisplay(customer.name, lang) : "—"}
            vehicleLabel={vehicle ? `${vehicle.makeModel} · ${vehicle.plate}` : "—"}
            serviceLabel={serviceName(record.serviceId)}
            branchLabel={branchName(record.branchId)}
          />
        </CoverageDetail>;
      })}</div> : <EmptyState title={query ? t("No matching warranty records", "مفيش سجلات ضمان مطابقة") : coverageStatusFilter !== "all" ? t("No warranty records match this status", "مفيش سجلات ضمان بالحالة دي") : t("No warranty records yet", "لسه مافيش سجلات ضمان")}
        text={query || coverageStatusFilter !== "all" ? t("Change the search or status filter.", "غيّر البحث أو فلتر الحالة.") : t("Coverage records appear only after a permitted user issues a published policy against an eligible delivered job.", "سجلات التغطية بتظهر بس لما مستخدم عنده صلاحية يعمل تغطية بسياسة منشورة لأمر شغل مؤهل واتسلم.")} />}
    </>}

    {tab === "verification" && <>
      <SectionTitle title={t("Customer QR verification", "تحقق العميل برمز QR")}
        description={t("Prepare a printed card that opens the same customer view used by the live verification page.", "جهّز كارت مطبوع يفتح نفس شاشة العميل اللي بتظهر عند التحقق الفعلي.")} />
      {isOwner ? <section className="w-verify-settings">
        <div className="w-verify-settings-head">
          <div><span className="w-verify-kicker">{t("Owner controls", "إعدادات المالك")}</span>
            <h2>{t("Public verification", "التحقق العام")}</h2>
            <p>{t("It stays off until you explicitly enable it. Only the selected safe fields can appear to customers.", "الخدمة دي بتفضل مقفولة لحد ما تفعّلها بنفسك. الحقول الآمنة اللي تختارها بس هي اللي هتظهر للعميل.")}</p></div>
          <label className="w-verify-switch">
            <input type="checkbox" checked={verificationEnabled} onChange={(event) => setVerificationEnabled(event.target.checked)} />
            <span>{verificationEnabled ? t("Enabled", "مفعّل") : t("Off", "مقفول")}</span>
          </label>
        </div>
        <fieldset className="w-verify-fields" disabled={!verificationEnabled}>
          <legend>{t("Fields customers may see", "الحقول اللي ممكن تظهر للعميل")}</legend>
          {verificationFields.map((field) => <label className="w-verify-field" key={field.key}>
            <input type="checkbox" checked={approvedFields.includes(field.key)} onChange={(event) => setApprovedFields((current) =>
              event.target.checked ? [...current, field.key] : current.filter((item) => item !== field.key))} />
            <span>{t(field.en, field.ar)}</span>
          </label>)}
        </fieldset>
        {verificationEnabled && (!approvedFields.includes("service") || !approvedFields.includes("status")) &&
          <p className="w-verify-required" role="status">{t(
            "Service and coverage status are required fields. Select both before enabling public verification.",
            "الخدمة وحالة الضمان حقلين أساسيين. اختار الاتنين قبل تفعيل التحقق العام.",
          )}</p>}
        <p className="w-inline-note">{t("Customer name, contact details, full plate and internal job information are never shown.", "اسم العميل وبيانات التواصل ورقم اللوحة الكامل ومعلومات أمر الشغل الداخلية مش هتظهر أبداً.")}</p>
        {verificationError && <div className="w-error" role="alert">{verificationError}</div>}
        <div className="w-form-actions"><button className="btn" type="button" disabled={savingVerificationSettings} onClick={discardVerificationDraft}>{t("Discard changes", "تجاهل التغييرات")}</button><button className="btn btn-primary" type="button" disabled={savingVerificationSettings ||
          (verificationEnabled && (!approvedFields.includes("service") || !approvedFields.includes("status")))} onClick={() => void saveVerificationSettings()}>
          {savingVerificationSettings ? t("Saving…", "بنحفظ…") : t("Save verification settings", "احفظ إعدادات التحقق")}
        </button></div>
      </section> : <div className={`w-hold ${state.warrantyVerificationSettings?.enabled ? "" : "w-verify-inactive"}`}>
        <LockKeyhole size={16} /><span>{state.warrantyVerificationSettings?.enabled
          ? t("The Owner controls which customer-safe fields are approved. QR codes can be prepared only after fields are approved.", "المالك هو اللي بيحدد الحقول الآمنة المعتمدة للعميل. تحضير رمز QR متاح بعد اعتماد الحقول.")
          : t("Public verification is currently off. The Owner must enable it and approve the fields before a QR card can be prepared.", "التحقق العام مقفول حالياً. لازم المالك يفعّله ويعتمد الحقول قبل تجهيز كارت QR.")}</span>
      </div>}

      {!publicVerificationReady
        ? <div className="w-verify-empty">
          <div className="w-empty-symbol"><QrCode size={19} /></div>
          <strong>{t("No customer QR cards are available yet", "لسه مافيش كروت QR للعملاء")}</strong>
          <p>{t("The Owner must enable verification and approve both Service and Coverage status. Nothing is shown publicly before approval.", "لازم المالك يفعّل التحقق ويعتمد الخدمة وحالة الضمان. مفيش بيانات بتظهر للعامة قبل الموافقة.")}</p>
        </div> : <>
          {verificationError && !isOwner && <div className="w-error" role="alert">{verificationError}</div>}
          {accessibleWarranties.length ? <div className="w-verify-records">
            {accessibleWarranties.map((record) => {
              const customer = customerFor(state, record.customerId);
              const liveCode = activeVerification?.warrantyId === record.id ? activeVerification : null;
              const showPreview = previewWarrantyId === record.id || Boolean(liveCode);
              return <article className="w-verify-record" key={record.id}>
                <div className="w-verify-record-head">
                  <div><strong>{customer ? customerDisplay(customer.name, lang) : "—"}</strong><span>{record.policyName} · {serviceName(record.serviceId)} · {branchName(record.branchId)}</span></div>
                  <span className={`w-badge ${record.verificationTokenActive ? "active" : "retired"}`}>{record.verificationTokenActive ? t("Code active", "الرمز شغال") : t("No active code", "مفيش رمز شغال")}</span>
                </div>
                <div className="w-verify-record-actions">
                  {canPrepareVerification && <button className="btn btn-sm btn-primary" type="button" disabled={creatingVerificationFor === record.id}
                    onClick={() => {
                      if (record.verificationTokenActive && !window.confirm(t("Creating a replacement invalidates the previous printed QR. Continue?", "إنشاء رمز بديل هيوقف الرمز المطبوع القديم. تكمل؟"))) return;
                      void createVerification(record);
                    }}>
                    <QrCode size={14} />{creatingVerificationFor === record.id ? t("Preparing…", "بنجهّز…") : record.verificationTokenActive ? t("Replace QR code", "استبدل رمز QR") : t("Prepare QR card", "جهّز كارت QR")}
                  </button>}
                  {isOwner && record.verificationTokenActive && <button className="btn btn-sm btn-danger" type="button" disabled={revokingVerificationFor === record.id}
                    onClick={() => void revokeVerification(record)}><RotateCcw size={13} />{revokingVerificationFor === record.id ? t("Revoking…", "بنلغي…") : t("Revoke code", "إلغاء الرمز")}</button>}
                  <button className="btn btn-sm" type="button" aria-expanded={showPreview} disabled={Boolean(liveCode)} onClick={() =>
                    setPreviewWarrantyId(showPreview ? null : record.id)}>
                    <BadgeCheck size={13} />{liveCode ? t("Customer view open", "شاشة العميل مفتوحة") : showPreview ? t("Hide customer view", "إخفاء شاشة العميل") : t("Preview customer view", "عاين شاشة العميل")}
                  </button>
                </div>
                {record.verificationTokenActive && !liveCode && <p className="w-inline-note">{t("The token is not stored in this browser. Prepare a replacement to view or print another copy; the current QR remains active until then.", "الرمز مش محفوظ في المتصفح. جهّز رمز بديل عشان تشوف أو تطبع نسخة؛ الرمز الحالي يفضل شغال لحد وقتها.")}</p>}
                {showPreview && <div className={`w-verify-print-area ${liveCode ? "" : "preview-only"}`}>
                  {liveCode && <div className="w-verify-print-toolbar">
                    <p>{t("This one-time code is held only in this page memory. Save or print the card now.", "الرمز ده موجود في ذاكرة الصفحة بس. احفظ أو اطبع الكارت دلوقتي.")}</p>
                    <button className="btn btn-sm" type="button" disabled={printingVerificationFor === record.id} onClick={() => void printVerification(record)}>
                      <Printer size={14} />{printingVerificationFor === record.id ? t("Logging print…", "بنسجل الطباعة…") : t("Print QR card", "اطبع كارت QR")}
                    </button>
                  </div>}
                  <div className="w-verify-customer-preview">
                    <div className="w-verify-preview-label">{t("Customer scan preview", "معاينة شاشة العميل")}{!liveCode && ` · ${t("view only", "عرض فقط")}`}</div>
                    <div className="w-verify-print-card">
                      {liveCode && <div className="w-verify-qr">
                        <QRCodeSVG value={`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/warranty/verify/${encodeURIComponent(liveCode.token)}`} size={150} level="H" includeMargin />
                        <small>{t("Scan to verify", "امسح للتحقق")}</small>
                      </div>}
                    <WarrantyVerificationCard data={verificationPreview(record)} lang={lang} />
                    </div>
                  </div>
                  {liveCode && <p className="w-verify-replace-warning">{t("Replacing this code invalidates every previous printed QR card.", "استبدال الرمز ده بيوقف كل كروت QR المطبوعة القديمة.")}</p>}
                </div>}
              </article>;
            })}
          </div> : <EmptyState title={t("No warranty QR cards yet", "لسه مافيش كروت QR للضمان")} text={t("No approved coverage records are available to prepare a customer QR card.", "مفيش سجلات تغطية معتمدة متاحة لتجهيز كارت QR للعميل.")} />}
        </>}
    </>}

    {tab === "claims" && <>
      {claimWarrantyId && <form className="w-form" onSubmit={(event) => void submitClaim(event)}>
        <h2 className="w-form-title">{t("Open a warranty claim", "افتح مطالبة ضمان")}</h2>
        <p className="w-form-desc">{t("A reviewer will assess the claim against the exact policy version attached to this record.", "المراجع هيقيّم المطالبة حسب إصدار السياسة المرتبط بالسجل ده.")}</p>
          <div className="w-form-grid"><div className="w-field-full"><label className="field-label" htmlFor="claim-summary">{t("What issue is being claimed?", "إيه المشكلة اللي بتقدم فيها المطالبة؟")} *</label><textarea id="claim-summary" className="field-textarea" required minLength={5} maxLength={2000} value={claimSummary} onChange={(event) => setClaimSummary(event.target.value)} /></div>
           <div className="w-field-full"><label className="field-label" htmlFor="claim-evidence">{t("Evidence and supporting details", "الأدلة والتفاصيل اللي بتدعم المطالبة")} *</label><textarea id="claim-evidence" className="field-textarea" required minLength={5} maxLength={3000} value={claimEvidence} onChange={(event) => setClaimEvidence(event.target.value)} />
            {(() => { const record = state.warranties.find((item) => item.id === claimWarrantyId); const policy = record && getPolicyForWarranty(state, record); return policy ? <p className="w-inline-note">{t("Policy evidence requirement", "الأدلة المطلوبة حسب السياسة")}: {policy.evidenceRequirements}</p> : null; })()}
          </div>
        </div>
        {claimError && <div className="w-error" role="alert">{claimError}</div>}<div className="w-form-actions"><button className="btn" type="button" onClick={() => { discardClaimDraft(); setClaimWarrantyId(""); setClaimError(""); }}>{t("Cancel", "إلغاء")}</button><button className="btn btn-primary" type="submit" disabled={savingClaim || !claimSummary.trim()}>{savingClaim ? t("Submitting…", "بنبعت…") : t("Submit claim", "ابعت المطالبة")}</button></div>
      </form>}
      <div className="w-filterbar"><SectionTitle title={t("Claim intake & review", "استلام المطالبات ومراجعتها")} description={t("Claims are reviewed by a person assigned under the policy version; final decisions need a written resolution.", "الشخص المحدد في إصدار السياسة بيراجع المطالبات، والقرار النهائي لازم يكون له نتيجة مكتوبة.")} />
        <label className="search-wrap"><Search size={16} /><span className="sr-only">{t("Search claims", "دوّر على المطالبات")}</span><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search claim, customer or policy…", "دوّر بالمطالبة أو العميل أو السياسة…")} /></label></div>
      {filteredClaims.length ? <div className="w-record-list">{filteredClaims.map((claim) => {
        const record = state.warranties.find((item) => item.id === claim.warrantyId);
        const policy = record ? getPolicyForWarranty(state, record) : undefined;
        const assigned = isOwner || (isManager && policy?.reviewRole === "branch-manager");
        const reviewable = canReview && assigned && (claim.status === "open" || claim.status === "under-review");
        const canAttachEvidence = claim.status === "open" || claim.status === "under-review";
        const isSaving = reviewingId === claim.id;
        return <ClaimDetail key={claim.id} claim={claim} version={record?.policyVersion} kind={record?.coverageKind === "lifetime" ? t("Lifetime", "مدى الحياة") : t("Fixed", "محدد المدة")} status={labelStatus(claim.status)} detailLabel={t("Evidence and review", "الأدلة والمراجعة")} primaryAction={reviewable && claim.status === "open" ? <button type="button" className="btn btn-sm btn-primary" disabled={isSaving} onClick={() => void updateClaim(claim, "under-review")}>{t("Start review", "ابدأ المراجعة")}</button> : undefined}>
          {claim.evidence && <p><strong>{t("Evidence", "الأدلة")}:</strong> {claim.evidence}</p>}
          <section className="w-evidence" aria-label={t("Claim evidence attachments", "مرفقات المطالبة")}>
            <div className="w-evidence-heading"><strong><Paperclip size={13} />{t("Evidence files", "ملفات الأدلة")}</strong>
              <span>{claim.attachments?.length ?? 0}/{MAX_EVIDENCE_ATTACHMENTS}</span>
            </div>
            {claim.attachments?.length ? <ul className="w-evidence-list">
              {claim.attachments.map((attachment) => <li key={attachment.id}>
                <a className="w-evidence-download" href={`/api/warranties/claims/${encodeURIComponent(claim.id)}/attachments/${encodeURIComponent(attachment.id)}/download`} download={attachment.fileName}>
                  <Download size={13} /><span>{attachment.fileName}</span>
                </a>
                <small>{(attachment.byteSize / 1024 / 1024).toFixed(2)} MB · {t("Added by", "ضافه")} {attachment.uploadedBy} · {formatDateTime(attachment.uploadedAt, lang)}</small>
              </li>)}
            </ul> : <p className="w-evidence-empty">{t("No files attached yet.", "لسه مافيش ملفات مرفقة.")}</p>}
            {evidenceStorageReady === true && canAttachEvidence && (claim.attachments?.length ?? 0) < MAX_EVIDENCE_ATTACHMENTS && <label className="w-evidence-picker">
              <Upload size={13} />{uploadingClaimId === claim.id ? t("Uploading securely…", "بنرفع الملف بأمان…") : t("Attach a file", "ارفق ملف")}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                disabled={uploadingClaimId !== null}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void uploadClaimEvidence(claim, file);
                }}
                aria-label={t(`Attach evidence to claim ${claim.id}`, `ارفق دليل للمطالبة ${claim.id}`)}
              />
            </label>}
            {!canAttachEvidence && <div className="w-evidence-hold"><LockKeyhole size={13} />{t("This claim is finalized. New evidence cannot be attached.", "المطالبة دي انتهت، ومش ممكن تضيف أدلة جديدة.")}</div>}
            {evidenceStorageReady === false && canAttachEvidence && <div className="w-evidence-hold"><LockKeyhole size={13} />{t("Private file storage is not configured yet. Attachments are on hold; no upload will be accepted.", "التخزين الخاص للملفات لسه مش متجهز. إضافة المرفقات موقوفة، ومش هنقبل رفع ملفات دلوقتي.")}</div>}
            {evidenceStorageReady === null && <p className="w-evidence-empty">{t("Checking private storage availability…", "بنتأكد من توفر التخزين الخاص…")}</p>}
            {uploadingClaimId === claim.id && <p className="w-evidence-empty" role="status">{t("The file stays private while it uploads.", "الملف بيفضل خاص وهو بيرتفع.")}</p>}
            {evidenceUploadErrors[claim.id] && <div className="w-error" role="alert">{evidenceUploadErrors[claim.id]}</div>}
            {evidenceStorageReady === true && canAttachEvidence && <p className="w-evidence-empty">{t("JPG, PNG, WebP or PDF · up to 8 MB each. Files are private and downloads require claim access.", "JPG أو PNG أو WebP أو PDF · لحد 8 ميجابايت للملف. الملفات خاصة، وتنزيلها محتاج صلاحية على المطالبة.")}</p>}
          </section>
          <div className="w-claim-sub">{t("Opened by", "فتحها")} {claim.openedBy} · {formatDateTime(claim.createdAt, lang)}{claim.reviewedBy ? ` · ${t("Reviewed by", "راجعها")} ${claim.reviewedBy}` : ""}</div>
          {claim.resolution && <div className="w-detail-box"><strong>{t("Resolution", "نتيجة المراجعة")}:</strong> {claim.resolution}</div>}
          {reviewable ? <div className="w-claim-review">
            <div><label className="field-label" htmlFor={`resolution-${claim.id}`}>{t("Written resolution for final decisions", "اكتب نتيجة القرار النهائي")}</label><textarea id={`resolution-${claim.id}`} className="field-textarea" maxLength={2000} value={reviewDrafts[reviewKey(claim)] ?? claim.resolution ?? ""} onChange={(event) => setReviewDrafts((current) => ({ ...current, [reviewKey(claim)]: event.target.value }))} placeholder={t("Required to approve, deny or close", "لازم تكتب نتيجة عشان توافق أو ترفض أو تقفل")} />
              {!assigned && <p className="w-inline-note">{t("This policy assigns review to the Owner only.", "السياسة دي مخصصة مراجعة المطالبة للمالك بس.")}</p>}
              {reviewErrors[claim.id] && <div className="w-error" role="alert">{reviewErrors[claim.id]}</div>}
            </div><div className="w-actions">
              <button type="button" className="btn btn-sm" disabled={isSaving} onClick={() => setReviewDrafts((current) => { const next = { ...current }; delete next[reviewKey(claim)]; return next; })}>{t("Discard review text", "تجاهل نص المراجعة")}</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={isSaving} onClick={() => void updateClaim(claim, "approved")}><Check size={13} />{t("Approve", "وافق")}</button>
              <button type="button" className="btn btn-sm btn-danger" disabled={isSaving} onClick={() => void updateClaim(claim, "denied")}>{t("Deny", "ارفض")}</button>
              <button type="button" className="btn btn-sm" disabled={isSaving} onClick={() => void updateClaim(claim, "closed")}>{t("Close", "اقفل")}</button>
            </div>
          </div> : (canReview && !assigned && (claim.status === "open" || claim.status === "under-review")) ? <div className="w-hold w-section-gap"><LockKeyhole size={15} />{t("On hold for your role: this policy assigns claim review to the Owner only.", "مش متاح لدورك: السياسة دي مخصصة مراجعة المطالبة للمالك بس.")}</div> : null}
        </ClaimDetail>;
      })}</div> : <EmptyState title={t("No claims in this branch scope", "مفيش مطالبات في الفروع المتاحة ليك")} text={t("Reception can open a claim from any non-void warranty record. Submitted claims will appear here for assigned human review.", "الاستقبال يقدر يفتح مطالبة من أي سجل ضمان ما اتلغاش. المطالبات هتظهر هنا عشان الشخص المسؤول يراجعها.")} />}
    </>}

    {tab === "history" && <>
      <SectionTitle title={t("Warranty history", "سجل الضمان")} description={t("Policy, coverage and claim actions are recorded with the acting person and time.", "كل إجراء على السياسات والتغطية والمطالبات بيتسجل مع اسم الشخص والوقت.")} />
      {audit.length ? <div className="w-history">{audit.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((event) => <div className="w-history-row" key={event.id}>
        <div className="w-history-date">{formatDateTime(event.occurredAt, lang)}</div><div><strong>{auditActionLabel(event.action)}</strong>{event.policyVersion ? ` · v${event.policyVersion}` : ""}<br /><span>{event.details}</span><div className="w-claim-sub">{t("By", "بواسطة")} {event.actorLabel} · {t(event.entityType === "policy" ? "Policy" : event.entityType === "warranty" ? "Warranty" : "Claim", event.entityType === "policy" ? "السياسة" : event.entityType === "warranty" ? "الضمان" : "المطالبة")} <bdi>{event.entityId}</bdi></div></div>
      </div>)}</div> : <EmptyState title={t("No warranty history yet", "لسه مافيش سجل ضمان")} text={t("Saved policy, warranty and claim actions will appear here.", "إجراءات السياسات والضمانات والمطالبات المحفوظة هتظهر هنا.")} />}
    </>}
    {isReception && <div className="w-hold w-section-gap"><FileClock size={16} /><span>{t("Reception access is limited to searching branch coverage and opening claims. Policy management, coverage issuance, voiding and claim review are unavailable.", "الاستقبال يقدر يدور على تغطية الفروع ويفتح مطالبات بس. إدارة السياسات وإصدار التغطية وإلغاء السجلات ومراجعة المطالبات مش متاحة له.")}</span></div>}
  </div>;
}
