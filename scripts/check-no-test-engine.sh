#!/usr/bin/env bash
# The production bundle must not contain the e2e-only HLS engine.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -d dist ]; then echo "dist/ is missing; run pnpm build first" >&2; exit 1; fi
if grep -rl "FLUSTER_E2E_FAKE_HLS_ENGINE" dist >/dev/null; then
  echo "FAIL: dist contains the e2e test engine" >&2
  exit 1
fi
echo "dist has no e2e test engine"
