# Garage OS — Go Stores Operations

- **Status:** Role-based meeting build; production launch setup is not complete
- **Languages:** Arabic (default, RTL) and English (LTR)
- **Runtime:** React/Vite frontend, Express API, PostgreSQL, Clerk authentication

Garage OS is an internal operations workspace for Go Stores. Each person signs in with an individual account and receives a server-enforced role and branch scope. The Owner manages operating settings and staff access; Branch Managers, Receptionists, and Technicians see their own work areas.

## Current working scope

- Branded sign-in and sign-out, with individual Clerk invitations and no shared/default password.
- Owner, Branch Manager, Receptionist, and Technician workspaces with role and branch checks on the API.
- Persistent customer, vehicle, booking, job, operating-setting, and setting-history records in PostgreSQL.
- Owner settings for booking confirmation, daily intake, working hours, bay counts, weekly closure, and supported service durations. Saved values are validated, audited, and used by booking-capacity checks.
- Customer creation, booking requests and confirmation/cancellation, job-stage updates, and technician assignment.
- Owner-managed warranty policy drafts, immutable published versions, delivery-triggered coverage for enabled services, and human-reviewed claims.
- Arabic RTL and English LTR workspace layouts.

The development database contains clearly identified fictional sample records and provisional warranty policy drafts for tint, ceramic coating, and full PPF. They are not approved customer terms and cannot issue coverage until an Owner reviews and publishes them. Do not enter real customer data in the development environment.

## Run locally in the Replit development environment

```sh
npm install
NODE_ENV=development npm run db:migrate
NODE_ENV=development npm run db:seed:dev
npm run dev
```

The seed command is development-only and must not be run against production. `npm run db:migrate` also rejects production mode in this meeting build.

### First Owner access

The development preview includes a separate demo account chooser for Owner, Branch Manager, Receptionist, and Technician. These temporary identities use signed development sessions, do not have passwords or real Clerk accounts, and cannot be used in production. The normal Clerk sign-in and verified-email flow remain unchanged.

For a real Owner account, configure `OWNER_BOOTSTRAP_EMAIL` in Replit Secrets using the verified Clerk email that will belong to the first Owner, then create that account through the branded sign-in flow. After the Owner is active, invite each staff member from **Staff access**; Clerk sends individual invitations with the selected role and branch scope. Self-sign-up without an authorized invitation remains blocked from business data.

Never put a real email or credential in source code or documentation.

## Areas on hold

The internal warranty register and claim workflow are active. Automatic coverage is issued only when an Owner-published policy enables it and an eligible job is delivered; development sample policies remain drafts. Public QR warranty verification is **On hold**. WhatsApp messaging, inventory, payments, intake-photo evidence, automated notifications, and custom workflow configuration remain inactive. No customer messages are sent.

## Checks

```sh
npm run typecheck
npm test -- --run
npm run build
```

## Product documents

| File | Purpose |
|---|---|
| `PRD.md` | Product vision, workflows, scope, and longer-term requirements |
| `DESIGN_SYSTEM.md` | Visual, interaction, Arabic/RTL, and responsive guidance |
| `ARCHITECTURE.md` | Current technical architecture and future module boundaries |
| `DATA_MODEL.md` | Implemented records and broader conceptual model |
| `SECURITY_PRIVACY.md` | Access control, customer privacy, auditing, and operational safety |
| `DECISIONS_AND_ASSUMPTIONS.md` | Provisional business settings and owner validation needs |
| `OWNER_MEETING_PLAYBOOK.md` | Topics for owner discovery; not a screen in the application |
| `ACCEPTANCE_TESTS.md` | Verified current scope and broader future acceptance scenarios |

## Important scope

The live settings in this build are functional configuration, not a decision-polling or demo-approval flow. Seeded values are examples and should be verified by the business owner before operational use. Features outside the implemented scope remain inactive. Production account setup, backup/restore validation, and publishing are not included.
