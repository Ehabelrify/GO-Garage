import { useMemo } from "react";
import { hasCapability } from "../../shared/capabilities";
import type { GarageState, Locale, WarrantyClaim, WarrantyRecord } from "@garage/domain";
import { RecordRef } from "../../shared/components";
import { useGarageStore } from "../../shared/store";
import { branchDisplay, customerDisplay, serviceDisplay, type PageProps, type Translator } from "../../shared/ui";
import { branchAllowed } from "./warranty-logic";
import { errorCopy } from "./warranty-copy";

/** Everything a warranty tab needs: who the actor is, which records they may see and display helpers. */
export interface WarrantyScope {
  lang: Locale;
  t: Translator;
  state: GarageState;
  notify: (message: string) => void;
  store: ReturnType<typeof useGarageStore>;
  userId: string;
  dataset: "demo" | "live";
  isOwner: boolean;
  isManager: boolean;
  isReception: boolean;
  /** Issue coverage, prepare QR cards (owner and branch manager; server decides). */
  canIssue: boolean;
  canReview: boolean;
  canVoid: boolean;
  canManagePolicies: boolean;
  allowedBranches: string[];
  warranties: WarrantyRecord[];
  claims: WarrantyClaim[];
  customerName: (customerId: string) => string;
  vehicleOf: (customerId: string, vehicleId: string) => { id: string; plate: string; makeModel: string } | undefined;
  serviceName: (serviceId: string) => string;
  branchName: (branchId: string) => string;
  error: (code: string) => string;
}

export function useWarrantyScope({ lang, t, state, notify }: PageProps): WarrantyScope {
  const store = useGarageStore();
  const actor = store.actor;
  const isOwner = actor?.role === "owner";
  const isManager = actor?.role === "branch-manager";
  const isReception = actor?.role === "receptionist";
  const allowedKey = (isOwner ? state.branches.map((branch) => branch.id) : actor?.branchIds ?? []).join("|");
  const allowedBranches = useMemo(() => (allowedKey ? allowedKey.split("|") : []), [allowedKey]);
  const warranties = useMemo(
    () => state.warranties.filter((item) => branchAllowed(state, item.branchId, allowedBranches)),
    [state.warranties, state.currentBranch, allowedBranches],
  );
  const claims = useMemo(
    () => state.warrantyClaims.filter((claim) => branchAllowed(state, claim.branchId, allowedBranches)),
    [state.warrantyClaims, state.currentBranch, allowedBranches],
  );
  const vehicleOf: WarrantyScope["vehicleOf"] = (customerId, vehicleId) =>
    state.customers.find((customer) => customer.id === customerId)?.vehicles.find((vehicle) => vehicle.id === vehicleId);
  return {
    lang, t, state, notify, store,
    userId: actor?.userId ?? "anonymous", dataset: actor?.isDemo ? "demo" : "live",
    isOwner, isManager, isReception,
    canIssue: hasCapability(actor, "warranty.issue"), canReview: hasCapability(actor, "warranty.review"), canVoid: hasCapability(actor, "warranty.void"), canManagePolicies: hasCapability(actor, "warranty.policies"),
    allowedBranches, warranties, claims, vehicleOf,
    customerName: (customerId) => {
      const customer = state.customers.find((item) => item.id === customerId);
      return customer ? customerDisplay(customer.name, lang) : "—";
    },
    serviceName: (serviceId) => {
      const service = state.services.find((item) => item.id === serviceId);
      return service ? (lang === "ar" && service.nameAr ? service.nameAr : serviceDisplay(service.name, lang)) : "—";
    },
    branchName: (branchId) => {
      const branch = state.branches.find((item) => item.id === branchId);
      return branch ? (lang === "ar" && branch.nameAr ? branch.nameAr : branchDisplay(branch.name, lang)) : "—";
    },
    error: (code) => errorCopy(code, lang),
  };
}

/** Related-record links shared by every tab. Labels are names and plates, never ids. */
export function CustomerLink({ scope, customerId }: { scope: WarrantyScope; customerId: string }) {
  return <RecordRef type="customer" id={customerId} label={scope.customerName(customerId)} />;
}

export function VehicleLink({ scope, customerId, vehicleId }: { scope: WarrantyScope; customerId: string; vehicleId: string }) {
  const vehicle = scope.vehicleOf(customerId, vehicleId);
  return <RecordRef type="vehicle" id={vehicleId} label={vehicle?.plate} subtitle={vehicle?.makeModel} />;
}

export function JobLink({ scope, jobId }: { scope: WarrantyScope; jobId: string }) {
  const job = scope.state.jobs.find((item) => item.id === jobId);
  return <RecordRef type="job" id={jobId} label={job ? scope.serviceName(job.serviceId) : undefined} />;
}

export function WarrantyLink({ scope, record }: { scope: WarrantyScope; record: WarrantyRecord }) {
  return <RecordRef type="warranty" id={record.id} label={record.policyName} subtitle={scope.customerName(record.customerId)} />;
}

export function ClaimLink({ claim }: { claim: WarrantyClaim }) {
  return <RecordRef type="claim" id={claim.id} label={claim.summary.length > 40 ? `${claim.summary.slice(0, 40)}…` : claim.summary} />;
}
