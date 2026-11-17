import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useSavedLocale } from "./locale";
import type {
  BenefitEligibilityResult, BenefitEntitlement, EligibilityResult, FinancialMetricId, FinancialReport, FinancialSourceRow, MetricValue, MoneyEvent, MoneyEventKind, PromotionAllocation, QualificationEvidence, PolicyRef, ReportFilter, TransportRequest, TransportStatus, TransportWindow,
  AcceptedQuoteSnapshot, QuoteDraftInput, QuoteFollowup, QuoteRevision, QuoteVersionRef,
  PromotionReservation,
  BranchId, QueueItem,
  CreateBookingInput,
  CreateCustomerInput,
  GarageRole,
  GarageState,
  JobStage,
  Locale,
  IssueWarrantyInput,
  OpenWarrantyClaimInput,
  WarrantyInvoiceDraftInput,
  WarrantyClaimStatus,
  WarrantyPolicyInput,
  WarrantyVerificationSettingsInput,
} from "@garage/domain";

export type BenefitDetailData = {
  entitlement: BenefitEntitlement;
  promise: { eligibilityRule: { ar: string; en: string }; activationTrigger: string; transferRule: string; cancellationRule: string; expiryRule: { kind: string; expiresOn?: string } };
  history: Array<{ id: string; quantity: number; on_date: string; branch_id: string; fulfillment_ref: string; created_at: string; reversed: boolean }>;
};

export const benefitApi = {
  list: () => requestJson<BenefitEntitlement[]>("/api/benefits"),
  detail: (id: string) => requestJson<BenefitDetailData>(`/api/benefits/${encodeURIComponent(id)}`),
  evaluate: (input: { entitlementId: string; on: string; branchId: string }) =>
    requestJson<BenefitEligibilityResult>("/api/benefits/evaluate", { method: "POST", body: JSON.stringify(input) }),
  redeem: (input: { entitlementId: string; quantity: number; on: string; branchId: string; fulfillmentRef: string; expectedRevision: number; idempotencyKey: string }) =>
    requestJson<{ redemptionId: string; remaining: number | null }>("/api/benefits/redeem", { method: "POST", body: JSON.stringify(input) }),
  reverse: (input: { redemptionId: string; reason: string; evidenceRef: string; idempotencyKey: string }) =>
    requestJson<{ reversalId: string }>("/api/benefits/reverse", { method: "POST", body: JSON.stringify(input) }),
};

export type TransportDetailData = { request: TransportRequest; events: Array<{ revision: number; from_status: string | null; to_status: string; reason: string | null; has_evidence: boolean; occurred_at: string }> };
export const transportApi = {
  list: () => requestJson<TransportRequest[]>("/api/transport"),
  detail: (id: string) => requestJson<TransportDetailData>(`/api/transport/${encodeURIComponent(id)}`),
  contact: (id: string) => requestJson<{ contact: string; location: string; instructions: string }>(`/api/transport/${encodeURIComponent(id)}/contact`),
  request: (input: { bookingId: string; direction: "pickup" | "return" | "courtesy"; mode: "tow" | "driver" | "courtesy-car"; contact: string; location: string; instructions: string; idempotencyKey: string }) =>
    requestJson<TransportRequest>("/api/transport", { method: "POST", body: JSON.stringify(input) }),
  transition: (input: { id: string; expectedRevision: number; nextStatus: TransportStatus; providerId?: string; committedWindow?: TransportWindow; evidenceRef?: string; reason?: string; idempotencyKey: string }) =>
    requestJson<TransportRequest>("/api/transport/transitions", { method: "POST", body: JSON.stringify(input) }),
};

