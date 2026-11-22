import { describe, expect, it } from "vitest";
import { checklistSummary, evaluateReadyGate, identifyJobPhoto, issueSchema, noteSchema, type ChecklistItemLike } from "./tech-rules";

const item = (id: string, mandatory: boolean, done: boolean): ChecklistItemLike => ({ id, labelEn: id, labelAr: id, mandatory, done });
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const pdf = Buffer.from("%PDF-1.7 test");

describe("checklist gate", () => {
  const open = [item("a", true, true), item("b", true, false), item("c", false, false)];
  it("allows when every mandatory item is done (optional ones may stay open)", () => {
    expect(evaluateReadyGate({ items: [item("a", true, true), item("c", false, false)], role: "technician" })).toEqual({ outcome: "allow" });
    expect(checklistSummary(open)).toMatchObject({ mandatoryTotal: 2, mandatoryDone: 1, readyForStage: false });
  });
  it("blocks a technician even with a reason", () => {
    const gate = evaluateReadyGate({ items: open, role: "technician", overrideReason: "in a hurry please" });
    expect(gate.outcome).toBe("blocked");
    expect(gate.outcome === "blocked" && gate.remaining.map((i) => i.id)).toEqual(["b"]);
  });
  it("blocks a manager without a reason and lets one override with a reason", () => {
    expect(evaluateReadyGate({ items: open, role: "branch-manager" }).outcome).toBe("blocked");
    expect(evaluateReadyGate({ items: open, role: "branch-manager", overrideReason: "  " }).outcome).toBe("blocked");
    expect(evaluateReadyGate({ items: open, role: "owner", overrideReason: "Customer waiting, checked by hand" })).toMatchObject({ outcome: "override", reason: "Customer waiting, checked by hand" });
  });
  it("does not gate read-only demo identities", () => {
    expect(evaluateReadyGate({ items: open, role: "technician", isDemo: true }).outcome).toBe("allow");
  });
});

describe("photo and input validation", () => {
  it("accepts matching jpg/png and rejects pdf, mismatched extension and junk", () => {
    expect(identifyJobPhoto(png, "front.png")?.contentType).toBe("image/png");
    expect(identifyJobPhoto(jpeg, "front.JPEG")?.contentType).toBe("image/jpeg");
    expect(identifyJobPhoto(pdf, "x.pdf")).toBeNull();
    expect(identifyJobPhoto(png, "front.jpg")).toBeNull();
    expect(identifyJobPhoto(Buffer.from("not an image"), "a.png")).toBeNull();
  });
  it("validates notes and issues", () => {
    expect(noteSchema.safeParse({ body: "  " }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "ok" }).success).toBe(true);
    expect(issueSchema.safeParse({ kind: "delay", note: "Waiting for film" }).success).toBe(true);
    expect(issueSchema.safeParse({ kind: "other", note: "x" }).success).toBe(false);
    expect(issueSchema.safeParse({ kind: "delay", note: "x", extra: 1 }).success).toBe(false);
  });
});
