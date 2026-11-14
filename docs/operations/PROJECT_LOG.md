# Garage OS — Project Log

Use this file to record meaningful progress, not every minor edit.

## Entry template

### YYYY-MM-DD — Short title
**Completed**
- 

**Changed**
- 

**Validation**
- 

**Open issues**
- 

**Next**
-

### 2026-11-11 — Built the owner-meeting demo foundation
**Completed**
- Added a bilingual, responsive owner-meeting demo with decision proposals, draft/preview flow, demo-only approval history and export.
- Added fictional customer/vehicle records, booking requests with sample drop-off and bay-hour checks, and an auditable demo job lifecycle.

**Changed**
- Added the React/TypeScript/Vite app on a local branch based on the public documentation baseline.
- Added browser-local demo persistence and clear warnings for sample data, preview-only roles, demo approvals, and disabled WhatsApp messaging.

**Validation**
- Six domain tests pass.
- TypeScript typecheck and production build pass.
- Desktop and mobile previews render in Arabic RTL; English LTR is available in the UI.

**Open issues**
- This is not the production system: there is no server database, authentication, enforced permissions, live WhatsApp, or multi-device state.
- Business policies remain provisional until the owner meeting.

**Next**
- Review the owner-meeting demo scope and validate the workflows and provisional settings with Go Stores.

### 2026-11-11 — Built the role-based Garage OS meeting workspace
**Completed**
- Replaced the browser-only decision flow with an Owner Settings page. The eight active settings are persisted, validated, audited, and applied to booking-capacity checks.
- Added individual Clerk sign-in, verified Owner bootstrap, personal staff invitations, role-specific workspaces, branch-scoped access, and assigned-job visibility for technicians.
- Persisted customers, vehicles, bookings, workshop jobs, and setting history in PostgreSQL. Added booking, assignment, stage-transition, staff-removal, and session-revocation behavior.
- Marked unfinished modules as **On hold** and kept WhatsApp disconnected with no customer messaging.

**Changed**
- Added a React/Vite frontend, Express API, PostgreSQL migrations, development-only sample seed, and branded Arabic-first account screens.
- Updated product, security, architecture, data-model, delivery, and run instructions to describe the real current scope.

**Validation**
- `npm run typecheck` passed.
- `npm test -- --run` passed: 17 tests across 3 files.
- `npm run build` passed.
- Development migrations and sample seeding completed; the seed is repeatable.
- `/api/health` returned HTTP 200 and unauthenticated `/api/bootstrap` returned HTTP 401.
- Public landing and sign-in screens were reviewed on desktop and mobile; the `/decisions` path now routes to Owner Settings after sign-in.

**Open issues**
- No verified Owner email has been configured. No dummy sign-in account or password was created, so the signed-in workspace could not be visually tested in this session.
- The build uses Clerk development keys and fictional development data. Production accounts, backup/restore checks, and publishing remain unconfigured.

**Next**
- Configure the verified first Owner email in Replit Secrets, then run the Owner and invited-role walkthrough before the meeting.
