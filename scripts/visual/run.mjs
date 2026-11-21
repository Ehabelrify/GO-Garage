// Garage OS visual checks (CI only). See docs/engineering/VISUAL_CHECKS.md.
// Signs in as each demo role, visits every workspace page in en/ar at several widths, records screenshots plus
// console errors, failed requests, /api 4xx/5xx, horizontal overflow and axe violations, then runs a few key flows.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { DEMO_ACCOUNTS, parseNavigation, routesForRole } from "./routes.mjs";
import { buildMarkdown } from "./report.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

const env = (name, fallback) => (process.env[name] === undefined || process.env[name] === "" ? fallback : process.env[name]);
const BASE = env("BASE_URL", "http://127.0.0.1:5000").replace(/\/$/, "");
const OUT = path.resolve(env("OUT_DIR", "visual-output"));
const NAV_FILE = path.resolve(env("NAV_FILE", path.join(here, "../../apps/web/src/app/navigation.ts")));
const VIEWPORTS = { 360: { width: 360, height: 740 }, 768: { width: 768, height: 1024 }, 1280: { width: 1280, height: 800 } };
const WIDTHS = env("WIDTHS", "360,768,1280").split(",").map((v) => Number(v.trim())).filter((w) => VIEWPORTS[w]);
const LOCALES = env("LOCALES", "en,ar").split(",").map((v) => v.trim()).filter(Boolean);
const ROLES = env("ROLES", Object.keys(DEMO_ACCOUNTS).join(",")).split(",").map((v) => v.trim()).filter((r) => DEMO_ACCOUNTS[r]);
const ONLY_PAGES = env("ONLY_PAGES", "") ? env("ONLY_PAGES", "").split(",").map((v) => v.trim()) : null;
const CONCURRENCY = Math.max(1, Number(env("CONCURRENCY", "3")));
const FIXED_NOW = env("FIXED_NOW", "");
const SKIP_FLOWS = env("SKIP_FLOWS", "") === "true";
const PLATE = "أ ب ج 1234";

const NAV_TIMEOUT = 45_000;
const RENDER_TIMEOUT = 30_000;
const IGNORED_CONSOLE = [/\[vite\] (failed to connect to websocket|server connection lost)/i, /Download the React DevTools/i];

const log = (...args) => console.log(...args);
const startedAt = Date.now();
const safe = (value) => String(value).replace(/[^a-zA-Z0-9_.-]+/g, "_");
const rel = (file) => path.relative(OUT, file).split(path.sep).join("/");
const ensure = (dir) => mkdirSync(dir, { recursive: true });

// ---------------------------------------------------------------------------------------------------------------
// Clerk stub. The app wraps everything in ClerkProvider and will not render until clerk-js "loads". CI has no real
// Clerk instance, so the two Clerk script URLs are answered with a minimal signed-out stub; the app then falls back to
// the demo session cookie (GET /api/demo/session), exactly as the login-page role widget does.
// ---------------------------------------------------------------------------------------------------------------
const CLERK_JS_STUB = `(function(){
  var resources = { client: { signIn: {}, signUp: {}, sessions: [] }, user: null, session: null, organization: null };
  var listeners = [];
  var statusHandlers = [];
  var clerk = {
    loaded: false, status: "loading", version: "ci-stub", instanceType: "production", frontendApi: "clerk.localhost",
    isStandardBrowser: true, telemetry: undefined, client: resources.client, user: null, session: null, organization: null,
    __internal_lastEmittedResources: undefined,
    load: function () {
      clerk.loaded = true; clerk.status = "ready"; clerk.__internal_lastEmittedResources = resources;
      statusHandlers.slice().forEach(function (h) { try { h("ready"); } catch (e) {} });
      listeners.slice().forEach(function (l) { try { l(resources); } catch (e) {} });
      return Promise.resolve();
    },
    addListener: function (cb, opts) {
      listeners.push(cb);
      if (clerk.loaded) setTimeout(function () { try { cb(resources); } catch (e) {} }, 0);
      return function () { listeners = listeners.filter(function (l) { return l !== cb; }); };
    },
    on: function (event, handler, opts) {
      if (event !== "status") return;
      statusHandlers.push(handler);
      if (opts && opts.notify) { try { handler(clerk.status); } catch (e) {} }
    },
    off: function (event, handler) { statusHandlers = statusHandlers.filter(function (h) { return h !== handler; }); },
    navigate: function (to) { window.location.assign(to); return Promise.resolve(); },
    signOut: function () { return Promise.resolve(); },
    __internal_getOption: function () { return undefined; },
    __internal_updateProps: function () { return Promise.resolve(); }
  };
  window.Clerk = clerk;
})();`;
const CLERK_UI_STUB = "window.__internal_ClerkUICtor = function(){};";

