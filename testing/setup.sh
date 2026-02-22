#!/usr/bin/env bash
# OpenFeeder Testing Environment Setup
# Starts all CMS containers and installs the OpenFeeder plugins
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log()   { echo -e "${GREEN}[setup]${NC} $*"; }
warn()  { echo -e "${YELLOW}[setup]${NC} $*"; }
error() { echo -e "${RED}[setup]${NC} $*" >&2; }

# ─── Wait for HTTP to return 200 ────────────────────────────
wait_for_http() {
  local url="$1"
  local name="$2"
  local max_wait="${3:-120}"
  local elapsed=0

  log "Waiting for $name at $url ..."
  while true; do
    # Accept any 2xx/3xx as "up" (Drupal redirects to /core/install.php before setup)
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [[ "$code" =~ ^[23] ]]; then
      log "$name is up (HTTP $code) after ${elapsed}s"
      return 0
    fi
    if [ "$elapsed" -ge "$max_wait" ]; then
      error "$name did not respond within ${max_wait}s (last HTTP $code)"
      return 1
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
}

# ─── Preflight checks ───────────────────────────────────────
if ! command -v docker &>/dev/null; then
  error "Docker is not installed. Please install Docker first."
  exit 1
fi

if ! docker compose version &>/dev/null; then
  error "Docker Compose v2 is not available. Please update Docker."
  exit 1
fi

# ─── Start containers ───────────────────────────────────────
log "Starting all containers..."
docker compose up -d

# ─── Wait for all CMS to be reachable ───────────────────────
log ""
log "Waiting for CMS containers to be ready..."
log "  (this can take 1-2 minutes on first run while DBs initialize)"
log ""

WP_OK=0
DRUPAL_OK=0
JOOMLA_OK=0

wait_for_http "http://localhost:8081" "WordPress" 120 && WP_OK=1 || true
wait_for_http "http://localhost:8082" "Drupal" 120    && DRUPAL_OK=1 || true
wait_for_http "http://localhost:8083" "Joomla" 120    && JOOMLA_OK=1 || true

log ""

# ─── Install plugins ────────────────────────────────────────
FAILED=0

if [ "$WP_OK" -eq 1 ]; then
  log "Setting up WordPress..."
  if bash wordpress/install-plugin.sh; then
    log "WordPress setup complete!"
  else
    error "WordPress setup failed"
    FAILED=$((FAILED + 1))
  fi
else
  error "Skipping WordPress setup (not reachable)"
  FAILED=$((FAILED + 1))
fi

log ""

if [ "$DRUPAL_OK" -eq 1 ]; then
  log "Setting up Drupal..."
  if bash drupal/install-module.sh; then
    log "Drupal setup complete!"
  else
    error "Drupal setup failed"
    FAILED=$((FAILED + 1))
  fi
else
  error "Skipping Drupal setup (not reachable)"
  FAILED=$((FAILED + 1))
fi

log ""

if [ "$JOOMLA_OK" -eq 1 ]; then
  log "Setting up Joomla..."
  if bash joomla/install-plugin.sh; then
    log "Joomla setup complete!"
  else
    error "Joomla setup failed"
    FAILED=$((FAILED + 1))
  fi
else
  error "Skipping Joomla setup (not reachable)"
  FAILED=$((FAILED + 1))
fi

# ─── Summary ────────────────────────────────────────────────
log ""
log "============================================"
log "  OpenFeeder Testing Environment"
log "============================================"
[ "$WP_OK"     -eq 1 ] && log "  WordPress: http://localhost:8081" || error "  WordPress: FAILED"
[ "$DRUPAL_OK" -eq 1 ] && log "  Drupal:    http://localhost:8082" || error "  Drupal:    FAILED"
[ "$JOOMLA_OK" -eq 1 ] && log "  Joomla:    http://localhost:8083" || error "  Joomla:    FAILED"
log "============================================"
log ""

if [ "$FAILED" -gt 0 ]; then
  warn "$FAILED CMS(s) had setup issues. Check logs above."
  warn "You can view container logs with: docker compose logs <service>"
  exit 1
fi

log "All CMS platforms ready! Run ./test-all.sh to validate."
