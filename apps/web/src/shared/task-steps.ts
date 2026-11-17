export type BookingTaskDraft = {
  identityKey: string;
  customerId: string;
  vehicleId: string;
  serviceId: string;
  branchId: string;
  dropoffDate: string;
  dropoffTime: string;
  availabilityVersion?: string;
};

export type BookingInvalidation = "slot" | "vehicle" | "service";

export function reconcileBookingDraft(previous: BookingTaskDraft, next: BookingTaskDraft): {
  draft: BookingTaskDraft;
  invalidated: BookingInvalidation[];
} {
  if (previous.identityKey !== next.identityKey) {
    return {
      draft: { ...next, customerId: "", vehicleId: "", serviceId: "", dropoffDate: "", dropoffTime: "", availabilityVersion: undefined },
      invalidated: ["vehicle", "service", "slot"],
    };
  }
  const draft = { ...next };
  const invalidated = new Set<BookingInvalidation>();
  if (previous.customerId !== next.customerId) {
    draft.vehicleId = "";
    invalidated.add("vehicle");
  }
  if (previous.branchId !== next.branchId || previous.serviceId !== next.serviceId || previous.customerId !== next.customerId) {
    draft.dropoffDate = "";
    draft.dropoffTime = "";
    draft.availabilityVersion = undefined;
    invalidated.add("slot");
  }
  return { draft, invalidated: [...invalidated] };
}

export type WarrantyIssueTaskDraft = { job: string; component: string; date: string };
export function reconcileWarrantyIssueDraft(previous: WarrantyIssueTaskDraft, next: WarrantyIssueTaskDraft): WarrantyIssueTaskDraft {
  if (previous.job === next.job) return next;
  return { ...next, component: "", date: "" };
}
