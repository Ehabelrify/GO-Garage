#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

npm ci --no-audit --no-fund
npm run typecheck
npm test -- --run
npm run build

# Migration requires an explicit disposable-target approval and an exact
# sanitized database identity match. The guard never logs DATABASE_URL.
node scripts/approve-post-merge-target.mjs
npm run db:migrate
