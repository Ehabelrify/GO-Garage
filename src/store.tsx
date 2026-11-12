import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type {
  BranchId,
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
} from "./types";

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

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const hasFormDataBody = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !hasFormDataBody) headers.set("Content-Type", "application/json");
  const response = await fetch(url, {
    ...init,
    credentials: init.credentials ?? "same-origin",
    headers,
  });
  const data = await response.json().catch(() => ({})) as Partial<ApiFailure>;
  if (!response.ok) {
    throw new ApiRequestError(data.code ?? "REQUEST_FAILED", data.message ?? "The request could not be completed.");
  }
  return data as T;
}

type StoreMutationResult = { ok: true } | { ok: false; error: string };

async function requestMutation(url: string, init: RequestInit): Promise<StoreMutationResult> {
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

interface GarageStore {
  status: StoreStatus;
  errorCode: string;
  actor: GarageActor | null;
  state: GarageState | null;
  refresh: () => Promise<void>;
  setLocale: (locale: Locale) => void;
  setCurrentBranch: (branch: GarageState["currentBranch"]) => void;
  updateSetting: (settingId: string, scopeKey: BranchId | "business", value: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  createCustomer: (input: CreateCustomerInput) => Promise<{ ok: true; customerId: string } | { ok: false; error: string }>;
  createBookingRequest: (input: CreateBookingInput) => Promise<{ ok: true; bookingId: string; status: string } | { ok: false; error: string }>;
  confirmBooking: (bookingId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  cancelBooking: (bookingId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  transitionJob: (jobId: string, nextStage: JobStage) => Promise<{ ok: true } | { ok: false; error: string }>;
  assignJob: (jobId: string, technicianUserId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  createWarrantyPolicy: (input: WarrantyPolicyInput) => Promise<StoreMutationResult>;
  updateWarrantyPolicy: (policyId: string, version: number, input: Omit<WarrantyPolicyInput, "policyId">) => Promise<StoreMutationResult>;
  publishWarrantyPolicy: (policyId: string, version: number) => Promise<StoreMutationResult>;
  updateWarrantyVerificationSettings: (input: WarrantyVerificationSettingsInput) => Promise<StoreMutationResult>;
  createWarrantyVerificationToken: (warrantyId: string) => Promise<{ ok: true; token: string } | { ok: false; error: string }>;
  revokeWarrantyVerificationToken: (warrantyId: string) => Promise<StoreMutationResult>;
  recordWarrantyVerificationPrint: (warrantyId: string) => Promise<StoreMutationResult>;
  createWarrantyInvoiceDraft: (warrantyId: string) => Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }>;
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
  const [actor, setActor] = useState<GarageActor | null>(null);
  const [state, setState] = useState<GarageState | null>(null);
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "ar";
    return window.localStorage.getItem("garage-os-locale") === "en" ? "en" : "ar";
  });

  const refresh = useCallback(async () => {
    setStatus((current) => current === "ready" ? current : "loading");
    setErrorCode("");
    try {
      const response = await requestJson<BootstrapResponse>("/api/bootstrap");
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
      setStatus("ready");
    } catch (error) {
      setErrorCode(failureCode(error));
      setStatus("error");
    }
  }, [locale]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem("garage-os-locale", nextLocale);
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = nextLocale === "ar" ? "rtl" : "ltr";
    setState((current) => current ? { ...current, locale: nextLocale } : current);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

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
      await refresh();
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [refresh]);

  const createCustomer = useCallback(async (input: CreateCustomerInput) => {
    try {
      const response = await requestJson<{ customerId: string }>("/api/customers", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await refresh();
      return { ok: true as const, customerId: response.customerId };
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [refresh]);

  const createBookingRequest = useCallback(async (input: CreateBookingInput) => {
    try {
      const response = await requestJson<{ bookingId: string; status: string }>("/api/bookings", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await refresh();
      return { ok: true as const, bookingId: response.bookingId, status: response.status };
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [refresh]);

  const confirmBooking = useCallback(async (bookingId: string) => {
    try {
      await requestJson(`/api/bookings/${encodeURIComponent(bookingId)}/confirm`, { method: "PATCH" });
      await refresh();
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [refresh]);

  const cancelBooking = useCallback(async (bookingId: string) => {
    try {
      await requestJson(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: "PATCH" });
      await refresh();
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [refresh]);

  const transitionJob = useCallback(async (jobId: string, nextStage: JobStage) => {
    try {
      await requestJson(`/api/jobs/${encodeURIComponent(jobId)}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ nextStage }),
      });
      await refresh();
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [refresh]);

  const assignJob = useCallback(async (jobId: string, technicianUserId: string) => {
    try {
      await requestJson(`/api/jobs/${encodeURIComponent(jobId)}/assignment`, {
        method: "PATCH",
        body: JSON.stringify({ technicianUserId }),
      });
      await refresh();
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [refresh]);

  const createWarrantyPolicy = useCallback(async (input: WarrantyPolicyInput) => {
    const result = await requestMutation("/api/warranties/policies", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const updateWarrantyPolicy = useCallback(async (
    policyId: string,
    version: number,
    input: Omit<WarrantyPolicyInput, "policyId">,
  ) => {
    const result = await requestMutation(
      `/api/warranties/policies/${encodeURIComponent(policyId)}/${version}`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const publishWarrantyPolicy = useCallback(async (policyId: string, version: number) => {
    const result = await requestMutation(
      `/api/warranties/policies/${encodeURIComponent(policyId)}/${version}/publish`,
      { method: "POST", body: JSON.stringify({ approvedTerms: true }) },
    );
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const updateWarrantyVerificationSettings = useCallback(async (input: WarrantyVerificationSettingsInput) => {
    const result = await requestMutation("/api/warranties/verification-settings", {
      method: "PUT",
      body: JSON.stringify({ ...input, approvedTerms: true }),
    });
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const createWarrantyVerificationToken = useCallback(async (warrantyId: string) => {
    try {
      const response = await requestJson<{ token: string }>(
        `/api/warranties/${encodeURIComponent(warrantyId)}/verification-token`,
        { method: "POST", body: JSON.stringify({}) },
      );
      await refresh();
      return { ok: true as const, token: response.token };
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [refresh]);

  const revokeWarrantyVerificationToken = useCallback(async (warrantyId: string) => {
    const result = await requestMutation(
      `/api/warranties/${encodeURIComponent(warrantyId)}/verification-token`,
      { method: "DELETE" },
    );
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const recordWarrantyVerificationPrint = useCallback(async (warrantyId: string) => {
    const result = await requestMutation(
      `/api/warranties/${encodeURIComponent(warrantyId)}/verification-token/print`,
      { method: "POST", body: JSON.stringify({}) },
    );
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const createWarrantyInvoiceDraft = useCallback(async (warrantyId: string) => {
    try {
      const response = await requestJson<{ invoiceId: string }>(
        `/api/warranties/${encodeURIComponent(warrantyId)}/invoice-draft`,
        { method: "POST", body: JSON.stringify({}) },
      );
      await refresh();
      return { ok: true as const, invoiceId: response.invoiceId };
    } catch (error) {
      return { ok: false as const, error: failureCode(error) };
    }
  }, [refresh]);

  const updateWarrantyInvoiceDraft = useCallback(async (
    warrantyId: string,
    input: WarrantyInvoiceDraftInput,
  ) => {
    const result = await requestMutation(
      `/api/warranties/${encodeURIComponent(warrantyId)}/invoice-draft`,
      { method: "PUT", body: JSON.stringify(input) },
    );
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const issueWarranty = useCallback(async (input: IssueWarrantyInput) => {
    const result = await requestMutation("/api/warranties", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const voidWarranty = useCallback(async (warrantyId: string, reason: string) => {
    const result = await requestMutation(`/api/warranties/${encodeURIComponent(warrantyId)}/void`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const openWarrantyClaim = useCallback(async (input: OpenWarrantyClaimInput) => {
    const result = await requestMutation(`/api/warranties/${encodeURIComponent(input.warrantyId)}/claims`, {
      method: "POST",
      body: JSON.stringify({ summary: input.summary, evidence: input.evidence }),
    });
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

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
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const updateWarrantyClaim = useCallback(async (
    claimId: string,
    status: WarrantyClaimStatus,
    resolution?: string,
  ) => {
    const result = await requestMutation(`/api/warranties/claims/${encodeURIComponent(claimId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status, resolution }),
    });
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const value = useMemo<GarageStore>(() => ({
    status,
    errorCode,
    actor,
    state,
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
    actor,
    state,
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
