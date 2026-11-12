---
name: Owner settings and role access
description: The intended owner-setting and account-specific access model for Garage OS.
---

Garage OS operating decisions should be editable settings in the authenticated Owner account, not illustrative option cards or fake demo-approval controls. Owner, Branch Manager, Receptionist, and Technician accounts should each have role-appropriate workspaces and branch access. Any unfinished module may remain visible as an explicitly inactive “On hold” area, but must not pretend to work.

The first product walkthrough is for an Owner meeting while official staff email addresses and warranty terms are not yet available. The user wants temporary demo identities (for example, `Owner@noemail.com`) and a generic warranty-policy outline the Owner can complete and approve later.

**Why:** The user wants a credible, polished first-meeting product walkthrough and explicitly rejected a demo-only decision center and misleading functionality. Temporary identities are requested for the meeting, but placeholder login paths must not become production authentication; warranty placeholders must not become active terms.

**How to apply:** Keep authentication and role enforcement truthful; enforce access on the server, design the owner settings as part of the real product flow, and clearly isolate unfinished modules. Keep any temporary demo identity flow separate from production login, and keep generic warranty templates unapproved until the Owner supplies and confirms complete terms.
