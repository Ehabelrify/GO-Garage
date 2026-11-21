import { describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";

vi.mock("../../infrastructure/database/db", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
  withTransaction: vi.fn(),
}));
const { listAvailablePackages, getVehicleSelection } = await import("./catalogue-service");
const { getActiveQuoteAcceptance } = await import("./policy-service");
const { pool } = await import("../../infrastructure/database/db");

const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor => ({
  userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], ...extra,
});

describe("quoting read endpoints", () => {
  it("deny technicians before touching the database", async () => {
    const tech = actor("technician");
    await expect(listAvailablePackages(tech)).rejects.toMatchObject({ status: 403 });
    await expect(getVehicleSelection(tech, "v1")).rejects.toMatchObject({ status: 403 });
    await expect(getActiveQuoteAcceptance(tech)).rejects.toMatchObject({ status: 403 });
    expect(pool.query).not.toHaveBeenCalled();
  });
  it("lets a receptionist read and returns unconfigured when no acceptance policy is active", async () => {
    await expect(listAvailablePackages(actor("receptionist"))).resolves.toEqual({ packages: [], categories: [] });
    await expect(getActiveQuoteAcceptance(actor("receptionist"))).resolves.toMatchObject({ state: "unconfigured" });
    await expect(getVehicleSelection(actor("receptionist"), "missing")).rejects.toMatchObject({ status: 404 });
  });
  it("honours a revoked bookings.manage override", async () => {
    await expect(listAvailablePackages(actor("receptionist", { permissions: { "bookings.manage": false } }))).rejects.toMatchObject({ status: 403 });
  });
});