// ---------------------------------------------------------------------------------------------------------------
// Event collection (context level, so popups are covered too).
// ---------------------------------------------------------------------------------------------------------------
function instrument(context) {
  const state = { consoleErrors: [], pageErrors: [], failedRequests: [], apiFailures: [], apiCalls: 0 };
  const apiPath = (url) => { try { const u = new URL(url); return u.origin === BASE ? u.pathname : null; } catch { return null; } };
  context.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    const loc = msg.location()?.url ?? "";
    if (/Failed to load resource/i.test(text) && apiPath(loc)?.startsWith("/api/")) return; // already an API failure
    state.consoleErrors.push(text.slice(0, 400));
  });
  context.on("weberror", (webError) => {
    const error = webError.error();
    state.pageErrors.push(String(error?.stack ?? error?.message ?? error).slice(0, 600));
  });
  context.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "failed";
    if (/ERR_ABORTED/.test(reason)) return; // navigation/abort noise
    state.failedRequests.push(`${request.method()} ${request.url().slice(0, 200)} (${reason})`);
  });
  context.on("response", async (response) => {
    const p = apiPath(response.url());
    if (!p || !p.startsWith("/api/")) return;
    state.apiCalls += 1;
    const status = response.status();
    if (status < 400) return;
    let body = "";
    try { body = (await response.text()).slice(0, 300); } catch { /* body unavailable */ }
    state.apiFailures.push({ status, method: response.request().method(), path: p + (safeSearch(response.url())), body });
  });
  return {
    reset() { state.consoleErrors = []; state.pageErrors = []; state.failedRequests = []; state.apiFailures = []; state.apiCalls = 0; },
    snapshot() { return JSON.parse(JSON.stringify(state)); },
  };
}
function safeSearch(url) {
  try { const u = new URL(url); const keys = [...u.searchParams.keys()]; return keys.length ? `?${keys.map((k) => `${k}=`).join("&")}` : ""; } catch { return ""; }
}

async function newContext(browser, { role, locale, width, cookie }) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[width],
    locale: locale === "ar" ? "ar-EG" : "en-US",
    reducedMotion: "reduce",
    ignoreHTTPSErrors: true,
  });
  context.setDefaultNavigationTimeout(NAV_TIMEOUT);
  context.setDefaultTimeout(15_000);
  await context.addCookies([{ name: "garage_os_demo", value: cookie, url: BASE }]);
  await context.addInitScript((loc) => {
    try { window.localStorage.setItem("garage-os-locale", loc); } catch { /* storage unavailable */ }
    window.__printCalls = 0;
    window.print = () => { window.__printCalls += 1; };
  }, locale);
  await context.route(/\/npm\/@clerk\/clerk-js@[^/]+\/dist\/clerk\.browser\.js/, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: CLERK_JS_STUB }));
  await context.route(/\/npm\/@clerk\/ui@[^/]+\/dist\/ui\.browser\.js/, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: CLERK_UI_STUB }));
  if (FIXED_NOW) await context.clock.setFixedTime(new Date(FIXED_NOW));
  return context;
}

async function demoCookie(role) {
  const accountId = DEMO_ACCOUNTS[role];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`${BASE}/api/demo/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId }) });
    if (response.status === 429) { await new Promise((r) => setTimeout(r, 15_000)); continue; }
    if (response.status !== 201) throw new Error(`POST /api/demo/session for ${accountId} returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const cookie = response.headers.getSetCookie().map((c) => c.match(/^garage_os_demo=([^;]*)/)).find(Boolean);
    if (!cookie) throw new Error("No garage_os_demo cookie in the demo session response.");
    return cookie[1];
  }
  throw new Error(`Could not obtain a demo session for ${accountId} (rate limited).`);
}

