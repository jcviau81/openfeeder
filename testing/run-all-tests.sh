#!/usr/bin/env bash
# Run all OpenFeeder tests locally (no Docker needed for adapter tests)
set -uo pipefail

PASS=0
FAIL=0

run() {
  echo ""
  echo "▶ $1"
  if eval "$2"; then
    echo "✅ $1"
    PASS=$((PASS + 1))
  else
    echo "❌ $1"
    FAIL=$((FAIL + 1))
  fi
}

run "Express tests"          "node testing/test-express.js"
run "Caching tests"          "node testing/test-caching.js"
run "Security tests"         "node testing/test-security.js"
run "Gateway dialogue tests" "node testing/gateway-dialogue-test.js"
run "Sidecar chunker tests"  "python3 sidecar/test_chunker.py"
run "Sidecar unit tests"     "python3 sidecar/test_sidecar.py"

echo ""
echo "════════════════════════════════════════"
echo "Results: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
