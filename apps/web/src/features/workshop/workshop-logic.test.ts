import { describe, expect, it } from "vitest";
import type { Job } from "@garage/domain";
import { actionsFor, compareJobs, groupByStage, matchesJob, stageActionLabels } from "./workshop-logic";

const job = (over: Partial<Job>): Job => ({ id: "j", bookingId: "b", customerId: "c", vehicleId: "v", serviceId: "s", branchId: "b1" as Job["branchId"], stage: "received", updatedAt: "", assignedUserId: null, ...over });
const open = { query: "", stage: "all", branch: "all", technicianId: "all" } as const;

describe("workshop logic", () => {
  it("gives technicians one forward action and no destructive ones", () => {
    expect(actionsFor(["qc", "cancelled"], true)).toEqual({ primary: ["qc"], destructive: [] });
    expect(actionsFor(["qc", "cancelled", "no-show"], false)).toEqual({ primary: ["qc"], destructive: ["cancelled", "no-show"] });
  });
  it("limits technician view to own active jobs", () => {
    expect(matchesJob(job({ assignedUserId: "u1" }), "x", { ...open, onlyAssignedTo: "u1" })).toBe(true);
    expect(matchesJob(job({ assignedUserId: "u2" }), "x", { ...open, onlyAssignedTo: "u1" })).toBe(false);
    expect(matchesJob(job({ assignedUserId: "u1", stage: "delivered" }), "x", { ...open, onlyAssignedTo: "u1" })).toBe(false);
  });
  it("filters by unassigned, stage and text", () => {
    expect(matchesJob(job({}), "ABC 123", { ...open, technicianId: "unassigned", query: "abc" })).toBe(true);
    expect(matchesJob(job({ assignedUserId: "u1" }), "abc", { ...open, technicianId: "unassigned" })).toBe(false);
    expect(matchesJob(job({}), "abc", { ...open, stage: "qc" })).toBe(false);
  });
  it("orders by stage then pickup and groups by stage", () => {
    const a = job({ id: "a", stage: "ready" }), b = job({ id: "b", stage: "received" });
    expect([a, b].sort((x, y) => compareJobs(x, y, () => "")).map((j) => j.id)).toEqual(["b", "a"]);
    expect(groupByStage([a, b]).ready).toEqual([a]);
  });
  it("has Arabic labels for every target", () => {
    for (const label of Object.values(stageActionLabels)) expect(label.ar.length).toBeGreaterThan(0);
  });
});