async function overflowOf(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const scrollWidth = Math.max(doc.scrollWidth, document.body ? document.body.scrollWidth : 0);
    const innerWidth = window.innerWidth;
    if (scrollWidth <= innerWidth + 1) return null;
    const offenders = [];
    for (const el of Array.from(document.querySelectorAll("body *")).slice(0, 5000)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const over = Math.max(r.right - innerWidth, -r.left);
      if (over > 1) offenders.push({ over: Math.round(over), label: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}` });
    }
    offenders.sort((a, b) => b.over - a.over);
    return { scrollWidth, innerWidth, offenders: offenders.slice(0, 6).map((o) => `${o.label} (+${o.over}px)`) };
  });
}

async function axeOf(page) {
  try {
    await page.addScriptTag({ path: axePath });
    const result = await page.evaluate(async () => {
      const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }, resultTypes: ["violations"] });
      return res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    });
    return { violations: result.length, nodes: result.reduce((n, v) => n + v.nodes, 0), top: result.sort((a, b) => b.nodes - a.nodes).slice(0, 6).map((v) => `${v.id}[${v.impact}]x${v.nodes}`) };
  } catch (error) {
    return { violations: 0, nodes: 0, top: [], error: String(error?.message ?? error).slice(0, 200) };
  }
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function waitForWorkspace(page) {
  await page.waitForSelector("main.page-wrap", { state: "attached", timeout: RENDER_TIMEOUT });
}

// ---------------------------------------------------------------------------------------------------------------
// Page visits
// ---------------------------------------------------------------------------------------------------------------
async function visitOnce({ context, page, collector, role, locale, width, route }) {
  collector.reset();
  const row = { role, locale, width, page: route.id, route: route.path, status: "PASS", reasons: [], consoleErrors: [], pageErrors: [], failedRequests: [], apiFailures: [], overflow: null, axe: null, screenshot: null, retried: false };
  const shot = path.join(OUT, "screenshots", safe(role), locale, String(width), `${safe(route.id)}.png`);
  ensure(path.dirname(shot));
  let fatal = null;
  try {
    await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded" });
    await waitForWorkspace(page);
    await settle(page);
    const finalPath = new URL(page.url()).pathname;
    if (!finalPath.startsWith("/workspace")) fatal = `Redirected away from the workspace to ${finalPath} (role not allowed or demo session rejected).`;
  } catch (error) {
    const body = await page.evaluate(() => (document.body?.innerText ?? "").slice(0, 160).replace(/\s+/g, " ")).catch(() => "");
    fatal = `Workspace did not render: ${String(error?.message ?? error).split("\n")[0]} (url ${page.url()}; body "${body}")`;
  }
  try { await page.screenshot({ path: shot, fullPage: true, animations: "disabled", caret: "hide" }); row.screenshot = rel(shot); } catch (error) { row.reasons.push(`screenshot failed: ${String(error?.message ?? error).split("\n")[0]}`); }
  if (!fatal) {
    row.overflow = await overflowOf(page).catch(() => null);
    row.axe = await axeOf(page);
  }
  Object.assign(row, collector.snapshot());
  delete row.apiCalls;

  const api5xx = row.apiFailures.filter((f) => f.status >= 500);
  const api4xx = row.apiFailures.filter((f) => f.status < 500);
  if (fatal) { row.status = "FAIL"; row.reasons.push(fatal); }
  if (api5xx.length) { row.status = "FAIL"; row.reasons.push(`${api5xx.length} API 5xx response(s)`); }
  if (row.pageErrors.length) { row.status = "FAIL"; row.reasons.push(`${row.pageErrors.length} uncaught page error(s)`); }
  if (row.overflow && width === 360) { row.status = "FAIL"; row.reasons.push("horizontal overflow at 360px"); }
  if (row.status !== "FAIL") {
    if (row.overflow) row.reasons.push(`horizontal overflow at ${width}px`);
    if (api4xx.length) row.reasons.push(`${api4xx.length} API 4xx response(s)`);
    if (row.consoleErrors.length) row.reasons.push(`${row.consoleErrors.length} console error(s)`);
    if (row.failedRequests.length) row.reasons.push(`${row.failedRequests.length} failed request(s)`);
    if (row.axe?.violations) row.reasons.push(`${row.axe.violations} axe rule(s) violated`);
    if (row.reasons.length) row.status = "WARN";
  }
  return row;
}

async function runTask(browser, cookies, { role, locale, width }, routes, rows) {
  const context = await newContext(browser, { role, locale, width, cookie: cookies[role] });
  const collector = instrument(context);
  const page = await context.newPage();
  try {
    for (const route of routes) {
      let row = await visitOnce({ context, page, collector, role, locale, width, route });
      if (row.status === "FAIL") {
        const again = await visitOnce({ context, page, collector, role, locale, width, route });
        again.retried = true;
        row = again;
      }
      rows.push(row);
      log(`${row.status.padEnd(4)} ${role}/${locale}/${width}/${route.id}${row.reasons.length ? ` - ${row.reasons.join("; ")}` : ""}`);
      if (row.status === "FAIL") {
        for (const e of row.pageErrors.slice(0, 3)) log(`    page error: ${e.replace(/\s+/g, " ").slice(0, 400)}`);
        for (const e of row.consoleErrors.slice(0, 3)) log(`    console error: ${e.replace(/\s+/g, " ").slice(0, 300)}`);
        for (const e of row.failedRequests.slice(0, 4)) log(`    failed request: ${e}`);
      }
      if (row.status === "FAIL") for (const f of row.apiFailures.filter((x) => x.status >= 500)) log(`::error title=API ${f.status} ${f.method} ${f.path}::${role}/${locale}/${width}/${route.id} ${f.body.replace(/\s+/g, " ").slice(0, 200)}`);
    }
  } finally {
    await context.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Flows (owner role)
// ---------------------------------------------------------------------------------------------------------------
async function runFlow(browser, cookies, name, { locale, width }, fn) {
  const variant = `${locale}/${width}`;
  const flow = { name, variant, status: "PASS", detail: "", consoleErrors: [], pageErrors: [], failedRequests: [], apiFailures: [], screenshots: [], hard: false };
  const context = await newContext(browser, { role: "owner", locale, width, cookie: cookies.owner });
  const collector = instrument(context);
  const page = await context.newPage();
  const shotDir = path.join(OUT, "screenshots", "flows");
  ensure(shotDir);
  const shot = async (label, target = page) => {
    const file = path.join(shotDir, `${safe(name)}_${locale}_${width}_${safe(label)}.png`);
    try { await target.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" }); flow.screenshots.push(rel(file)); } catch { /* ignore */ }
  };
  try {
    const result = await fn({ context, page, shot, collector, locale, width });
    flow.status = result?.status ?? "PASS";
    flow.detail = result?.detail ?? "";
  } catch (error) {
    flow.status = "FAIL";
    flow.detail = String(error?.message ?? error).split("\n")[0];
    await shot("failure");
  } finally {
    const snap = collector.snapshot();
    Object.assign(flow, { consoleErrors: snap.consoleErrors, pageErrors: snap.pageErrors, failedRequests: snap.failedRequests, apiFailures: snap.apiFailures });
    flow.hard = snap.pageErrors.length > 0 || snap.apiFailures.some((f) => f.status >= 500);
    if (flow.hard && flow.status === "PASS") flow.status = "FAIL";
    if (flow.hard) flow.detail = `${flow.detail} [${snap.pageErrors.length} page error(s), ${snap.apiFailures.filter((f) => f.status >= 500).length} API 5xx]`.trim();
    await context.close().catch(() => {});
  }
  log(`${flow.status.padEnd(4)} flow ${name} ${variant}${flow.detail ? ` - ${flow.detail}` : ""}`);
  for (const f of flow.apiFailures.filter((x) => x.status >= 500)) log(`::error title=API ${f.status} ${f.method} ${f.path}::flow ${name} ${f.body.replace(/\s+/g, " ").slice(0, 200)}`);
  return flow;
}

const listFrom = (json) => (Array.isArray(json) ? json : json?.results ?? json?.items ?? json?.records ?? json?.data ?? []);

async function openWorkspace(page, pathAndQuery) {
  await page.goto(`${BASE}${pathAndQuery}`, { waitUntil: "domcontentloaded" });
  await waitForWorkspace(page);
  await settle(page);
}

async function searchFlow({ page, shot, locale }) {
  await openWorkspace(page, "/workspace/overview");
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("/");
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("role") === "combobox");
  if (!focused) return { status: "FAIL", detail: "pressing / did not focus the global search" };
  const responded = page.waitForResponse((r) => r.url().includes("/api/search"), { timeout: 15_000 }).catch(() => null);
  await page.keyboard.type(PLATE, { delay: 40 });
  const response = await responded;
  await page.waitForTimeout(600);
  const options = await page.locator('[role="option"]').count();
  await shot("results");
  if (!response) return { status: "FAIL", detail: "no /api/search request after typing" };
  if (response.status() >= 400) return { status: "FAIL", detail: `/api/search returned ${response.status()}` };
  return options > 0 ? { detail: `${options} result(s) for the seeded plate (${locale})` } : { status: "FAIL", detail: "search returned no result for the seeded plate" };
}

async function findSeededRecordRoute(context) {
  const response = await context.request.get(`${BASE}/api/search?q=${encodeURIComponent(PLATE)}`);
  if (!response.ok()) throw new Error(`/api/search returned ${response.status()}`);
  const results = listFrom(await response.json());
  const pick = results.find((r) => r.type === "customer") ?? results.find((r) => r.type === "vehicle") ?? results[0];
  if (!pick?.route) throw new Error("search did not return a record for the seeded plate");
  return pick;
}

async function customer360Flow({ context, page, shot }) {
  const pick = await findSeededRecordRoute(context);
  await openWorkspace(page, pick.route);
  const dialog = await page.locator('[role="dialog"]').count();
  await shot("360");
  return { detail: `${pick.type} ${pick.id} opened via ${pick.route} (${dialog ? "drawer" : "page"})` };
}

async function drawerFlow({ page, shot }) {
  await openWorkspace(page, "/workspace/customers");
  const row = page.locator("tr.clickable, [role=row].clickable").first();
  if (!(await row.count())) return { status: "SKIP", detail: "no clickable row on the customers page" };
  await row.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
  await settle(page);
  await shot("drawer");
  await page.keyboard.press("Escape");
  return { detail: "drawer opened from the first customer row" };
}

async function printFlow(pageId, { context, page, shot, locale, width }) {
  await openWorkspace(page, `/workspace/${pageId}`);
  const row = page.locator("tr.clickable").first();
  if (await row.count()) { await row.click().catch(() => {}); await page.waitForSelector('[role="dialog"]', { timeout: 6_000 }).catch(() => {}); await settle(page); }
  const scope = (await page.locator('[role="dialog"]').count()) ? page.locator('[role="dialog"]') : page.locator("main.page-wrap");
  const control = scope.getByRole("button", { name: /print|طباع/i }).or(scope.getByRole("link", { name: /print|طباع/i })).first();
  if (!(await control.count())) return { status: "SKIP", detail: `no print control found on ${pageId} (route or feature not present yet)` };
  const popupPromise = context.waitForEvent("page", { timeout: 6_000 }).catch(() => null);
  await control.click();
  const popup = await popupPromise;
  const target = popup ?? page;
  await target.waitForLoadState("domcontentloaded").catch(() => {});
  await settle(target);
  await target.emulateMedia({ media: "print" });
  await shot("print", target);
  ensure(path.join(OUT, "pdfs"));
  const pdf = path.join(OUT, "pdfs", `${safe(pageId)}-print_${locale}_${width}.pdf`);
  await target.pdf({ path: pdf, format: "A4", printBackground: true }).catch(() => {});
  return { detail: `print control clicked on ${pageId} (${popup ? "popup" : "same page"}); pdf ${rel(pdf)}` };
}

async function pdfFlow({ context, page }) {
  const pick = await findSeededRecordRoute(context);
  await openWorkspace(page, pick.route);
  await page.emulateMedia({ media: "print" });
  ensure(path.join(OUT, "pdfs"));
  const pdf = path.join(OUT, "pdfs", "customer-360.pdf");
  await page.pdf({ path: pdf, format: "A4", printBackground: true });
  return { detail: `print-to-PDF of ${pick.route} written to ${rel(pdf)}` };
}

// ---------------------------------------------------------------------------------------------------------------
async function main() {
  ensure(OUT);
  const nav = parseNavigation(NAV_FILE);
  const demo = await fetch(`${BASE}/api/demo/session`).then((r) => r.json()).catch(() => null);
  if (!demo?.enabled) throw new Error("Role widget is not enabled on the app (GARAGE_ROLE_WIDGET_ENABLED=true and SESSION_SECRET are required).");

  const cookies = {};
  for (const role of ROLES) cookies[role] = await demoCookie(role);
  log(`Signed in demo roles: ${ROLES.join(", ")}`);

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const rows = [];
  const flows = [];
  try {
    const tasks = [];
    for (const role of ROLES) {
      let routes = routesForRole(nav, role);
      if (ONLY_PAGES) routes = routes.filter((r) => ONLY_PAGES.includes(r.id));
      for (const locale of LOCALES) for (const width of WIDTHS) tasks.push({ role, locale, width, routes });
      log(`${role}: ${routes.map((r) => r.id).join(", ")}`);
    }
    // First task alone so Vite warms its dependency cache before parallel visits.
    const [first, ...rest] = tasks;
    if (first) await runTask(browser, cookies, first, first.routes, rows).catch((e) => log(`task failed ${first.role}/${first.locale}/${first.width}: ${e.message}`));
    // Fail fast: if the very first task rendered nothing, every other task would only repeat the same 30s timeouts.
    if (rows.length > 0 && rows.every((r) => r.status === "FAIL" && r.reasons.some((x) => x.startsWith("Workspace did not render")))) {
      log("::error title=Visual checks::The app never rendered (stuck on the loading screen). Most likely the Clerk browser stub; see the page/console errors above. Stopping early.");
      process.exitCode = 1;
      return;
    }
    const queue = [...rest];
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        await runTask(browser, cookies, t, t.routes, rows).catch((e) => log(`task failed ${t.role}/${t.locale}/${t.width}: ${e.message}`));
      }
    }));

    if (!SKIP_FLOWS && cookies.owner) {
      const variants = [];
      for (const locale of LOCALES) for (const width of [1280, 360].filter((w) => WIDTHS.includes(w))) variants.push({ locale, width });
      for (const v of variants) {
        flows.push(await runFlow(browser, cookies, "search-plate", v, searchFlow));
        flows.push(await runFlow(browser, cookies, "customer-360", v, customer360Flow));
        flows.push(await runFlow(browser, cookies, "drawer", v, drawerFlow));
      }
      const printVariants = variants.filter((v) => v.width === 1280);
      for (const v of printVariants) {
        flows.push(await runFlow(browser, cookies, "print-quote", v, (ctx) => printFlow("quotes", ctx)));
        flows.push(await runFlow(browser, cookies, "print-invoice", v, (ctx) => printFlow("finance", ctx)));
        flows.push(await runFlow(browser, cookies, "print-warranty", v, (ctx) => printFlow("warranties", ctx)));
      }
      if (printVariants[0]) flows.push(await runFlow(browser, cookies, "pdf-customer-360", printVariants[0], pdfFlow));
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const report = {
    meta: { baseUrl: BASE, fixedNow: FIXED_NOW || null, widths: WIDTHS, locales: LOCALES, roles: ROLES, startedAt: new Date(startedAt).toISOString(), finishedAt: new Date().toISOString(), durationMs: Date.now() - startedAt },
    rows, flows,
  };
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(path.join(OUT, "report.md"), buildMarkdown(report));

  const failedRows = rows.filter((r) => r.status === "FAIL");
  const hardFlows = flows.filter((f) => f.hard);
  log(`\nDone: ${rows.length} pages (${failedRows.length} FAIL, ${rows.filter((r) => r.status === "WARN").length} WARN), ${flows.length} flows (${flows.filter((f) => f.status === "FAIL").length} FAIL, ${flows.filter((f) => f.status === "SKIP").length} SKIP).`);
  if (rows.length === 0) { log("::error title=Visual checks::No pages were visited."); process.exitCode = 1; return; }
  if (failedRows.length || hardFlows.length) { log(`::error title=Visual checks failed::${failedRows.length} page(s) and ${hardFlows.length} flow(s) hit an API 5xx, uncaught page error, render failure or 360px overflow. See report.md.`); process.exitCode = 1; }
  const axeTotal = rows.reduce((n, r) => n + (r.axe?.violations ?? 0), 0);
  if (axeTotal) log(`::warning title=Accessibility::${axeTotal} axe rule violation(s) across pages (warning only).`);
}

main().catch((error) => {
  console.error(error);
  console.log(`::error title=Visual checks crashed::${String(error?.message ?? error).split("\n")[0]}`);
  process.exitCode = 1;
});
