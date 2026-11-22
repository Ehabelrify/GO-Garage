import { describe, expect, it } from "vitest";
import type { Job } from "@garage/domain";
import { actionLabelFor, actionsFor, boardCount, capColumn, columnTracks, compareJobs, groupByStage, isOverdue, matchesJob, stageActionLabels, technicianCounts } from "./workshop-logic";

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
  it("caps columns and reports the remainder", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(capColumn(items, false, 6)).toEqual({ shown: items.slice(0, 6), more: 4 });
    expect(capColumn(items, true, 6).more).toBe(0);
    expect(capColumn([1, 2], false, 6)).toEqual({ shown: [1, 2], more: 0 });
  });
  it("counts the board without closed jobs and per technician", () => {
    const jobs = [job({ id: "a", stage: "ready", assignedUserId: "u1" }), job({ id: "b", stage: "delivered" }), job({ id: "c", stage: "booked" })];
    expect(boardCount(groupByStage(jobs))).toBe(2);
    expect(technicianCounts(jobs)).toEqual({ all: 3, unassigned: 2, u1: 1 });
  });
  it("shrinks empty column tracks", () => {
    expect(columnTracks(groupByStage([job({ stage: "received" })])).split(" minmax").length).toBe(5);
    expect(columnTracks(groupByStage([job({ stage: "received" })]))).toContain(".55fr");
  });
  it("flags overdue open jobs only", () => {
    expect(isOverdue("2026-11-20", "received", "2026-11-22")).toBe(true);
    expect(isOverdue("2026-11-22", "received", "2026-11-22")).toBe(false);
    expect(isOverdue("2026-11-20", "delivered", "2026-11-22")).toBe(false);
    expect(isOverdue("9999-12-31", "received", "2026-11-22")).toBe(false);
  });
  it("uses Start/Done wording for technicians", () => {
    expect(actionLabelFor("in-service", true).en).toBe("Start job");
    expect(actionLabelFor("qc", true).en).toBe("Done");
    expect(actionLabelFor("qc", false)).toEqual(stageActionLabels.qc);
  });
});
