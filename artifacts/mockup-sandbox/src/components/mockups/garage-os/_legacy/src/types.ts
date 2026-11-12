export type Locale = "ar" | "en";
export type BranchId = "branch-a" | "branch-b";
export type PageId = "overview" | "decisions" | "bookings" | "workshop" | "customers";
export type DecisionStatus = "proposed" | "demo-approved";
export type JobStage =
  | "booked"
  | "received"
  | "in-service"
  | "qc"
  | "ready"
  | "delivered"
  | "cancelled"
  | "no-show";

export interface Branch {
  id: BranchId;
  name: string;
  shortName: string;
  dailyDropoffLimit: number;
  cleanBays: number;
  generalBays: number;
  workingHours: number;
  weeklyDayOff: string;
}

export interface Service {
  id: string;
  name: string;
  bayType: "clean" | "general";
  bayHours: number;
  priceLabel: string;
}

export interface DecisionOption {
  value: string;
  label: string;
  explanation: string;
}

export interface Decision {
  id: string;
  category: string;
  title: string;
  question: string;
  scope: "business" | "branch";
  branches?: BranchId[];
  valueByScope: Partial<Record<BranchId | "business", string>>;
  proposedByScope: Partial<Record<BranchId | "business", string>>;
  effectiveDateByScope?: Partial<Record<BranchId | "business", string>>;
  statusByScope: Partial<Record<BranchId | "business", DecisionStatus>>;
  versionByScope: Partial<Record<BranchId | "business", number>>;
  options: DecisionOption[];
  impact: string;
  ownerDecision: boolean;
}

export interface DecisionDraft {
  decisionId: string;
  scopeKey: BranchId | "business";
  value: string;
  effectiveDate?: string;
  savedAt: string;
}

export interface AuditEvent {
  id: string;
  settingTitle: string;
  scopeLabel: string;
  previousValue: string;
  newValue: string;
  effectiveDate?: string;
  action: "draft-saved" | "demo-approved";
  occurredAt: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  makeModel: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  language: Locale;
  vehicles: Vehicle[];
}

export interface Booking {
  id: string;
  customerId: string;
  vehicleId: string;
  serviceId: string;
  branchId: BranchId;
  dropoffDate: string;
  dropoffTime: string;
  expectedPickup: string;
  status: "pending" | "confirmed" | "cancelled";
}

export interface Job {
  id: string;
  bookingId: string;
  customerId: string;
  vehicleId: string;
  serviceId: string;
  branchId: BranchId;
  stage: JobStage;
  updatedAt: string;
}

export interface JobEvent {
  id: string;
  jobId: string;
  previousStage: JobStage | null;
  nextStage: JobStage;
  actorLabel: string;
  occurredAt: string;
}

export interface GarageState {
  locale: Locale;
  currentBranch: BranchId | "all";
  branches: Branch[];
  services: Service[];
  decisions: Decision[];
  drafts: DecisionDraft[];
  auditEvents: AuditEvent[];
  customers: Customer[];
  bookings: Booking[];
  jobs: Job[];
  jobEvents: JobEvent[];
}

export interface CreateCustomerInput {
  name: string;
  phone: string;
  plate: string;
  makeModel: string;
  language: Locale;
}

export interface CreateBookingInput {
  customerId: string;
  vehicleId: string;
  serviceId: string;
  branchId: BranchId;
  dropoffDate: string;
  dropoffTime: string;
}
