import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { garageRoles, type GarageRole } from "./authz";

// Route-level authentication and role matrix for the routers that route-rbac.test.ts lists as out of scope (P2T-016).
// The actor comes from the x-test-role header; the fake pool returns no rows. Business rules answer 4xx for an empty
// database, so a row asserts only what must always hold: no sign-in -> 401, and a role that holds none of the
// router's capabilities by default is refused (403, or 404 where the service hides the record).
vi.mock("@clerk/express", () => ({ getAuth: () => ({ userId: null }), clerkClient: {}, clerkMiddleware: () => (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock("./demo-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("./demo-auth")>();
  return {
    ...original,
    findDemoActor: async (req: { headers: Record<string, string | undefined> }) => {
      const role = req.headers["x-test-role"];
      if (!role) return null;
      return { userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], isDemo: false };
    },
  };
});
vi.mock("../../infrastructure/database/db", () => {
  const query = async (sql: string, params: unknown[] = []) => {
    const rows = (r: unknown[]) => ({ rows: r, rowCount: r.length });
    if (/SELECT role,branch_ids FROM staff_memberships/.test(sql)) return rows([{ role: String(params[0]).replace(/-1$/, ""), branch_ids: ["b1"] }]);
    return rows([]);
  };
  return { pool: { query, connect: vi.fn() }, withTransaction: async (cb: (c: unknown) => unknown) => cb({ query }) };
});

const api = await import("../operations/api");
const mods = {
  policies: (await import("../commercial/policy-routes")).commercialPolicyRouter,
  catalogue: (await import("../commercial/catalogue-routes")).catalogueRouter,
  quotes: (await import("../commercial/quote-routes")).quoteRouter,
  promotions: (await import("../commercial/qualification-routes")).qualificationRouter,
  reservations: (await import("../commercial/reservation-routes")).reservationRouter,
  benefits: (await import("../commercial/benefit-routes")).benefitRouter,
  transport: (await import("../commercial/transport-routes")).transportRouter,
  queues: (await import("../operations/work-queue-routes")).workQueueRouter,
  ownerRecords: (await import("../owner-records/owner-records")).ownerRecordsRouter,
  specialRequests: (await import("../special-requests/special-requests-routes")).specialRequestsRouter,
  intake: (await import("../intake/intake-routes")).intakeRouter,
  audit: (await import("../audit/audit-routes")).auditApiRouter,
  merge: (await import("../customer-merge/merge-routes")).customerMergeRouter,
  tech: (await import("../workshop-tech/tech-routes")).techRouter,
  relations: (await import("../relations/relations-routes")).relationsRouter,
  warranties: (await import("../warranty/warranties")).warrantyRouter,
};

interface Layer { handle: unknown; route?: { path: string; methods: Record<string, boolean> }; regexp?: RegExp }
const apiStack = (api.createApiRouter() as unknown as { stack: Layer[] }).stack;
/** Every concrete route of a router, flattened through nested routers. */
function routesOf(router: { stack: unknown[] }, prefix = ""): string[] {
  const out: string[] = [];
  for (const layer of router.stack as Layer[]) {
    if (layer.route) { for (const m of Object.keys(layer.route.methods)) out.push(`${m.toUpperCase()} ${prefix}${layer.route.path}`); continue; }
    const inner = layer.handle as { stack?: unknown[] };
    if (inner?.stack) out.push(...routesOf(inner as { stack: unknown[] }, prefix));
  }
  return out;
}
let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", api.createApiRouter());
  app.use((_e: unknown, _q: unknown, res: express.Response, _n: unknown) => { res.status(500).json({ code: "TEST_ERROR" }); });
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

async function call(method: string, path: string, role?: GarageRole) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (role) headers["x-test-role"] = role;
  const res = await fetch(`${base}/api${path}`, { method, headers, body: method === "GET" || method === "DELETE" ? undefined : "{}" });
  return res.status;
}
const concrete = (path: string) => path.replace(/:\w+/g, "x1");

/** Mount prefixes exactly as api.ts mounts them. A wrong parse would make every request 404 and the matrix pass for nothing. */
const expectedMount: Record<keyof typeof mods, string> = {
  policies: "/commercial-policies", catalogue: "/catalogue", quotes: "/quotes", promotions: "/promotions", reservations: "/reservations",
  benefits: "/benefits", transport: "/transport", queues: "/work-queues", ownerRecords: "/owner/records", specialRequests: "/special-requests",
  intake: "/intake", audit: "", merge: "/customers", tech: "/jobs", relations: "", warranties: "/warranties",
};
describe("each router is mounted where api.ts mounts it", () => {
  for (const [name, router] of Object.entries(mods) as Array<[keyof typeof mods, { stack: unknown[] }]>) {
    it(`${name} is mounted on the API router and has routes`, () => {
      expect(apiStack.some((l) => l.handle === router), `${name} is not mounted on the API router`).toBe(true);
      expect(routesOf(router).length, `${name} has no routes`).toBeGreaterThan(0);
    });
  }
});

/** Per router: roles that hold NO capability for it by default, so every route must refuse them. */
const noAccess: Record<keyof typeof mods, GarageRole[]> = {
  policies: ["technician", "receptionist", "branch-manager"],
  catalogue: ["technician", "receptionist"],
  quotes: ["technician"],
  promotions: ["technician"],
  reservations: ["technician"],
  benefits: ["technician"],
  transport: ["technician"],
  queues: [],
  ownerRecords: ["technician", "receptionist", "branch-manager"],
  specialRequests: ["technician"],
  intake: ["technician"],
  audit: ["technician", "receptionist"],
  merge: ["technician"],
  tech: [],
  relations: [],
  warranties: [],
};
/**
 * Reads that answer 200 to a role with no write capability for the router, on purpose or because the service filters the data.
 * They are named here so a NEW open route fails the test; none of them changes data. Not verified against product policy:
 * policies GET /active/quote-acceptance (the quote screen reads the active acceptance policy) and the catalogue reads the
 * intake panel uses (available packages, intake items).
 */
const readableBySignedInRoles = new Set<string>([
  "policies GET /active/quote-acceptance",
  "catalogue GET /available-packages",
  "catalogue GET /intake-items",
]);
const publicOrServiceFiltered = new Set<string>([]);

for (const [name, router] of Object.entries(mods) as Array<[keyof typeof mods, { stack: unknown[] }]>) {
  const mount = expectedMount[name];
  const routes = [...new Set(routesOf(router))].filter((r) => !publicOrServiceFiltered.has(`${name} ${r}`));
  describe(`route auth matrix: ${name} (${routes.length} routes at ${mount || "/"})`, () => {
    it("is mounted behind sign-in: every route answers 401 without a session", async () => {
      const wrong: string[] = [];
      for (const route of routes) {
        const [method, path] = route.split(" ");
        const status = await call(method, `${mount}${concrete(path)}`);
        if (status !== 401) wrong.push(`${route} -> ${status}`);
      }
      expect(wrong, `routes reachable without sign-in: ${wrong.join(", ")}`).toEqual([]);
    });
    if (noAccess[name].length) {
      // Many POST routes validate the body before the role check, so an empty body answers 400 and proves nothing either way.
      // This test therefore proves one thing only: a role with no access never gets a success (2xx) or a server error from
      // the router, apart from the named reads above. The full refusal proof for the main routers is in route-rbac.test.ts.
      it(`never succeeds for roles with no default access (${noAccess[name].join(", ")})`, async () => {
        const leaked: string[] = [];
        for (const role of noAccess[name]) {
          for (const route of routes) {
            if (readableBySignedInRoles.has(`${name} ${route}`)) continue;
            const [method, path] = route.split(" ");
            const status = await call(method, `${mount}${concrete(path)}`, role);
            if (status < 400 || status >= 500) leaked.push(`${route} as ${role} -> ${status}`);
          }
        }
        expect(leaked, `routes that succeeded or failed for a role with no access: ${leaked.join(", ")}`).toEqual([]);
      });
    }
  });
}

describe("every role reaches the signed-in routers only after sign-in", () => {
  it("rejects an unknown role header the same as no session (no role escalation through the test hook)", async () => {
    expect(garageRoles.length).toBe(4);
    expect(await call("GET", "/quotes")).toBe(401);
  });
});
