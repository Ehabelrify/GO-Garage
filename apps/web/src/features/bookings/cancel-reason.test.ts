import { describe, expect, it } from "vitest";
import { cancelReasonReady, combineCancelReason } from "./cancel-reason";

describe("cancel reason", () => {
  it("combines category and text", () => { expect(combineCancelReason("no-show", "  did not arrive ")).toBe("No-show: did not arrive"); });
  it("needs a category and 3 characters", () => {
    expect(cancelReasonReady("", "long enough")).toBe(false);
    expect(cancelReasonReady("other", "ab")).toBe(false);
    expect(cancelReasonReady("other", "abc")).toBe(true);
  });
});