export const financeApi = {
  events: () => requestJson<MoneyEvent[]>("/api/finance/events"),
  record: (input: { kind: MoneyEventKind; amount: { minor: number; currency: string }; effectiveAt: string; branchId: string; customerId?: string | null; jobId?: string | null; quoteId?: string | null; reservationId?: string | null; sourceMethod: string; sourceReference: string; definition: PolicyRef; reason: string; evidenceRef: string; idempotencyKey: string }) => requestJson<{ eventId: string }>("/api/finance/events", { method:"POST",body:JSON.stringify(input) }),
  reverse: (input: { eventId: string; reason: string; evidenceRef: string; idempotencyKey: string }) => requestJson<{ reversalId: string }>("/api/finance/events/reverse", { method:"POST",body:JSON.stringify(input) }),
  attest: (input: { definition: PolicyRef; evidenceRef: string }) => requestJson<{ definition: PolicyRef; state: "attested" }>("/api/finance/definitions/attest", { method:"POST",body:JSON.stringify(input) }),
  report: (filter: ReportFilter) => requestJson<FinancialReport>(`/api/finance/report?${new URLSearchParams(Object.entries(filter)).toString()}`),
  drilldown: (filter: ReportFilter, metricId: FinancialMetricId, cursor?: string) => requestJson<{ rows: FinancialSourceRow[]; nextCursor: string | null; total: MetricValue }>(`/api/finance/drilldown?${new URLSearchParams({...filter,metricId,...(cursor?{cursor}:{})}).toString()}`),
};
export const workQueueApi={list:(input:{branchId:string;kinds?:string[]})=>requestJson<QueueItem[]>(`/api/work-queues?${new URLSearchParams({branchId:input.branchId,...(input.kinds?.length?{kinds:input.kinds.join(",")}:{})}).toString()}`)};

export const promotionApi={
  verifyMembership:(input:{promotionRef:PolicyRef;beneficiaryId:string;branchId:string;sourceRef:string;expiresAt:string|null})=>requestJson<{verificationId:string;state:"verified"}>("/api/promotions/membership-verifications",{method:"POST",body:JSON.stringify(input)}),
  revokeMembership:(verificationId:string)=>requestJson<{state:"revoked"}>("/api/promotions/membership-verifications/revoke",{method:"POST",body:JSON.stringify({verificationId})}),
  evaluate:(input:{promotionRef:PolicyRef;beneficiaryId:string;vehicleIds:string[];evidence:QualificationEvidence[]})=>requestJson<EligibilityResult>("/api/promotions/evaluate",{method:"POST",body:JSON.stringify(input)}),
  allocate:(input:{promotionRef:PolicyRef;qualificationId:string;quoteRef:QuoteVersionRef;quoteRefs?:QuoteVersionRef[];idempotencyKey:string})=>requestJson<PromotionAllocation[]>("/api/promotions/allocations",{method:"POST",body:JSON.stringify(input)}),
  detail:(id:string)=>requestJson<{allocation:PromotionAllocation;pool:{maximumUnits:number;reservedUnits:number;consumedUnits:number};history:Array<{action:string;at:string}>}>(`/api/promotions/allocations/${encodeURIComponent(id)}`),
  reverse:(input:{allocationId:string;reason:string;evidenceRef:string;idempotencyKey:string})=>requestJson<PromotionAllocation>("/api/promotions/allocations/reverse",{method:"POST",body:JSON.stringify(input)}),
};

export const warrantyAuthorityApi = {
  retired: (input: { jobId: string; componentId: string; policyId: string; policyVersion: number }) =>
    requestJson<{ outcome: "approved" | "not-retired" | "missing-accepted-binding" | "owner-exception-required" }>(
      `/api/warranties/retired-issuance-authority?${new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])).toString()}`),
};

