#!/usr/bin/env bash
set -uo pipefail

cd /app

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

# Adapter tests (in-process, no network needed)
run "Express tests"          "node testing/test-express.js"
run "Caching tests"          "node testing/test-caching.js"
run "Security tests"         "node testing/test-security.js"
run "Gateway dialogue tests" "node testing/gateway-dialogue-test.js"

# Sidecar unit tests
run "Sidecar chunker tests"  "python3 sidecar/test_chunker.py"
run "Sidecar unit tests"     "SIDECAR_URL='' python3 sidecar/test_sidecar.py"

# CMS validator tests (containers must be running)
run "WordPress validator"    "python3 validator/validator.py http://wordpress"
run "Drupal validator"       "python3 validator/validator.py http://drupal"
run "Joomla validator"       "python3 validator/validator.py http://joomla"

echo ""
echo "════════════════════════════════════════"
echo "Results: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
