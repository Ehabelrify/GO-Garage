# Content-Security-Policy (P2T-018)

Status: report-only. `apps/server/index.ts` sends `Content-Security-Policy-Report-Only` in production. The policy allows `self`, Clerk (`https://*.clerk.accounts.dev`, `https://*.clerk.com`, and the Clerk proxy path on self), `data:` and `https:` images, inline styles (React style attributes) and `blob:` workers. Violations post to `/api/csp-report`, which logs one line (directive, blocked URI, document path) and answers 204; it sits behind the existing `/api` rate limiter.

Switches
- Production: report-only by default. `GARAGE_CSP_ENFORCE=true` sends the same policy as an enforced `Content-Security-Policy`.
- Development (Vite HMR needs inline scripts and websockets): no CSP unless `GARAGE_CSP_FORCE=true`.

Rollout: deploy, browse every page including sign-in, read the `CSP violation` log lines for a few days, widen the policy for legitimate sources, then set `GARAGE_CSP_ENFORCE=true`. Revert by unsetting it. Open: confirm the Clerk script and frontend API hosts of the production instance, and any custom domain.
