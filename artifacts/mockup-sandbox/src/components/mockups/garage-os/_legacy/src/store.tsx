import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { initialState } from "./demoData";
import { canTransitionJob, checkBookingCapacity, configuredNumber, configuredServiceHours } from "./domain";
import type {
  BranchId,
  CreateBookingInput,
  CreateCustomerInput,
  DecisionDraft,
  GarageState,
  JobStage,
  Locale,
} from "./types";

const STORAGE_KEY = "garage-os-owner-demo-v1";

function loadState(): GarageState {
  if (typeof window === "undefined") return initialState;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return initialState;
    const parsed = JSON.parse(saved) as GarageState;
    if (!parsed.decisions || !parsed.customers || !parsed.bookings || !parsed.jobs) return initialState;
    const mergeSeeds = <T extends { id: string }>(seeds: T[], savedItems: T[] | undefined) => {
      const savedById = new Map((savedItems ?? []).map((item) => [item.id, item]));
      const seedIds = new Set(seeds.map((item) => item.id));
      return [
        ...seeds.map((seed) => ({ ...seed, ...(savedById.get(seed.id) ?? {}) })),
        ...(savedItems ?? []).filter((item) => !seedIds.has(item.id)),
      ];
    };
    const decisions = mergeSeeds(initialState.decisions, parsed.decisions).map((seed) => {
      const previous = parsed.decisions.find((item) => item.id === seed.id);
      if (!previous) return seed;
      const base = initialState.decisions.find((item) => item.id === seed.id)!;
      return {
        ...seed,
        options: base.options,
        valueByScope: { ...base.valueByScope, ...previous.valueByScope },
        proposedByScope: { ...base.proposedByScope, ...previous.proposedByScope },
        effectiveDateByScope: { ...base.effectiveDateByScope, ...previous.effectiveDateByScope },
        statusByScope: { ...base.statusByScope, ...previous.statusByScope },
        versionByScope: { ...base.versionByScope, ...previous.versionByScope },
      };
    });
    return {
      ...initialState,
      ...parsed,
      branches: mergeSeeds(initialState.branches, parsed.branches),
      services: mergeSeeds(initialState.services, parsed.services),
      decisions,
      drafts: parsed.drafts ?? [],
      auditEvents: parsed.auditEvents ?? [],
      customers: mergeSeeds(initialState.customers, parsed.customers),
      bookings: mergeSeeds(initialState.bookings, parsed.bookings),
      jobs: mergeSeeds(initialState.jobs, parsed.jobs),
      jobEvents: parsed.jobEvents ?? [],
    };
  } catch {
    return initialState;
  }
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

interface GarageStore {
  state: GarageState;
  setLocale: (locale: Locale) => void;
  setCurrentBranch: (branch: GarageState["currentBranch"]) => void;
  getDraft: (decisionId: string, scopeKey: BranchId | "business") => DecisionDraft | undefined;
  saveDecisionDraft: (decisionId: string, scopeKey: BranchId | "business", value: string, effectiveDate?: string) => boolean;
  approveDecisionForDemo: (decisionId: string, scopeKey: BranchId | "business") => boolean;
  discardDecisionDraft: (decisionId: string, scopeKey: BranchId | "business") => void;
  createCustomer: (input: CreateCustomerInput) => { ok: true; customerId: string } | { ok: false; error: string };
  createBookingRequest: (input: CreateBookingInput) => { ok: true; bookingId: string } | { ok: false; error: string };
  confirmBookingForDemo: (bookingId: string) => { ok: true } | { ok: false; error: string };
  cancelBooking: (bookingId: string) => void;
  transitionJob: (jobId: string, nextStage: JobStage) => boolean;
  resetDemo: () => void;
}

const GarageStoreContext = createContext<GarageStore | null>(null);

