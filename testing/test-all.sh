#!/usr/bin/env bash
# Run the OpenFeeder validator against all 3 CMS instances
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VALIDATOR_DIR="${SCRIPT_DIR}/../validator"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[test]${NC} $*"; }
warn()  { echo -e "${YELLOW}[test]${NC} $*"; }
error() { echo -e "${RED}[test]${NC} $*" >&2; }

# ─── Preflight ───────────────────────────────────────────────
if [ ! -f "${VALIDATOR_DIR}/validator.py" ]; then
  error "Validator not found at ${VALIDATOR_DIR}/validator.py"
  exit 1
fi

# Use venv if it exists
PYTHON="python3"
if [ -f "${VALIDATOR_DIR}/.venv/bin/python" ]; then
  PYTHON="${VALIDATOR_DIR}/.venv/bin/python"
elif [ -f "${VALIDATOR_DIR}/.venv/bin/python3" ]; then
  PYTHON="${VALIDATOR_DIR}/.venv/bin/python3"
fi

# Check dependencies
if ! $PYTHON -c "import httpx, click, rich" 2>/dev/null; then
  warn "Validator dependencies not installed. Installing..."
  $PYTHON -m pip install -r "${VALIDATOR_DIR}/requirements.txt" -q
fi

# ─── Run tests ───────────────────────────────────────────────
PASS=0
FAIL=0
TOTAL=0

run_validator() {
  local name="$1"
  local url="$2"
  TOTAL=$((TOTAL + 1))

  log ""
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "  Validating: $name ($url)"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log ""

  if $PYTHON "${VALIDATOR_DIR}/validator.py" "$url" --verbose; then
    log "$name: PASSED"
    PASS=$((PASS + 1))
  else
    error "$name: FAILED (exit code $?)"
    FAIL=$((FAIL + 1))
  fi
}

run_validator "WordPress" "http://localhost:8081"
run_validator "Drupal"    "http://localhost:8082"
run_validator "Joomla"    "http://localhost:8083"

# ─── Summary ────────────────────────────────────────────────
log ""
log "============================================"
log "  Validation Results"
log "============================================"
log "  Total:  $TOTAL"
log "  Passed: $PASS"
[ "$FAIL" -gt 0 ] && error "  Failed: $FAIL" || log "  Failed: $FAIL"
log "============================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