export const quoteApi = {
  list: () => requestJson<Array<QuoteRevision & { followup: QuoteFollowup }>>("/api/quotes"),
  createRevision: (input: QuoteDraftInput) => requestJson<QuoteVersionRef>("/api/quotes/revisions", { method:"POST",body:JSON.stringify(input) }),
  readRevision: (ref: QuoteVersionRef) => requestJson<QuoteRevision>(`/api/quotes/${encodeURIComponent(ref.quoteId)}/revisions/${ref.revision}`),
  accept: (input: { ref: QuoteVersionRef; expectedDigest: string; acceptanceEvidenceRef: string; idempotencyKey: string }) => requestJson<AcceptedQuoteSnapshot>("/api/quotes/acceptances",{ method:"POST",body:JSON.stringify(input) }),
  outcome: (quoteId: string, key: string) => requestJson<AcceptedQuoteSnapshot>(`/api/quotes/${encodeURIComponent(quoteId)}/acceptance-outcomes/${encodeURIComponent(key)}`),
  followup: (input: { quoteId: string; expectedRevision: number; nextStatus: QuoteFollowup["status"]; responsibleUserId?: string | null; promisedResponseAt?: string | null }) => requestJson<{ ok: true }>("/api/quotes/followups",{ method:"POST",body:JSON.stringify(input) }),
};
export type ReservationDetailData={state:"enquiry"|"firm";reservation:PromotionReservation|null;acceptedQuote:AcceptedQuoteSnapshot;events:Array<{revision:number;action:string;reason:string|null;occurred_at:string;booking_id:string|null}>;missing:string[]};
export const reservationApi={
  list:()=>requestJson<Array<{id:string;state:"enquiry"|"firm";reservation:PromotionReservation|null;branchId:string;beneficiaryId:string;vehicleId:string}>>("/api/reservations"),
  detail:(id:string)=>requestJson<ReservationDetailData>(`/api/reservations/${encodeURIComponent(id)}`),
  reserve:(input:{quoteRef:QuoteVersionRef;promotionRef:PolicyRef;qualificationId:string|null;effectiveOn:string;idempotencyKey:string})=>requestJson<PromotionReservation>("/api/reservations",{method:"POST",body:JSON.stringify(input)}),
  schedule:(input:{reservationId:string;expectedRevision:number;slot:{dropoffDate:string;dropoffTime:string;configurationVersion?:string};idempotencyKey:string})=>requestJson<{reservation:PromotionReservation;bookingId:string}>("/api/reservations/schedule",{method:"POST",body:JSON.stringify(input)}),
  scheduleGroup:(input:{qualificationId:string;items:Array<{reservationId:string;expectedRevision:number;slot:{dropoffDate:string;dropoffTime:string;configurationVersion?:string}}>;idempotencyKey:string})=>requestJson<Array<{reservation:PromotionReservation;bookingId:string}>>("/api/reservations/schedule-group",{method:"POST",body:JSON.stringify(input)}),
  depositReference:(input:{id:string;expectedRevision:number;reference:string;reason:string})=>requestJson<PromotionReservation>("/api/reservations/deposit-reference",{method:"POST",body:JSON.stringify(input)}),
  correct:(input:{id:string;expectedRevision:number;action:"cancel"|"restore"|"expire";reason:string;evidenceRef:string})=>requestJson<PromotionReservation>("/api/reservations/corrections",{method:"POST",body:JSON.stringify(input)}),
};
export type SlotAvailability = {status:"available";slots:{dropoffDate:string;dropoffTime:string;expectedPickupDate:string}[];configurationVersion:string}|{status:"unconfigured";missing:string[]};
export const bookingAvailabilityApi = {
  slots:(input:{branchId:string;fromDate:string;toDate:string;serviceId?:string;quoteId?:string;quoteRevision?:number;bookingId?:string})=>requestJson<SlotAvailability>(`/api/availability/slots?${new URLSearchParams(Object.entries(input).filter(([,value])=>value!==undefined).map(([key,value])=>[key,String(value)])).toString()}`),
  reschedule:(bookingId:string,dropoffDate:string,dropoffTime:string)=>requestJson<{ok:true}>(`/api/bookings/${encodeURIComponent(bookingId)}/reschedule`,{method:"PATCH",body:JSON.stringify({dropoffDate,dropoffTime})}),
};

type StoreStatus = "loading" | "ready" | "error";

export interface GarageActor {
  userId: string;
  email: string;
  name: string;
  role: GarageRole;
  branchIds: string[];
  isDemo?: boolean;
}

interface ApiFailure {
  code: string;
  message: string;
}

interface BootstrapResponse {
  actor: GarageActor;
  state: GarageState;
}

