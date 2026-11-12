import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDemoSessionToken,
  hasActiveRealOwner,
  isDemoAuthEnabled,
  listDemoAccounts,
  verifyDemoSessionToken,
} from "./demo-auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("development demo access", () => {
  it("is disabled unless explicitly enabled with a session secret", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GARAGE_DEMO_AUTH_ENABLED", "");
    vi.stubEnv("SESSION_SECRET", "test-only-secret");
    expect(isDemoAuthEnabled()).toBe(false);

    vi.stubEnv("GARAGE_DEMO_AUTH_ENABLED", "true");
    vi.stubEnv("SESSION_SECRET", "");
    expect(isDemoAuthEnabled()).toBe(false);

    vi.stubEnv("SESSION_SECRET", "test-only-secret");
    expect(isDemoAuthEnabled()).toBe(true);
  });

  it("cannot be enabled in production even when the development flag is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GARAGE_DEMO_AUTH_ENABLED", "true");
    vi.stubEnv("SESSION_SECRET", "test-only-secret");
    expect(isDemoAuthEnabled()).toBe(false);
  });

  it("exposes only the fixed temporary role identities", () => {
    expect(listDemoAccounts().map(({ email, role }) => [email, role])).toEqual([
      ["Owner@noemail.com", "owner"],
      ["Manager@noemail.com", "branch-manager"],
      ["Reception@noemail.com", "receptionist"],
      ["Technician@noemail.com", "technician"],
    ]);
  });

  it("does not let a development demo owner block the real Owner bootstrap", () => {
    expect(hasActiveRealOwner(["demo-owner"])).toBe(false);
    expect(hasActiveRealOwner(["demo-owner", "clerk-real-owner"])).toBe(true);
    expect(hasActiveRealOwner([])).toBe(false);
  });

  it("signs short-lived sessions and rejects tampering, expiry, and unknown identities", () => {
    const secret = "test-only-secret";
    const now = Date.now();
    const token = createDemoSessionToken("demo-owner", now + 60_000, secret);

    expect(verifyDemoSessionToken(token, now, secret)?.role).toBe("owner");
    expect(verifyDemoSessionToken(token, now + 60_001, secret)).toBeNull();
    expect(verifyDemoSessionToken(`${token}x`, now, secret)).toBeNull();
    expect(verifyDemoSessionToken(createDemoSessionToken("demo-owner", now + 60_000, secret), now, "another-secret")).toBeNull();
    expect(() => createDemoSessionToken("arbitrary-user", now + 60_000, secret)).toThrow();
  });
});
