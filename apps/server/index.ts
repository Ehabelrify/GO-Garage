import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { createServer as createViteServer } from "vite";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./features/auth/clerkProxyMiddleware";
import { createApiRouter } from "./features/operations/api";
import { pool } from "./infrastructure/database/db";
import { checkReadiness } from "./infrastructure/health/readiness";
import { assertDatasetBoundary } from "./infrastructure/database/dataset-boundary";

const app = express();
const port = Number(process.env.PORT ?? 5000);
const webRoot = fileURLToPath(new URL("../web", import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

// Rate limits (per client IP, fixed window).
const RATE_WINDOW_MS = 60_000;
// requests/min across /api. GARAGE_API_RATE_LIMIT only exists so the CI visual run (one IP, hundreds of page loads) is not throttled; leave it unset in real deployments.
const API_GENERAL_LIMIT = Number.parseInt(process.env.GARAGE_API_RATE_LIMIT ?? "", 10) > 0 ? Number.parseInt(process.env.GARAGE_API_RATE_LIMIT as string, 10) : 300;
const PUBLIC_VERIFY_LIMIT = 30; // requests/min on public warranty verification
const PROVIDER_WEBHOOK_LIMIT = 120; // requests/min on the WhatsApp provider webhook
const DEMO_SESSION_LIMIT = 10; // POST /api/demo/session per min

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (value === undefined || value.trim() === "") return isProduction ? 1 : false;
  const v = value.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v; // e.g. "loopback" or a CIDR list
}
app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));

const limiter = (limit: number, code: string) =>
  rateLimit({
    windowMs: RATE_WINDOW_MS,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ code, message: "Too many requests. Please try again shortly." });
    },
  });

// CSP is disabled: Clerk (frontend API, proxy, telemetry, images) and Vite HMR in dev
// need broad, deployment-specific allowances, and an incorrect policy would break sign-in.
// All other helmet protections stay on. Revisit with a tuned CSP once Clerk domains are pinned.
app.use(
  helmet({
    contentSecurityPolicy: false,
    hsts: isProduction,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, // Clerk OAuth popups
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

// Clerk's Frontend API proxy must run before body parsing.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(express.json({ limit: "1mb", verify: (req,_res,buffer) => { (req as typeof req & {rawBody?:Buffer}).rawBody=Buffer.from(buffer); } }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY ?? "",
    ),
  })),
);

app.use("/api", limiter(API_GENERAL_LIMIT, "RATE_LIMITED"));
app.use("/api/public/warranty-verification", limiter(PUBLIC_VERIFY_LIMIT, "RATE_LIMITED"));
app.use("/api/provider/whatsapp", limiter(PROVIDER_WEBHOOK_LIMIT, "RATE_LIMITED"));
app.post("/api/demo/session", limiter(DEMO_SESSION_LIMIT, "RATE_LIMITED"));
// Readiness (database + schema), separate from the constant liveness answer at /api/health (P2T-014).
app.get("/api/ready", async (_req, res) => { const result = await checkReadiness(pool); res.status(result.ready ? 200 : 503).json({ ready: result.ready, database: result.database, schema: result.schema }); });
app.use("/api", createApiRouter());
app.use((req, res, next) => {
  if (req.path.startsWith("/warranty/verify/")) {
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  next();
});

if (isProduction) {
  const dist = path.join(webRoot, "dist");
  app.use(express.static(dist, { index: false }));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ code: "NOT_FOUND", message: "Route not found." });
      return;
    }
    res.sendFile(path.join(dist, "index.html"), (error) => {
      if (error) next(error);
    });
  });
} else {
  const vite = await createViteServer({
    root: webRoot,
    server: { middlewareMode: true, allowedHosts: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Request failed.", error instanceof Error ? error.message : "Unknown error");
  if (res.headersSent) return;
  res.status(500).json({ code: "INTERNAL_ERROR", message: "The request could not be completed." });
});

await assertDatasetBoundary(pool);
const server = app.listen(port, "0.0.0.0", () => {
  console.info(`Garage OS server listening on port ${port}.`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  });
}
