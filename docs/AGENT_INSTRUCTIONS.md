# Documentation Instructions

Follow the repository-root [canonical instructions](../AGENT_INSTRUCTIONS.md)
first. This file is subordinate and applies only to `docs/`.

## Document ownership

- `product/` holds product requirements, design guidance, owner discovery, and
  provisional decisions.
- `engineering/` holds architecture, data model, security/privacy,
  acceptance, automation, and integration references.
- `operations/` holds delivery and ongoing decision/project records.
- `reports/` holds current-state assessments; keep these grounded in the
  checked-out source and label unverified readiness items as such.
- `testing/` holds test and code-review reports with their source evidence.
  Preserve original issue IDs, test dates, and verification limits; a converted
  report does not establish a new test run or resolve its findings.
  Maintain ongoing Phase 1 work in `testing/PHASE_1_ISSUES_TRACKER.md` using its
  stable IDs and intake/status rules; retain the source reports as snapshots.
- `superpowers/` contains task-specific design and execution records, not
  authoritative product policy.

Reference documents may describe planned work. Distinguish proposals,
assumptions, on-hold integrations, and implemented behavior; do not promote
assumptions to approved policy or claim production readiness without evidence.

## Maintenance

Use relative Markdown links for repository-local targets. After a move, update
all incoming links and references in the README, root instructions, and
affected documents. Preserve user-facing filenames and existing requirements
unless the user approves a content change. Keep credentials, personal data,
and production records out of documentation.
