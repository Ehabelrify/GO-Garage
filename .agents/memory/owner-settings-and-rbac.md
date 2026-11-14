---
name: Owner settings and role access
description: Current Owner settings, role/branch authorization, and feature-gating guidance.
---

Operating controls belong in the authenticated Owner Settings workflow, not a
Decision Center or fake approval interface. Owner, Branch Manager,
Receptionist, and Technician access must remain role- and branch-scoped and
enforced by the server.

Seeded settings and draft warranty policies are examples, not approved
business rules or customer terms. Development demo identities are separate
from Clerk production authentication. Keep public warranty verification gated
until the Owner approves the exposed fields and customer-facing policy. Keep
WhatsApp provider delivery disabled until the real provider setup is verified.

See the current [architecture](../../docs/engineering/ARCHITECTURE.md) and
[security/privacy guidance](../../docs/engineering/SECURITY_PRIVACY.md).
