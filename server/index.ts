import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { createServer as createViteServer } from "vite";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { createApiRouter } from "./routes/api";
import { pool } from "./db";

const app = express();
const port = Number(process.env.PORT ?? 5000);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

// Clerk's Frontend API proxy must run before body parsing.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(express.json({ limit: "1mb" }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY ?? "",
    ),
  })),
);

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
  const dist = path.join(projectRoot, "dist");
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
    root: projectRoot,
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
