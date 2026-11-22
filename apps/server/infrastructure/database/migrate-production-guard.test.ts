import { describe, expect, it } from "vitest";
import { databaseNameFromUrl, parseTarget, planProductionMigration } from "./migrate-production-guard";

const env = { GARAGE_ALLOW_PRODUCTION_MIGRATION: "yes", DATABASE_URL: "postgres://u:p@host:5432/garage_prod?sslmode=require" };

describe("production migration guard", () => {
  it("reads the database name", () => {
    expect(databaseNameFromUrl(env.DATABASE_URL)).toBe("garage_prod");
    expect(databaseNameFromUrl("nonsense")).toBe("");
  });
  it("parses both --target forms", () => {
    expect(parseTarget(["--target", "a"])).toBe("a");
    expect(parseTarget(["--target=b"])).toBe("b");
    expect(parseTarget(["--target", "--dry-run"])).toBeUndefined();
    expect(parseTarget([])).toBeUndefined();
  });
  it("refuses without the env confirmation, target, or on mismatch", () => {
    expect(planProductionMigration({ ...env, GARAGE_ALLOW_PRODUCTION_MIGRATION: "true" }, ["--target", "garage_prod"]).ok).toBe(false);
    expect(planProductionMigration(env, []).ok).toBe(false);
    expect(planProductionMigration(env, ["--target", "other"]).ok).toBe(false);
    expect(planProductionMigration({ GARAGE_ALLOW_PRODUCTION_MIGRATION: "yes" }, ["--target", "x"]).ok).toBe(false);
  });
  it("accepts a matching target and detects dry run", () => {
    expect(planProductionMigration(env, ["--target", "garage_prod"])).toEqual({ ok: true, plan: { target: "garage_prod", dryRun: false, databaseName: "garage_prod" } });
    const dry = planProductionMigration(env, ["--target=garage_prod", "--dry-run"]);
    expect(dry.ok && dry.plan.dryRun).toBe(true);
  });
});
