#!/usr/bin/env bash
# =============================================================================
# TailoredTunes — Post-Deploy Verification
# =============================================================================
# Usage:
#   export RAILWAY_URL=https://your-app.up.railway.app
#   export VERCEL_URL=https://tailoredtunes.vercel.app
#   ./scripts/verify_deploy.sh
# =============================================================================

set -e

RAILWAY_URL="${RAILWAY_URL:-}"
VERCEL_URL="${VERCEL_URL:-}"
PASS=0
FAIL=0

check() {
  local DESC="$1"
  local URL="$2"
  local EXPECT="$3"
  local METHOD="${4:-GET}"

  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X "$METHOD" "$URL" 2>/dev/null)
  if [ "$HTTP" = "$EXPECT" ]; then
    echo "  ✓ $DESC (HTTP $HTTP)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $DESC — expected $EXPECT, got $HTTP"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   TailoredTunes — Deploy Verification        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── Backend (Railway) ────────────────────────────
if [ -n "$RAILWAY_URL" ]; then
  echo "Backend: $RAILWAY_URL"
  check "Health check"              "${RAILWAY_URL}/api/health"           200
  check "Auth route exists"         "${RAILWAY_URL}/api/auth/login"       400 POST
  check "Orders route exists"       "${RAILWAY_URL}/api/orders"           401
  check "Stripe webhook reachable"  "${RAILWAY_URL}/api/webhooks/stripe"  400 POST
  check "TemPolor webhook reachable" "${RAILWAY_URL}/api/webhooks/tempolor" 400 POST
  echo ""
else
  echo "  RAILWAY_URL not set — skipping backend checks"
  echo ""
fi

# ─── Frontend (Vercel) ───────────────────────────
if [ -n "$VERCEL_URL" ]; then
  echo "Frontend: $VERCEL_URL"
  check "Homepage loads"     "${VERCEL_URL}/"       200
  check "SPA fallback works" "${VERCEL_URL}/login"  200
  echo ""
else
  echo "  VERCEL_URL not set — skipping frontend checks"
  echo ""
fi

# ─── Summary ─────────────────────────────────────
TOTAL=$((PASS + FAIL))
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: $PASS/$TOTAL passed"
if [ "$FAIL" -gt 0 ]; then
  echo "  $FAIL check(s) failed — review above"
  exit 1
else
  echo "  All checks passed ✓"
fi
echo ""
