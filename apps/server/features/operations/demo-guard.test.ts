import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/express", () => ({ clerkClient: {} }));
vi.mock("../../infrastructure/database/db", () => ({ pool: {}, withTransaction: vi.fn() }));

import { rejectDemoActor } from "./api";

function fakeRes() {
  const res: any = { status: vi.fn(() => res), json: vi.fn(() => res) };
  return res;
}

describe("rejectDemoActor", () => {
  it("sends 403 DEMO_ACTION_DISABLED for demo actors", () => {
    const res = fakeRes();
    expect(rejectDemoActor(res, { isDemo: true }, "no")).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ code: "DEMO_ACTION_DISABLED", message: "no" });
  });
  it("lets real actors through untouched", () => {
    const res = fakeRes();
    expect(rejectDemoActor(res, { isDemo: false }, "no")).toBe(false);
    expect(rejectDemoActor(res, {}, "no")).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });
});
