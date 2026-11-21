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