class ApiRequestError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const hasFormDataBody = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !hasFormDataBody) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: init.credentials ?? "same-origin",
      headers,
    });
  } catch (error) {
    if (init.method && init.method.toUpperCase() !== "GET") {
      throw new ApiRequestError("WRITE_OUTCOME_UNKNOWN", "The write outcome could not be confirmed.", 0);
    }
    throw error;
  }
  const data = await response.json().catch(() => ({})) as Partial<ApiFailure>;
  if (!response.ok) {
    throw new ApiRequestError(data.code ?? "REQUEST_FAILED", data.message ?? "The request could not be completed.", response.status);
  }
  return data as T;
}

type StoreMutationResult = { ok: true; refresh: "fresh" | "failed" } | { ok: false; error: string };
type StoreMutationWith<T extends object> = ({ ok: true; refresh: "fresh" | "failed" } & T) | { ok: false; error: string };

async function requestMutation(url: string, init: RequestInit): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requestJson(url, init);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureCode(error) };
  }
}

function failureCode(error: unknown) {
  return error instanceof ApiRequestError ? error.code : "REQUEST_FAILED";
}

export function unknownWriteOutcomeCopy(code: string, locale: Locale): string | null {
  if (code !== "WRITE_OUTCOME_UNKNOWN") return null;
  return locale === "ar"
    ? "مش واضح إذا كان التغيير اتحفظ. حدّث البيانات وراجع الحالة الحالية قبل ما تحاول تاني، عشان ما تكررش العملية."
    : "We could not confirm whether the change was saved. Refresh the data and check the current state before trying again to avoid a duplicate.";
}

interface GarageStore {
  status: StoreStatus;
  errorCode: string;
  refreshWarning: boolean;
  actor: GarageActor | null;
  state: GarageState | null;
  locale: Locale;
  refresh: () => Promise<"fresh" | "failed">;
  setLocale: (locale: Locale) => void;
  setCurrentBranch: (branch: GarageState["currentBranch"]) => void;
  updateSetting: (settingId: string, scopeKey: BranchId | "business", value: string) => Promise<StoreMutationResult>;
  createCustomer: (input: CreateCustomerInput) => Promise<StoreMutationWith<{ customerId: string }>>;
  createBookingRequest: (input: CreateBookingInput) => Promise<StoreMutationWith<{ bookingId: string; status: string }>>;
  confirmBooking: (bookingId: string) => Promise<StoreMutationResult>;
  cancelBooking: (bookingId: string) => Promise<StoreMutationResult>;
  transitionJob: (jobId: string, nextStage: JobStage) => Promise<StoreMutationResult>;
  assignJob: (jobId: string, technicianUserId: string) => Promise<StoreMutationResult>;
  createWarrantyPolicy: (input: WarrantyPolicyInput) => Promise<StoreMutationResult>;
  updateWarrantyPolicy: (policyId: string, version: number, input: Omit<WarrantyPolicyInput, "policyId">) => Promise<StoreMutationResult>;
  publishWarrantyPolicy: (policyId: string, version: number) => Promise<StoreMutationResult>;
  retireWarrantyPolicy: (policyId: string, version: number, reason: string) => Promise<StoreMutationResult>;
  duplicateWarrantyPolicy: (policyId: string, version: number, target: "next-version" | "new-policy") => Promise<StoreMutationResult>;
  updateWarrantyVerificationSettings: (input: WarrantyVerificationSettingsInput) => Promise<StoreMutationResult>;
  createWarrantyVerificationToken: (warrantyId: string) => Promise<StoreMutationWith<{ token: string }>>;
  revokeWarrantyVerificationToken: (warrantyId: string) => Promise<StoreMutationResult>;
  recordWarrantyVerificationPrint: (warrantyId: string) => Promise<StoreMutationResult>;
  createWarrantyInvoiceDraft: (warrantyId: string) => Promise<StoreMutationWith<{ invoiceId: string }>>;
  updateWarrantyInvoiceDraft: (warrantyId: string, input: WarrantyInvoiceDraftInput) => Promise<StoreMutationResult>;
  issueWarranty: (input: IssueWarrantyInput) => Promise<StoreMutationResult>;
  voidWarranty: (warrantyId: string, reason: string) => Promise<StoreMutationResult>;
  openWarrantyClaim: (input: OpenWarrantyClaimInput) => Promise<StoreMutationResult>;
  getWarrantyEvidenceStorageStatus: () => Promise<boolean>;
  uploadWarrantyClaimEvidence: (claimId: string, file: File) => Promise<StoreMutationResult>;
  updateWarrantyClaim: (claimId: string, status: WarrantyClaimStatus, resolution?: string) => Promise<StoreMutationResult>;
}

