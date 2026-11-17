#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

npm ci --no-audit --no-fund
npm run typecheck
npm test -- --run
npm run build

# Migrations run only after explicit disposable-target approval and an exact
# sanitized database identity match. Missing approval is a safe skip; a
# supplied but invalid approval still fails before migration. The guard never
# logs DATABASE_URL.
migration_decision="$(node scripts/approve-post-merge-target.mjs)"
case "$migration_decision" in
  skip)
    echo "Post-merge migrations skipped: no disposable database approval was supplied."
    ;;
  approved)
    echo "Post-merge disposable target approved; applying migrations."
    npm run db:migrate
    ;;
  *)
    echo "Post-merge migration blocked: approval check returned an invalid decision." >&2
    exit 1
    ;;
esac
