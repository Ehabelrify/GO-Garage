import type { Booking, Customer, GarageState, Locale, Vehicle } from "@garage/domain";

export const tr = (lang: Locale) => (en: string, ar: string) => (lang === "ar" ? ar : en);

export interface Lookups {
  customer: (id: string | null | undefined) => Customer | undefined;
  vehicle: (id: string | null | undefined) => { vehicle: Vehicle; customer: Customer } | undefined;
  customerName: (id: string | null | undefined) => string;
  plate: (id: string | null | undefined) => string;
  vehicleModel: (id: string | null | undefined) => string;
  serviceName: (id: string | null | undefined) => string;
  branchName: (id: string | null | undefined) => string;
  booking: (id: string | null | undefined) => Booking | undefined;
  branchIds: string[];
}

/** Read-only lookups over the already-loaded workspace state. Missing records resolve to an empty string, never to a raw id. */
export function buildLookups(state: GarageState | null, lang: Locale): Lookups {
  const customers = state?.customers ?? [];
  const byCustomer = new Map(customers.map((customer) => [customer.id, customer]));
  const byVehicle = new Map<string, { vehicle: Vehicle; customer: Customer }>();
  for (const customer of customers) for (const vehicle of customer.vehicles) byVehicle.set(vehicle.id, { vehicle, customer });
  const services = new Map((state?.services ?? []).map((service) => [service.id, service]));
  const branches = new Map<string, NonNullable<GarageState["branches"]>[number]>((state?.branches ?? []).map((branch) => [branch.id, branch]));
  const bookings = new Map((state?.bookings ?? []).map((booking) => [booking.id, booking]));
  return {
    customer: (id) => (id ? byCustomer.get(id) : undefined),
    vehicle: (id) => (id ? byVehicle.get(id) : undefined),
    customerName: (id) => (id ? byCustomer.get(id)?.name ?? "" : ""),
    plate: (id) => (id ? byVehicle.get(id)?.vehicle.plate ?? "" : ""),
    vehicleModel: (id) => (id ? byVehicle.get(id)?.vehicle.makeModel ?? "" : ""),
    serviceName: (id) => {
      const service = id ? services.get(id) : undefined;
      return service ? (lang === "ar" ? service.nameAr ?? service.name : service.name) : "";
    },
    branchName: (id) => {
      const branch = id ? branches.get(id) : undefined;
      return branch ? (lang === "ar" ? branch.nameAr ?? branch.name : branch.name) : "";
    },
    booking: (id) => (id ? bookings.get(id) : undefined),
    branchIds: (state?.branches ?? []).map((branch) => branch.id),
  };
}