export function GarageStoreProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<GarageState>(loadState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setLocale = useCallback((locale: Locale) => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    setState((current) => ({ ...current, locale }));
  }, []);

  useEffect(() => {
    document.documentElement.lang = state.locale;
    document.documentElement.dir = state.locale === "ar" ? "rtl" : "ltr";
  }, [state.locale]);

  const setCurrentBranch = useCallback((currentBranch: GarageState["currentBranch"]) => {
    setState((current) => ({ ...current, currentBranch }));
  }, []);

  const getDraft = useCallback(
    (decisionId: string, scopeKey: BranchId | "business") =>
      state.drafts.find((draft) => draft.decisionId === decisionId && draft.scopeKey === scopeKey),
    [state.drafts],
  );

  const saveDecisionDraft = useCallback(
    (decisionId: string, scopeKey: BranchId | "business", value: string, effectiveDate?: string) => {
      const decision = state.decisions.find((item) => item.id === decisionId);
      if (!decision || !decision.options.some((option) => option.value === value)) return false;
      const keyExists = decision.scope === "business" ? scopeKey === "business" : decision.branches?.includes(scopeKey as BranchId);
      if (!keyExists) return false;
      const savedAt = new Date().toISOString();
      const draft: DecisionDraft = { decisionId, scopeKey, value, effectiveDate, savedAt };
      setState((current) => {
        const previous = current.decisions.find((item) => item.id === decisionId)?.valueByScope[scopeKey] ?? "";
        const existing = current.drafts.filter(
          (item) => !(item.decisionId === decisionId && item.scopeKey === scopeKey),
        );
        return {
          ...current,
          drafts: [...existing, draft],
          auditEvents: [
            {
              id: uid("audit"),
              settingTitle: decision.title,
              scopeLabel: scopeKey === "business" ? "Business-wide" : current.branches.find((branch) => branch.id === scopeKey)?.name ?? scopeKey,
              previousValue: previous,
              newValue: value,
              effectiveDate,
              action: "draft-saved",
              occurredAt: savedAt,
            },
            ...current.auditEvents,
          ],
        };
      });
      return true;
    },
    [state.decisions],
  );

  const approveDecisionForDemo = useCallback(
    (decisionId: string, scopeKey: BranchId | "business") => {
      const draft = state.drafts.find((item) => item.decisionId === decisionId && item.scopeKey === scopeKey);
      const decision = state.decisions.find((item) => item.id === decisionId);
      if (!draft || !decision) return false;
      const occurredAt = new Date().toISOString();
      setState((current) => {
        const target = current.decisions.find((item) => item.id === decisionId);
        if (!target) return current;
        const previousValue = target.valueByScope[scopeKey] ?? "";
        const nextDecision = {
          ...target,
          valueByScope: { ...target.valueByScope, [scopeKey]: draft.value },
          effectiveDateByScope: { ...target.effectiveDateByScope, [scopeKey]: draft.effectiveDate ?? "" },
          statusByScope: { ...target.statusByScope, [scopeKey]: "demo-approved" as const },
          versionByScope: { ...target.versionByScope, [scopeKey]: (target.versionByScope[scopeKey] ?? 1) + 1 },
        };
        return {
          ...current,
          decisions: current.decisions.map((item) => (item.id === decisionId ? nextDecision : item)),
          drafts: current.drafts.filter((item) => !(item.decisionId === decisionId && item.scopeKey === scopeKey)),
          auditEvents: [
            {
              id: uid("audit"),
              settingTitle: target.title,
              scopeLabel: scopeKey === "business" ? "Business-wide" : current.branches.find((branch) => branch.id === scopeKey)?.name ?? scopeKey,
              previousValue,
              newValue: draft.value,
              effectiveDate: draft.effectiveDate,
              action: "demo-approved",
              occurredAt,
            },
            ...current.auditEvents,
          ],
        };
      });
      return true;
    },
    [state.decisions, state.drafts],
  );

  const discardDecisionDraft = useCallback((decisionId: string, scopeKey: BranchId | "business") => {
    setState((current) => ({
      ...current,
      drafts: current.drafts.filter((item) => !(item.decisionId === decisionId && item.scopeKey === scopeKey)),
    }));
  }, []);

  const createCustomer = useCallback((input: CreateCustomerInput) => {
    const name = input.name.trim();
    const phone = input.phone.trim();
    const plate = input.plate.trim();
    const makeModel = input.makeModel.trim();
    if (!name || !phone || !plate || !makeModel) return { ok: false as const, error: "required" };
    if (normalizePhone(phone).length < 8) return { ok: false as const, error: "phone" };
    if (state.customers.some((item) => normalizePhone(item.phone) === normalizePhone(phone))) {
      return { ok: false as const, error: "duplicate" };
    }
    const customerId = uid("customer");
    const vehicleId = uid("vehicle");
    const customer = {
      id: customerId,
      name,
      phone,
      language: input.language,
      vehicles: [{ id: vehicleId, plate, makeModel }],
    };
    setState((current) => {
      return { ...current, customers: [customer, ...current.customers] };
    });
    return { ok: true as const, customerId };
  }, [state.customers]);

  const createBookingRequest = useCallback((input: CreateBookingInput) => {
    const customer = state.customers.find((item) => item.id === input.customerId);
    const vehicle = customer?.vehicles.find((item) => item.id === input.vehicleId);
    const branch = state.branches.find((item) => item.id === input.branchId);
    const service = state.services.find((item) => item.id === input.serviceId);
    if (!customer || !vehicle || !branch || !service) return { ok: false as const, error: "record" };
    if (!input.dropoffDate || !input.dropoffTime) return { ok: false as const, error: "date" };
    const capacityIssue = checkBookingCapacity({
      branch,
      service,
      branchId: input.branchId,
      date: input.dropoffDate,
      bookings: state.bookings,
      services: state.services,
      decisions: state.decisions,
    });
    if (capacityIssue) return { ok: false as const, error: capacityIssue };
    const bookingId = uid("booking");
    const expectedPickup = new Date(`${input.dropoffDate}T12:00:00`);
    const workingHours = configuredNumber(state.decisions, "branch-working-hours", input.branchId, branch.workingHours);
    if (configuredServiceHours(service, state.decisions) > workingHours) expectedPickup.setDate(expectedPickup.getDate() + 1);
    const booking = {
      id: bookingId,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      serviceId: input.serviceId,
      branchId: input.branchId,
      dropoffDate: input.dropoffDate,
      dropoffTime: input.dropoffTime,
      expectedPickup: expectedPickup.toISOString().slice(0, 10),
      status: "pending" as const,
    };
    setState((current) => ({ ...current, bookings: [booking, ...current.bookings] }));
    return { ok: true as const, bookingId };
  }, [state.branches, state.bookings, state.customers, state.decisions, state.services]);

  const confirmBookingForDemo = useCallback((bookingId: string) => {
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking || booking.status !== "pending") return { ok: false as const, error: "record" };
    const branch = state.branches.find((item) => item.id === booking.branchId);
    const service = state.services.find((item) => item.id === booking.serviceId);
    if (!branch || !service) return { ok: false as const, error: "record" };
    const capacityIssue = checkBookingCapacity({
      branch,
      service,
      branchId: booking.branchId,
      date: booking.dropoffDate,
      bookings: state.bookings,
      services: state.services,
      decisions: state.decisions,
      excludeBookingId: bookingId,
    });
    if (capacityIssue) return { ok: false as const, error: capacityIssue };
    const expectedPickup = new Date(`${booking.dropoffDate}T12:00:00`);
    const workingHours = configuredNumber(state.decisions, "branch-working-hours", booking.branchId, branch.workingHours);
    if (configuredServiceHours(service, state.decisions) > workingHours) expectedPickup.setDate(expectedPickup.getDate() + 1);
    const jobId = uid("job");
    setState((current) => ({
      ...current,
      bookings: current.bookings.map((item) =>
        item.id === bookingId
          ? { ...item, status: "confirmed", expectedPickup: expectedPickup.toISOString().slice(0, 10) }
          : item,
      ),
      jobs: [
        {
          id: jobId,
          bookingId,
          customerId: booking.customerId,
          vehicleId: booking.vehicleId,
          serviceId: booking.serviceId,
          branchId: booking.branchId,
          stage: "booked",
          updatedAt: new Date().toISOString(),
        },
        ...current.jobs,
      ],
    }));
    return { ok: true as const };
  }, [state.bookings, state.branches, state.customers, state.decisions, state.services]);

  const cancelBooking = useCallback((bookingId: string) => {
    setState((current) => ({
      ...current,
      bookings: current.bookings.map((item) => item.id === bookingId ? { ...item, status: "cancelled" } : item),
    }));
  }, []);

  const transitionJob = useCallback((jobId: string, nextStage: JobStage) => {
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job || !canTransitionJob(job.stage, nextStage)) return false;
    const occurredAt = new Date().toISOString();
    setState((current) => ({
      ...current,
      jobs: current.jobs.map((item) =>
        item.id === jobId ? { ...item, stage: nextStage, updatedAt: occurredAt } : item,
      ),
      jobEvents: [
        {
          id: uid("event"),
          jobId,
          previousStage: job.stage,
          nextStage,
          actorLabel: "Demo user",
          occurredAt,
        },
        ...current.jobEvents,
      ],
    }));
    return true;
  }, [state.jobs]);

  const resetDemo = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState(initialState);
  }, []);

  const value = useMemo<GarageStore>(
    () => ({
      state,
      setLocale,
      setCurrentBranch,
      getDraft,
      saveDecisionDraft,
      approveDecisionForDemo,
      discardDecisionDraft,
      createCustomer,
      createBookingRequest,
      confirmBookingForDemo,
      cancelBooking,
      transitionJob,
      resetDemo,
    }),
    [
      state,
      setLocale,
      setCurrentBranch,
      getDraft,
      saveDecisionDraft,
      approveDecisionForDemo,
      discardDecisionDraft,
      createCustomer,
      createBookingRequest,
      confirmBookingForDemo,
      cancelBooking,
      transitionJob,
      resetDemo,
    ],
  );

  return <GarageStoreContext.Provider value={value}>{children}</GarageStoreContext.Provider>;
}

export function useGarageStore() {
  const store = useContext(GarageStoreContext);
  if (!store) throw new Error("useGarageStore must be used inside GarageStoreProvider");
  return store;
}