const GarageStoreContext = createContext<GarageStore | null>(null);

export function GarageStoreProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<StoreStatus>("loading");
  const [errorCode, setErrorCode] = useState("");
  const [refreshWarning, setRefreshWarning] = useState(false);
  const hasAuthorizedData = useRef(false);
  const refreshSequence = useRef(0);
  const [actor, setActor] = useState<GarageActor | null>(null);
  const [state, setState] = useState<GarageState | null>(null);
  const { locale, setLocale: saveLocale } = useSavedLocale();

  const refresh = useCallback(async (): Promise<"fresh" | "failed"> => {
    const sequence = ++refreshSequence.current;
    if (!hasAuthorizedData.current) setStatus("loading");
    try {
      const response = await requestJson<BootstrapResponse>("/api/bootstrap");
      if (sequence !== refreshSequence.current) return "failed";
      setActor(response.actor);
      setState((current) => {
        const availableIds = response.state.branches.map((branch) => branch.id);
        const previousBranch = current?.currentBranch;
        const currentBranch = previousBranch === "all" && response.actor.role === "owner"
          ? "all"
          : previousBranch && previousBranch !== "all" && availableIds.includes(previousBranch)
            ? previousBranch
            : response.state.currentBranch;
        return { ...response.state, locale, currentBranch };
      });
      hasAuthorizedData.current = true;
      setRefreshWarning(false);
      setErrorCode("");
      setStatus("ready");
      return "fresh";
    } catch (error) {
      if (sequence !== refreshSequence.current) return "failed";
      const revoked = error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
      if (revoked) {
        hasAuthorizedData.current = false;
        setActor(null);
        setState(null);
        setRefreshWarning(false);
        setErrorCode(failureCode(error));
        setStatus("error");
      } else if (hasAuthorizedData.current) {
        setRefreshWarning(true);
        setStatus("ready");
      } else {
        setErrorCode(failureCode(error));
        setStatus("error");
      }
      return "failed";
    }
  }, [locale]);

  const completeMutation = useCallback(async <T extends object>(payload: T): Promise<T & { ok: true; refresh: "fresh" | "failed" }> => ({
    ...payload, ok: true, refresh: await refresh(),
  }), [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setLocale = useCallback((nextLocale: Locale) => {
    saveLocale(nextLocale);
    setState((current) => current ? { ...current, locale: nextLocale } : current);
  }, []);

  const setCurrentBranch = useCallback((currentBranch: GarageState["currentBranch"]) => {
    setState((current) => {
      if (!current) return current;
      if (currentBranch !== "all" && !current.branches.some((branch) => branch.id === currentBranch)) return current;
      if (currentBranch === "all" && actor?.role !== "owner") return current;
      return { ...current, currentBranch };
    });
  }, [actor?.role]);

  const updateSetting = useCallback(async (
    settingId: string,
    scopeKey: BranchId | "business",
    value: string,
  ) => {
    try {
      await requestJson("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ settingId, scopeKey, value }),
      });
      return await completeMutation({});
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [completeMutation]);

  const createCustomer = useCallback(async (input: CreateCustomerInput) => {
    try {
      const response = await requestJson<{ customerId: string }>("/api/customers", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return await completeMutation({ customerId: response.customerId });
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [completeMutation]);

  const createBookingRequest = useCallback(async (input: CreateBookingInput) => {
    try {
      const response = await requestJson<{ bookingId: string; status: string }>("/api/bookings", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return await completeMutation({ bookingId: response.bookingId, status: response.status });
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [completeMutation]);

  const confirmBooking = useCallback(async (bookingId: string) => {
    try {
      await requestJson(`/api/bookings/${encodeURIComponent(bookingId)}/confirm`, { method: "PATCH" });
      return await completeMutation({});
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [completeMutation]);

  const cancelBooking = useCallback(async (bookingId: string) => {
    try {
      await requestJson(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: "PATCH", body:JSON.stringify({reason:"Cancelled by authorized staff"}) });
      return await completeMutation({});
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [completeMutation]);

  const transitionJob = useCallback(async (jobId: string, nextStage: JobStage) => {
    try {
      await requestJson(`/api/jobs/${encodeURIComponent(jobId)}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ nextStage }),
      });
      return await completeMutation({});
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [completeMutation]);

  const assignJob = useCallback(async (jobId: string, technicianUserId: string) => {
    try {
      await requestJson(`/api/jobs/${encodeURIComponent(jobId)}/assignment`, {
        method: "PATCH",
        body: JSON.stringify({ technicianUserId }),
      });
      return await completeMutation({});
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [completeMutation]);

  const createWarrantyPolicy = useCallback(async (input: WarrantyPolicyInput) => {
    const result = await requestMutation("/api/warranties/policies", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const updateWarrantyPolicy = useCallback(async (
    policyId: string,
    version: number,
    input: Omit<WarrantyPolicyInput, "policyId">,
  ) => {
    const result = await requestMutation(
      `/api/warranties/policies/${encodeURIComponent(policyId)}/${version}`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const publishWarrantyPolicy = useCallback(async (policyId: string, version: number) => {
    const result = await requestMutation(
      `/api/warranties/policies/${encodeURIComponent(policyId)}/${version}/publish`,
      { method: "POST", body: JSON.stringify({ approvedTerms: true }) },
    );
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const retireWarrantyPolicy = useCallback(async (policyId: string, version: number, reason: string) => {
    const result = await requestMutation(`/api/warranties/policies/${encodeURIComponent(policyId)}/${version}/retire`, {
      method: "POST", body: JSON.stringify({ reason, expectedStatus: "published" }),
    });
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const duplicateWarrantyPolicy = useCallback(async (policyId: string, version: number, target: "next-version" | "new-policy") => {
    const result = await requestMutation(`/api/warranties/policies/${encodeURIComponent(policyId)}/${version}/duplicate`, {
      method: "POST", body: JSON.stringify({ target }),
    });
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const updateWarrantyVerificationSettings = useCallback(async (input: WarrantyVerificationSettingsInput) => {
    const result = await requestMutation("/api/warranties/verification-settings", {
      method: "PUT",
      body: JSON.stringify({ ...input, approvedTerms: true }),
    });
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const createWarrantyVerificationToken = useCallback(async (warrantyId: string) => {
    try {
      const response = await requestJson<{ token: string }>(
        `/api/warranties/${encodeURIComponent(warrantyId)}/verification-token`,
        { method: "POST", body: JSON.stringify({}) },
      );
      return await completeMutation({ token: response.token });
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [completeMutation]);

  const revokeWarrantyVerificationToken = useCallback(async (warrantyId: string) => {
    const result = await requestMutation(
      `/api/warranties/${encodeURIComponent(warrantyId)}/verification-token`,
      { method: "DELETE" },
    );
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const recordWarrantyVerificationPrint = useCallback(async (warrantyId: string) => {
    const result = await requestMutation(
      `/api/warranties/${encodeURIComponent(warrantyId)}/verification-token/print`,
      { method: "POST", body: JSON.stringify({}) },
    );
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const createWarrantyInvoiceDraft = useCallback(async (warrantyId: string) => {
    try {
      const response = await requestJson<{ invoiceId: string }>(
        `/api/warranties/${encodeURIComponent(warrantyId)}/invoice-draft`,
        { method: "POST", body: JSON.stringify({}) },
      );
      return await completeMutation({ invoiceId: response.invoiceId });
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [completeMutation]);

  const updateWarrantyInvoiceDraft = useCallback(async (
    warrantyId: string,
    input: WarrantyInvoiceDraftInput,
  ) => {
    const result = await requestMutation(
      `/api/warranties/${encodeURIComponent(warrantyId)}/invoice-draft`,
      { method: "PUT", body: JSON.stringify(input) },
    );
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const issueWarranty = useCallback(async (input: IssueWarrantyInput) => {
    const result = await requestMutation("/api/warranties", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const voidWarranty = useCallback(async (warrantyId: string, reason: string) => {
    const result = await requestMutation(`/api/warranties/${encodeURIComponent(warrantyId)}/void`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const openWarrantyClaim = useCallback(async (input: OpenWarrantyClaimInput) => {
    const result = await requestMutation(`/api/warranties/${encodeURIComponent(input.warrantyId)}/claims`, {
      method: "POST",
      body: JSON.stringify({ summary: input.summary, evidence: input.evidence }),
    });
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const getWarrantyEvidenceStorageStatus = useCallback(async () => {
    try {
      const response = await requestJson<{ available: boolean }>("/api/warranties/evidence/status");
      return response.available;
    } catch {
      return false;
    }
  }, []);

  const uploadWarrantyClaimEvidence = useCallback(async (claimId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    const result = await requestMutation(
      `/api/warranties/claims/${encodeURIComponent(claimId)}/attachments`,
      { method: "POST", body },
    );
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const updateWarrantyClaim = useCallback(async (
    claimId: string,
    status: WarrantyClaimStatus,
    resolution?: string,
  ) => {
    const result = await requestMutation(`/api/warranties/claims/${encodeURIComponent(claimId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status, resolution }),
    });
    if (result.ok) return completeMutation({});
    return result;
  }, [completeMutation]);

  const value = useMemo<GarageStore>(() => ({
    status,
    errorCode,
    refreshWarning,
    actor,
    state,
    locale,
    refresh,
    setLocale,
    setCurrentBranch,
    updateSetting,
    createCustomer,
    createBookingRequest,
    confirmBooking,
    cancelBooking,
    transitionJob,
    assignJob,
    createWarrantyPolicy,
    updateWarrantyPolicy,
    publishWarrantyPolicy,
    retireWarrantyPolicy,
    duplicateWarrantyPolicy,
    updateWarrantyVerificationSettings,
    createWarrantyVerificationToken,
    revokeWarrantyVerificationToken,
    recordWarrantyVerificationPrint,
    createWarrantyInvoiceDraft,
    updateWarrantyInvoiceDraft,
    issueWarranty,
    voidWarranty,
    openWarrantyClaim,
    getWarrantyEvidenceStorageStatus,
    uploadWarrantyClaimEvidence,
    updateWarrantyClaim,
  }), [
    status,
    errorCode,
    refreshWarning,
    actor,
    state,
    locale,
    refresh,
    setLocale,
    setCurrentBranch,
    updateSetting,
    createCustomer,
    createBookingRequest,
    confirmBooking,
    cancelBooking,
    transitionJob,
    assignJob,
    createWarrantyPolicy,
    updateWarrantyPolicy,
    publishWarrantyPolicy,
    retireWarrantyPolicy,
    duplicateWarrantyPolicy,
    updateWarrantyVerificationSettings,
    createWarrantyVerificationToken,
    revokeWarrantyVerificationToken,
    recordWarrantyVerificationPrint,
    createWarrantyInvoiceDraft,
    updateWarrantyInvoiceDraft,
    issueWarranty,
    voidWarranty,
    openWarrantyClaim,
    getWarrantyEvidenceStorageStatus,
    uploadWarrantyClaimEvidence,
    updateWarrantyClaim,
  ]);

  return <GarageStoreContext.Provider value={value}>{children}</GarageStoreContext.Provider>;
}

export function useGarageStore() {
  const store = useContext(GarageStoreContext);
  if (!store) throw new Error("useGarageStore must be used inside GarageStoreProvider");
  return store;
}
