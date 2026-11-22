import { describe, expect, it, vi } from "vitest";

vi.mock("../../features/auth/demo-auth", () => ({
  isDemoAuthFlagged: (env: NodeJS.ProcessEnv) =>
    env.GARAGE_ROLE_WIDGET_ENABLED === "true" || env.GARAGE_DEMO_AUTH_ENABLED === "true",
}));

import { assertDemoAuthAllowedForDataset } from "./dataset-boundary";

describe("demo auth vs dataset class startup rule", () => {
  it("fails closed for operational data with either flag", () => {
    expect(() => assertDemoAuthAllowedForDataset({ GARAGE_DATASET_CLASS: "operational", GARAGE_ROLE_WIDGET_ENABLED: "true" })).toThrow();
    expect(() => assertDemoAuthAllowedForDataset({ GARAGE_DATASET_CLASS: "operational", GARAGE_DEMO_AUTH_ENABLED: "true" })).toThrow();
  });
  it("allows operational without the flags and other classes with them", () => {
    expect(() => assertDemoAuthAllowedForDataset({ GARAGE_DATASET_CLASS: "operational" })).not.toThrow();
    expect(() => assertDemoAuthAllowedForDataset({ GARAGE_DATASET_CLASS: "scenario", GARAGE_ROLE_WIDGET_ENABLED: "true" })).not.toThrow();
    expect(() => assertDemoAuthAllowedForDataset({ GARAGE_ROLE_WIDGET_ENABLED: "true" })).not.toThrow();
    expect(() => assertDemoAuthAllowedForDataset({ GARAGE_DATASET_CLASS: "simulation", GARAGE_DEMO_AUTH_ENABLED: "true" })).not.toThrow();
  });
});
