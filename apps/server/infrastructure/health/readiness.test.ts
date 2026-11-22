import { describe, expect, it, vi } from "vitest";
import { checkReadiness } from "./readiness";

const shipped = async () => ["0001_a.sql", "0002_b.sql"];

describe("checkReadiness (P2T-014)", () => {
  it("is ready when the database answers and every shipped migration is applied", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce({ rows: [{ name: "0001_a.sql" }, { name: "0002_b.sql" }, { name: "old.sql" }] });
    expect(await checkReadiness({ query }, shipped)).toEqual({ ready: true, database: "ok", schema: "current", pending: [] });
  });
  it("is not ready when the build is ahead of the schema", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce({ rows: [{ name: "0001_a.sql" }] });
    expect(await checkReadiness({ query }, shipped)).toMatchObject({ ready: false, schema: "behind", pending: ["0002_b.sql"] });
  });
  it("is not ready when the database is unreachable, without throwing", async () => {
    const query = vi.fn().mockRejectedValue(new Error("down"));
    expect(await checkReadiness({ query }, shipped)).toEqual({ ready: false, database: "unreachable", schema: "unknown", pending: [] });
  });
  it("reports unknown schema when the migrations table cannot be read", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{}] }).mockRejectedValueOnce(new Error("no table"));
    expect(await checkReadiness({ query }, shipped)).toMatchObject({ ready: false, database: "ok", schema: "unknown" });
  });
});
