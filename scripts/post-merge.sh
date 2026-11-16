#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

npm ci --no-audit --no-fund
npm run typecheck
npm test -- --run
npm run build

# Database migrations target DATABASE_URL and must be run only after the
# operator verifies the intended environment and database. Keep them out of
# this automatic post-merge hook.
echo "Post-merge checks passed. Database migrations were not run."
