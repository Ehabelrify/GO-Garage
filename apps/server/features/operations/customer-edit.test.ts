import { describe, expect, it } from "vitest";
import { customerPatchSchema, customerVehicleSchema, normalizePhone, splitMakeModel } from "./customer-edit";

describe("customer edit validation", () => {
  it("accepts a complete patch and rejects unknown or blank fields", () => {
    expect(customerPatchSchema.safeParse({ name: " Mona ", phone: "01001234567", language: "ar" }).success).toBe(true);
    expect(customerPatchSchema.safeParse({ name: "", phone: "01001234567", language: "ar" }).success).toBe(false);
    expect(customerPatchSchema.safeParse({ name: "A", phone: "01001234567", language: "fr" }).success).toBe(false);
    expect(customerPatchSchema.safeParse({ name: "A", phone: "01001234567", language: "en", role: "owner" }).success).toBe(false);
  });
  it("validates vehicles", () => {
    expect(customerVehicleSchema.safeParse({ plate: "ABC 123", makeModel: "Toyota Corolla 2022" }).success).toBe(true);
    expect(customerVehicleSchema.safeParse({ plate: "A", makeModel: "Toyota" }).success).toBe(false);
  });
  it("normalises phones", () => {
    expect(normalizePhone("+20 100 123 4567")).toBe("201001234567");
    expect(normalizePhone("123")).toBeNull();
  });
  it("splits make, model and year", () => {
    expect(splitMakeModel("Toyota Corolla 2022")).toEqual({ make: "Toyota", model: "Corolla", year: 2022 });
    expect(splitMakeModel("Kia")).toEqual({ make: "Kia", model: "Vehicle", year: null });
  });
});

describe("plate validation and duplicate lookup", () => {
  it("accepts Arabic, Arabic-digit and Latin plates and rejects junk", async () => {
    const { plateField } = await import("./customer-edit");
    for (const plate of ["أ ب ج 1234", "ابج١٢٣٤", "ABC-123"]) expect(plateField.safeParse(plate).success, plate).toBe(true);
    for (const plate of ["1234", "ابج", "!!", "ا ب ج 12345678"]) expect(plateField.safeParse(plate).success, plate).toBe(false);
  });
  it("queries by canonical key and scope and maps the existing vehicle", async () => {
    const { findDuplicatePlate } = await import("./customer-edit");
    const calls: unknown[][] = [];
    const db = { query: async (_text: string, values: unknown[]) => { calls.push(values); return { rows: [{ id: "veh-1", customer_id: "c-1", plate: "أ ب ج 1234" }] }; } };
    expect(await findDuplicatePlate(db, "ابج١٢٣٤", { customerId: "c-1", branchIds: ["b1"] })).toEqual({ vehicleId: "veh-1", customerId: "c-1", plate: "أ ب ج 1234" });
    expect(calls[0]).toEqual(["ابج1234", "c-1", ["b1"]]);
    expect(await findDuplicatePlate({ query: async () => ({ rows: [] }) }, "ابج1234", { branchIds: [] })).toBeNull();
    expect(await findDuplicatePlate(db, "  ", { branchIds: [] })).toBeNull();
  });
});
