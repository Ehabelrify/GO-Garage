import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { capabilities, garageRoles, ownerOnlyCapabilities, type Capability, type GarageRole } from "./authz";

// Route-level permission matrix (P2T-016, P2T-002) for the main routers, driven by ONE table below.
// The actor comes from the x-test-role header (plus optional x-test-caps JSON overrides); the fake pool returns no rows.
vi.mock("@clerk/express", () => ({ getAuth: () => ({ userId: null }), clerkClient: {}, clerkMiddleware: () => (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock("./demo-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("./demo-auth")>();
  return {
    ...original,
    findDemoActor: async (req: { headers: Record<string, string | undefined> }) => {
      const role = req.headers["x-test-role"];
      if (!role) return null;
      const permissions = req.headers["x-test-caps"] ? JSON.parse(String(req.headers["x-test-caps"])) : undefined;
      return { userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], permissions, isDemo: false };
    },
  };
});
vi.mock("../../infrastructure/database/db", () => {
  // Every query returns no rows except the few lookups a route makes before its own role check.
  const query = async (sql: string, params: unknown[] = []) => {
    const rows = (r: unknown[]) => ({ rows: r, rowCount: r.length });
    if (/SELECT role,branch_ids FROM staff_memberships/.test(sql)) return rows([{ role: String(params[0]).replace(/-1$/, ""), branch_ids: ["b1"] }]);
    if (/SELECT b\.branch_id,j\.id AS job_id/.test(sql)) return rows([{ branch_id: "b1", job_id: "j1" }]);
    if (/FROM pickup_commitments WHERE id=/.test(sql)) return rows([{ booking_id: "bk1", promised_at: null }]);
    if (/FROM messaging_channels WHERE id=/.test(sql)) return rows([{ channels: "1", customers: "1" }]);
    return rows([]);
  };
  return { pool: { query, connect: vi.fn() }, withTransaction: async (cb: (c: unknown) => unknown) => cb({ query }) };
});

const api = await import("../operations/api");
const invoices = await import("../invoicing/invoice-routes");
const finance = await import("../finance/finance-routes");
const delivery = await import("../document-delivery/document-delivery-routes");
const pickup = await import("../commercial/pickup-commitment-routes");
const reminders = await import("../reminders/reminder-routes");
const whatsapp = await import("../whatsapp/whatsapp");
const consents = await import("../whatsapp/consent-routes");
// Routers mounted on the API router that this file does not cover; a mounted router in neither list fails the drift guard.
const outOfScope = [
  (await import("../commercial/policy-routes")).commercialPolicyRouter,
  (await import("../commercial/catalogue-routes")).catalogueRouter,
  (await import("../commercial/quote-routes")).quoteRouter,
  (await import("../commercial/qualification-routes")).qualificationRouter,
  (await import("../commercial/reservation-routes")).reservationRouter,
  (await import("../commercial/benefit-routes")).benefitRouter,
  (await import("../commercial/transport-routes")).transportRouter,
  (await import("../operations/work-queue-routes")).workQueueRouter,
  (await import("../owner-records/owner-records")).ownerRecordsRouter,
  (await import("../special-requests/special-requests-routes")).specialRequestsRouter,
  (await import("../intake/intake-routes")).intakeRouter,
  (await import("../audit/audit-routes")).auditApiRouter,
  (await import("../customer-merge/merge-routes")).customerMergeRouter,
  (await import("../workshop-tech/tech-routes")).techRouter,
  (await import("../relations/relations-routes")).relationsRouter,
  (await import("../warranty/warranties")).warrantyRouter,
  (await import("../warranty/warranties")).publicWarrantyVerificationRouter,
  (await import("../whatsapp/provider-webhook")).providerWebhookRouter,
];

interface Gate {
  /** Capabilities the route needs (all of them). Owner-only capabilities imply an owner-only route. */
  caps?: Capability[];
  /** Roles that may pass the role check (omit = any role holding the capabilities). */
  roles?: GarageRole[];
  /** Any signed-in actor passes (only requireMembership guards it). */
  open?: boolean;
  body?: unknown;
  query?: string;
  headers?: Record<string, string>;
  /** Status returned to a denied caller when the route hides itself instead of answering 403. */
  denyStatus?: number;
}
type Entry = [method: string, pattern: string, gate: Gate];
interface Group { name: string; router: { stack: unknown[] }; prefix: string; entries: Entry[]; allow: string[] }

const draft = { expectedRevision: 1, taxRatePercent: null, lines: [{ kind: "service", descriptionEn: "Oil", quantity: 1, unitMinor: 100 }] };
const rev = { expectedRevision: 1 };
const moneyEvent = { kind: "collection", amount: { minor: 100, currency: "EGP" }, effectiveAt: "2026-01-01T10:00:00.000Z", branchId: "b1", sourceMethod: "cash", sourceReference: "r1", definition: { id: "d", version: 1 }, reason: "test", evidenceRef: "private:x/y", idempotencyKey: "k1" };
const rangeQuery = "branchId=b1&from=2026-01-01&to=2026-01-31&groupBy=day";
const docSend = (documentKind: string) => ({ documentKind, documentId: "d1", channel: "whatsapp", idempotencyKey: "key-12345678" });
const pickHeaders = { "idempotency-key": "pk-1" };
const wa: Gate = { caps: ["whatsapp.use"] };

const groups: Group[] = [
  { name: "api", router: api.createApiRouter() as never, prefix: "", allow: ["GET /health", "GET /demo/session", "POST /demo/session", "DELETE /demo/session"], entries: [
    ["GET", "/session", { open: true }],
    ["GET", "/bootstrap", { open: true }],
    ["PATCH", "/settings", { caps: ["settings.manage"] }],
    ["POST", "/customers", { caps: ["bookings.manage"] }],
    ["PATCH", "/customers/:id", { caps: ["bookings.manage"] }],
    ["POST", "/customers/:id/vehicles", { caps: ["bookings.manage"] }],
    ["GET", "/availability/config/:branchId", { roles: ["owner"] }],
    ["PUT", "/availability/config/:branchId", { roles: ["owner"] }],
    ["GET", "/availability/slots", { caps: ["bookings.manage"] }],
    ["POST", "/bookings", { caps: ["bookings.manage"] }],
    ["PATCH", "/bookings/:bookingId/confirm", { caps: ["bookings.manage"] }],
    ["PATCH", "/bookings/:bookingId/reschedule", { caps: ["bookings.manage"] }],
    ["PATCH", "/bookings/:bookingId/cancel", { caps: ["bookings.manage"] }],
    ["PATCH", "/jobs/:jobId/stage", { roles: ["owner", "branch-manager", "technician"] }],
    ["PATCH", "/jobs/:jobId/assignment", { roles: ["owner", "branch-manager"] }],
    ["GET", "/staff", { roles: ["owner", "branch-manager"] }],
    ["POST", "/staff/invitations", { caps: ["staff.manage"] }],
    ["DELETE", "/staff/invitations/:invitationId", { caps: ["staff.manage"] }],
    ["PUT", "/staff/:userId/permissions", { caps: ["staff.manage"] }],
    ["DELETE", "/staff/:userId", { caps: ["staff.manage"] }],
  ] },
  { name: "invoices", router: invoices.invoiceRouter, prefix: "/invoices", allow: [], entries: [
    ["GET", "/", { caps: ["invoices.view"] }],
    ["POST", "/generate", { caps: ["invoices.view", "invoices.manage"], body: { jobId: "j1" } }],
    ["GET", "/:id", { caps: ["invoices.view"] }],
    ["PUT", "/:id", { caps: ["invoices.view", "invoices.manage"], body: draft }],
    ["POST", "/:id/issue", { caps: ["invoices.view", "invoices.manage"], body: rev }],
    ["POST", "/:id/payments", { caps: ["invoices.view", "invoices.payments"], body: { ...rev, amountMinor: 100, method: "cash", reference: "r1", receivedOn: "2026-01-01" } }],
    ["POST", "/:id/void", { caps: ["invoices.view", "invoices.payments"], body: { ...rev, reason: "mistake" } }],
    ["POST", "/:id/payments/:paymentId/reverse", { caps: ["invoices.view", "invoices.payments"], body: { reason: "wrong amount", idempotencyKey: "key-12345678" } }],
    ["POST", "/:id/refunds", { caps: ["invoices.view", "invoices.payments"], body: { amountMinor: 100, reason: "goodwill", evidenceRef: "private:refund/1", idempotencyKey: "key-12345678" } }],
  ] },
  { name: "finance", router: finance.financeRouter, prefix: "/finance", allow: [], entries: [
    ["GET", "/events", { caps: ["finance.view"] }],
    ["POST", "/events", { roles: ["owner"], body: moneyEvent }],
    ["POST", "/events/reverse", { roles: ["owner"], body: { eventId: "e1", reason: "x", evidenceRef: "private:x/y", idempotencyKey: "k2" } }],
    ["POST", "/definitions/attest", { roles: ["owner"], body: { definition: { id: "d", version: 1 }, evidenceRef: "private:x/y" } }],
    ["GET", "/report", { caps: ["finance.view"], query: rangeQuery }],
    ["GET", "/drilldown", { caps: ["finance.view"], query: `${rangeQuery}&metricId=collections` }],
  ] },
  { name: "document-delivery", router: delivery.documentDeliveryRouter, prefix: "/document-delivery", allow: [], entries: [
    // The capability depends on the document kind: one row per kind (the drift guard dedupes on method + path).
    ["POST", "/send", { caps: ["invoices.view"], body: docSend("invoice") }],
    ["POST", "/send", { caps: ["quotes.view"], body: docSend("quote") }],
    ["POST", "/send", { caps: ["warranty.view"], body: docSend("warranty-card") }],
    ["GET", "/history", { caps: ["invoices.view"], query: "documentKind=invoice&documentId=d1" }],
  ] },
  { name: "pickup-commitments", router: pickup.pickupCommitmentRouter, prefix: "/pickup-commitments", allow: [], entries: [
    ["GET", "/", { roles: ["owner", "branch-manager"], query: "bookingId=bk1" }],
    ["POST", "/", { roles: ["owner", "branch-manager"], headers: pickHeaders, body: { bookingId: "bk1", promisedAt: "2026-02-01T10:00:00.000Z", evidenceRef: "private:x/y", reason: "agreed", expectedRevision: 0 } }],
    ["POST", "/:id/cancel", { roles: ["owner", "branch-manager"], headers: pickHeaders, body: { reason: "changed", expectedRevision: 1 } }],
  ] },
  { name: "reminders", router: reminders.remindersRouter, prefix: "/reminders", allow: [], entries: [
    ["GET", "/", { caps: ["bookings.manage"] }],
    ["GET", "/rules", { caps: ["bookings.manage"] }],
    ["PUT", "/rules/:kind", { caps: ["bookings.manage"], roles: ["owner"], body: { expectedRevision: 0 } }],
    ["POST", "/rules/preview", { open: true, body: { kind: "k", template: "t", lang: "en" } }],
    ["POST", "/run", { caps: ["bookings.manage"], roles: ["owner", "branch-manager"] }],
    ["POST", "/:id/send", { caps: ["bookings.manage"] }],
    ["POST", "/:id/skip", { caps: ["bookings.manage"] }],
    ["POST", "/:id/snooze", { caps: ["bookings.manage"], body: { days: 1 } }],
  ] },
  { name: "whatsapp", router: whatsapp.createWhatsAppRouter() as never, prefix: "/whatsapp", allow: [], entries: [
    ["GET", "/status", wa],
    ["GET", "/services", wa],
    ["GET", "/branches", wa],
    ["PUT", "/inbox-memberships/:userId", { roles: ["owner"], body: { active: true } }],
    ["GET", "/staff", wa],
    ["POST", "/conversations/:conversationId/service-question", wa],
    ["GET", "/conversations", wa],
    ["POST", "/conversations", wa],
    ["GET", "/conversations/:conversationId", wa],
    ["POST", "/conversations/:conversationId/link", { caps: ["whatsapp.use", "bookings.manage"] }],
    ["POST", "/conversations/:conversationId/messages", wa],
    ["POST", "/conversations/:conversationId/action", wa],
    ["GET", "/availability", wa],
    ["POST", "/conversations/:conversationId/booking-draft", wa],
    ["POST", "/conversations/:conversationId/booking-confirm", wa],
    ["POST", "/conversations/:conversationId/booking-change", wa],
    ["POST", "/conversations/:conversationId/status-lookup", wa],
  ] },
  { name: "whatsapp-consents", router: consents.customerConsentRouter, prefix: "/whatsapp/consents", allow: [], entries: [
    ["GET", "/", { caps: ["whatsapp.use"], query: "channelId=ch&customerId=c1&purpose=service", denyStatus: 404 }],
    ["PUT", "/", { caps: ["whatsapp.use"], body: { channelId: "ch", customerId: "c1", purpose: "service", action: "revoke", reason: "other" } }],
  ] },
];
const apiGroup = groups[0];
const subRouters = new Set<unknown>(groups.slice(1).map((g) => g.router));

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiGroup.router as never);
  app.use((_e: unknown, _q: unknown, res: express.Response, _n: unknown) => { res.status(500).json({ code: "TEST_ERROR" }); });
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

type CapMap = Partial<Record<Capability, boolean>>;
async function call(g: Group, [method, pattern, gate]: Entry, role?: GarageRole, caps?: CapMap) {
  const path = (g.prefix + pattern).replace(/\/$/, "").replace(/:\w+/g, "x1") || "/";
  const headers: Record<string, string> = { "content-type": "application/json", ...gate.headers };
  if (role) headers["x-test-role"] = role;
  if (caps) headers["x-test-caps"] = JSON.stringify(caps);
  const res = await fetch(`${base}/api${path}${gate.query ? `?${gate.query}` : ""}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(gate.body ?? {}) });
  lastCode = ((await res.json().catch(() => ({}))) as { code?: string }).code;
  return res.status;
}
let lastCode: string | undefined;
// A 403 from a business rule (branch scope, simulator mode) is not a role refusal; only these codes mean "your role/capability is not enough".
const roleRefusalCodes = ["ROLE_FORBIDDEN", "OWNER_REQUIRED", "FINANCE_VIEW_REQUIRED", "FORBIDDEN", "SIGN_IN_REQUIRED"];

const allOn = (caps: Capability[]) => Object.fromEntries(caps.map((c) => [c, true])) as CapMap;
const rolesFor = (gate: Gate): GarageRole[] => gate.roles ?? ((gate.caps ?? []).some((c) => ownerOnlyCapabilities.includes(c)) ? ["owner"] : [...garageRoles]);

for (const g of groups) {
  describe(`route permission matrix: ${g.name}`, () => {
    for (const entry of g.entries) {
      const [method, pattern, gate] = entry;
      const kind = (gate.body as { documentKind?: string } | undefined)?.documentKind;
      const label = `${method} ${g.prefix}${pattern}${kind ? ` [${kind}]` : ""}`;
      const caps = gate.caps ?? [];
      const allowedRoles = rolesFor(gate);
      it(`${label}: unauthenticated -> 401`, async () => {
        expect(await call(g, entry)).toBe(401);
      });
      it(`${label}: permitted actors are not refused`, async () => {
        for (const role of allowedRoles) {
          const status = await call(g, entry, role, allOn(caps));
          const refused = status === 401 || (status === 403 && (lastCode === undefined || roleRefusalCodes.includes(lastCode)));
          expect(refused, `${label} as ${role} -> ${status} ${lastCode}`).toBe(false);
        }
      });
      if (gate.open) continue;
      it(`${label}: roles outside the gate are denied`, async () => {
        for (const role of garageRoles.filter((r) => !allowedRoles.includes(r))) {
          expect(await call(g, entry, role, allOn(caps)), `${label} as ${role}`).toBe(gate.denyStatus ?? 403);
        }
      });
      for (const cap of caps.filter((c) => !ownerOnlyCapabilities.includes(c))) {
        it(`${label}: revoking ${cap} is denied`, async () => {
          const role = allowedRoles.find((r) => r !== "owner");
          if (!role) return; // owner-only route: the role test above is the gate
          expect(await call(g, entry, role, { ...allOn(caps), [cap]: false }), `${label} as ${role}`).toBe(gate.denyStatus ?? 403);
        });
      }
      for (const cap of caps.filter((c) => ownerOnlyCapabilities.includes(c))) {
        it(`${label}: granting owner-only ${cap} to a manager does not open it`, async () => {
          expect(await call(g, entry, "branch-manager", { [cap]: true }), label).toBe(403);
        });
      }
    }
  });
}

describe("explicit capability overrides", () => {
  const invoicesGet = groups[1].entries[0];
  it("a revoke turns a permitted role into 403 and a grant opens the route", async () => {
    expect(await call(groups[1], invoicesGet, "receptionist", { "invoices.view": false })).toBe(403);
    expect(await call(groups[1], invoicesGet, "technician", { "invoices.view": true })).not.toBe(403);
  });
  it("every registry capability is used by a table row or is listed as enforced elsewhere", () => {
    const used = new Set(groups.flatMap((g) => g.entries.flatMap(([, , gate]) => gate.caps ?? [])));
    // Enforced only in routers outside this file's scope (quotes writes, transport, warranty, catalogue, special requests, customer reads).
    const elsewhere: Capability[] = ["quotes.manage", "customers.read", "transport.coordinate", "warranty.issue", "warranty.review", "warranty.void", "warranty.policies", "catalogue.manage", "special-requests.review"];
    for (const cap of capabilities) expect(used.has(cap) || elsewhere.includes(cap), cap).toBe(true);
  });
});

interface Layer { handle: unknown; route?: { path: string; methods: Record<string, boolean> } }
describe("drift guard", () => {
  for (const g of groups) {
    it(`${g.name}: every route is in the table or the public allowlist, and no table row is stale`, () => {
      const found = new Set<string>();
      for (const layer of g.router.stack as Layer[]) {
        if (!layer.route) continue;
        for (const m of Object.keys(layer.route.methods)) found.add(`${m.toUpperCase()} ${layer.route.path}`);
      }
      const known = new Set([...g.entries.map(([m, p]) => `${m} ${p}`), ...g.allow]);
      const unlisted = [...found].filter((k) => !known.has(k));
      expect(unlisted, `routes with no RBAC row: ${unlisted.join(", ")}`).toEqual([]);
      const stale = [...known].filter((k) => !found.has(k));
      expect(stale, `table rows with no route: ${stale.join(", ")}`).toEqual([]);
    });
  }
  it("api: every mounted sub-router is covered here or listed as out of scope", () => {
    const mounted = (apiGroup.router.stack as Layer[]).filter((l) => !l.route && !!(l.handle as { stack?: unknown }).stack).map((l) => l.handle);
    const known = new Set<unknown>([...subRouters, ...outOfScope]);
    expect(mounted.filter((h) => !known.has(h)).length, "a sub-router is mounted that route-rbac.test.ts does not know").toBe(0);
    for (const r of outOfScope) expect(mounted.includes(r), "listed out-of-scope router is no longer mounted").toBe(true);
    // The consents router hangs off the WhatsApp router, the rest hang off the API router.
    for (const g of groups.slice(1).filter((x) => x.name !== "whatsapp-consents")) expect(mounted.includes(g.router), `${g.name} not mounted`).toBe(true);
  });
});
