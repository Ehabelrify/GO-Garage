# Garage OS — Replit Project Handoff

**Product:** Garage OS  
**Business:** Go Stores — two-branch car protection and modification agency, Egypt  
**Status:** Product definition and implementation brief  
**Languages:** Arabic (default for staff) and English  
**Primary customer channel:** WhatsApp  
**Application type:** Responsive Progressive Web App (PWA)

## What this package is

This is the product and implementation brief for building Garage OS as a real business operations product—not a disposable demo. Read `AGENT_INSTRUCTIONS.md` first, then the PRD and supporting specifications.

## Required first steps

1. Connect Replit to the user's existing GitHub repository using Replit's native GitHub integration.
2. Inspect the repository before changing anything. Identify its framework, existing implementation, conventions, dependencies, and current state.
3. Preserve useful existing work. Do not replace the repository with a fresh scaffold unless inspection proves that is necessary and the user approves.
4. Report a concise repository assessment and proposed implementation plan.
5. Build in small, coherent increments, keeping documentation current.

## Documents

| File | Purpose |
|---|---|
| `AGENT_INSTRUCTIONS.md` | Primary instructions for Replit Agent; read first |
| `PRD.md` | Product vision, users, requirements, scope, workflows, and acceptance criteria |
| `DESIGN_SYSTEM.md` | Visual and interaction design rules, Carbon-inspired direction, Arabic/RTL |
| `ARCHITECTURE.md` | Recommended system architecture and engineering quality requirements |
| `DATA_MODEL.md` | Core entities, relationships, lifecycle, and audit model |
| `WHATSAPP_SPEC.md` | WhatsApp integration, bot journeys, templates, inbox, and operational edge cases |
| `AUTOMATIONS.md` | Booking, reminders, escalation, notifications, and owner digest rules |
| `SECURITY_PRIVACY.md` | Access control, customer privacy, auditability, backups, and operational safety |
| `DELIVERY_PLAN.md` | Phased build sequence and definition of done |
| `DECISIONS_AND_ASSUMPTIONS.md` | Current direction, provisional defaults, and owner-validation status |
| `OWNER_MEETING_PLAYBOOK.md` | Owner-facing decision catalogue, alternatives, impacts, meeting agenda, and decision record |
| `ACCEPTANCE_TESTS.md` | Practical acceptance scenarios for the finished product |

## Important interpretation

**This package is intentionally owner-meeting-ready, not a record of completed owner discovery.** No detailed operating policy has yet been confirmed by the owner. Treat the product as a configurable proposal: demonstrate the choices, recommend safe defaults, and capture the owner's decisions during the next meeting. Do not block the concept on unanswered questions or turn assumptions into fixed business rules.


- All values marked **[ASSUMED]** are provisional configuration values, not verified business facts.
- Do not present assumptions as confirmed Go Stores policy.
- Where the owner must decide a legal, financial, warranty, or operational policy, present the alternatives, make it configurable, and clearly flag it for approval. See `OWNER_MEETING_PLAYBOOK.md`.
- A feature is not complete merely because a screen exists. Its data, permissions, validation, failure states, audit trail, and user workflow must work.
- Replit may choose appropriate frameworks, services, Git workflows, testing tools, containers, and deployment methods. The previous tooling restrictions are withdrawn.
