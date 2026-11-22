import { describe, expect, it } from "vitest";
import { parseCancellationReason } from "./cancellation-reason";

describe("parseCancellationReason", () => {
  it("requires a reason for cancel and no-show, ignores other stages", () => {
    expect(parseCancellationReason("cancelled", undefined)).toEqual({ ok: false });
    expect(parseCancellationReason("no-show", undefined)).toEqual({ ok: false });
    expect(parseCancellationReason("ready", "x")).toEqual({ ok: true, reason: null });
  });
  it("rejects short or non-string reasons for cancel and no-show", () => {
    expect(parseCancellationReason("cancelled", "  ab ")).toEqual({ ok: false });
    expect(parseCancellationReason("no-show", 5)).toEqual({ ok: false });
  });
  it("trims a valid reason", () => {
    expect(parseCancellationReason("no-show", "  customer unreachable ")).toEqual({ ok: true, reason: "customer unreachable" });
  });
});
