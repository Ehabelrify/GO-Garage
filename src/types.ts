export type Locale = "ar" | "en";
export type BranchId = "branch-a" | "branch-b";
export type PageId = "overview" | "settings" | "bookings" | "workshop" | "customers" | "staff" | "warranties" | "whatsapp";
export type GarageRole = "owner" | "branch-manager" | "receptionist" | "technician";
export type DecisionStatus = "proposed" | "active" | "on-hold";
export type WarrantyPolicyStatus = "draft" | "published" | "retired";
export type WarrantyStartRule = "job-delivery" | "owner-selected-date";
export type WarrantyReviewRole = "owner" | "branch-manager";
export type WarrantyStatus = "active" | "expired" | "void";
export type WarrantyClaimStatus = "open" | "under-review" | "approved" | "denied" | "closed";
export type WarrantyVerificationField = "service" | "status" | "startDate" | "expiresOn" | "branch";

export interface WarrantyVerificationSettings {
  enabled: boolean;
  approvedFields: WarrantyVerificationField[];
}

export interface PublicWarrantyVerification {
  verified: true;
  status: WarrantyStatus;
  serviceName?: { en: string; ar: string };
  branchName?: { en: string; ar: string };
  startDate?: string;
  expiresOn?: string;
}
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
  nameAr?: string;
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
  nameAr?: string;
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
  action: "setting-updated";
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
  status: "pending" | "confirmed" | "cancelled" | "no-show";
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
  assignedUserId?: string | null;
}

export interface JobEvent {
  id: string;
  jobId: string;
  previousStage: JobStage | null;
  nextStage: JobStage;
  actorLabel: string;
  occurredAt: string;
}

export interface WarrantyPolicy {
  policyId: string;
  version: number;
  name: string;
  eligibleServiceIds: string[];
  autoIssue: boolean;
  startRule: WarrantyStartRule;
  durationMonths: number;
  exclusions: string;
  evidenceRequirements: string;
  reviewRole: WarrantyReviewRole;
  responseDays: number;
  status: WarrantyPolicyStatus;
  createdAt: string;
  publishedAt?: string;
}

export interface WarrantyRecord {
  id: string;
  policyId: string;
  policyVersion: number;
  policyName: string;
  customerId: string;
  vehicleId: string;
  jobId: string;
  branchId: BranchId;
  serviceId: string;
  startDate: string;
  expiresOn: string;
  status: WarrantyStatus;
  voidReason?: string;
  issuedAt: string;
  verificationTokenActive: boolean;
}

export type WarrantyInvoicePaymentMethod = "cash" | "card" | "transfer" | "other";

export interface WarrantyInvoiceDraftItem {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number | null;
  sortOrder: number;
}

export interface WarrantyInvoiceDraft {
  id: string;
  warrantyId: string;
  branchId: BranchId;
  status: "draft";
  taxRatePercent: number | null;
  paidAmount: number;
  paymentMethod: WarrantyInvoicePaymentMethod | null;
  paymentRecordedAt: string | null;
  paymentRecordedBy: string | null;
  notes: string;
  items: WarrantyInvoiceDraftItem[];
  createdAt: string;
  updatedAt: string;
}

export interface WarrantyInvoiceDraftInput {
  items: Array<{
    description: string;
    quantity: number;
    unitAmount: number | null;
  }>;
  taxRatePercent: number | null;
  paidAmount: number;
  paymentMethod: WarrantyInvoicePaymentMethod | null;
  notes: string;
}

export interface WarrantyInvoiceTotals {
  subtotal: number | null;
  taxAmount: number | null;
  total: number | null;
  balance: number | null;
  paymentStatus: "unpriced" | "unpaid" | "partial" | "paid";
}

export type WarrantyQrPrintAction = "prepared" | "printed" | "reprinted" | "replaced" | "revoked";

export interface WarrantyQrPrintEvent {
  id: string;
  warrantyId: string;
  tokenId: string;
  action: WarrantyQrPrintAction;
  replacesTokenId?: string;
  actorLabel: string;
  createdAt: string;
}

export interface WarrantyClaim {
  id: string;
  warrantyId: string;
  branchId: BranchId;
  summary: string;
  evidence: string;
  attachments: WarrantyClaimAttachment[];
  status: WarrantyClaimStatus;
  resolution?: string;
  openedBy: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarrantyClaimAttachment {
  id: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  byteSize: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface WarrantyAuditEvent {
  id: string;
  entityType: "policy" | "warranty" | "claim";
  entityId: string;
  policyVersion?: number;
  action: string;
  details: string;
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
  warrantyPolicies: WarrantyPolicy[];
  warrantyVerificationSettings: WarrantyVerificationSettings;
  warranties: WarrantyRecord[];
  warrantyInvoiceDrafts: WarrantyInvoiceDraft[];
  warrantyQrPrintEvents: WarrantyQrPrintEvent[];
  warrantyClaims: WarrantyClaim[];
  warrantyAuditEvents: WarrantyAuditEvent[];
}

export interface WarrantyPolicyInput {
  policyId?: string;
  name: string;
  eligibleServiceIds: string[];
  autoIssue: boolean;
  startRule: WarrantyStartRule;
  durationMonths: number;
  exclusions: string;
  evidenceRequirements: string;
  reviewRole: WarrantyReviewRole;
  responseDays: number;
}

export interface WarrantyVerificationSettingsInput extends WarrantyVerificationSettings {}

export interface IssueWarrantyInput {
  policyId: string;
  policyVersion: number;
  jobId: string;
  startDate?: string;
}

export interface OpenWarrantyClaimInput {
  warrantyId: string;
  summary: string;
  evidence: string;
}

export interface CreateCustomerInput {
  name: string;
  phone: string;
  plate: string;
  makeModel: string;
  language: Locale;
  branchId?: BranchId;
}

export interface CreateBookingInput {
  customerId: string;
  vehicleId: string;
  serviceId: string;
  branchId: BranchId;
  dropoffDate: string;
  dropoffTime: string;
}
