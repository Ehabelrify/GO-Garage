import type { Money } from "./catalogue";
import type { PolicyRef } from "./commercial-policy";

export type TransportDirection = "pickup" | "return" | "courtesy";
export type TransportMode = "tow" | "driver" | "courtesy-car";
export type TransportStatus = "proposed" | "requested" | "confirmed" | "pickup-in-progress" | "in-custody" | "completed" | "cancelled" | "exception";
export type TransportWindow = { startsAt: string; endsAt: string };
export type TransportRequest = {
  id: string;
  bookingId: string;
  jobId: string | null;
  branchId: string;
  customerId: string;
  vehicleId: string;
  direction: TransportDirection;
  mode: TransportMode;
  status: TransportStatus;
  providerId: string | null;
  committedWindow: TransportWindow | null;
  policy: PolicyRef | null;
  fee: Money | null;
  missing: string[];
  revision: number;
};
