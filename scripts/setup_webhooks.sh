#!/usr/bin/env bash
# =============================================================================
# TailoredTunes — Webhook Registration Helper
# =============================================================================
# Usage:
#   ./scripts/setup_webhooks.sh stripe   — Register Stripe webhook + test
#   ./scripts/setup_webhooks.sh tempolor — Print TemPolor callback URL
#   ./scripts/setup_webhooks.sh verify   — Verify both endpoints are reachable
#   ./scripts/setup_webhooks.sh all      — Run all of the above
# =============================================================================

set -e

# Load env vars from .env if present (dev only)
if [ -f ".env" ]; then
  set -a
  source ".env"
  set +a
fi

RAILWAY_URL="${RAILWAY_URL:-}"

if [ -z "$RAILWAY_URL" ]; then
  echo "Error: RAILWAY_URL is not set."
  echo "  Export it first: export RAILWAY_URL=https://your-app.up.railway.app"
  exit 1
fi

STRIPE_ENDPOINT="${RAILWAY_URL}/api/webhooks/stripe"
TEMPOLOR_ENDPOINT="${RAILWAY_URL}/api/webhooks/tempolor"

# ─────────────────────────────────────────────
# STRIPE WEBHOOK REGISTRATION
# ─────────────────────────────────────────────
register_stripe() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Stripe Webhook Registration"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  if command -v stripe &>/dev/null && [ -n "$STRIPE_SECRET_KEY" ]; then
    echo "▶ Registering webhook via Stripe CLI..."
    RESULT=$(stripe webhooks create \
      --url "$STRIPE_ENDPOINT" \
      --events "checkout.session.completed,payment_intent.payment_failed" \
      --api-key "$STRIPE_SECRET_KEY" 2>&1)
    echo "$RESULT"

    WHSEC=$(echo "$RESULT" | grep -o 'whsec_[A-Za-z0-9]*' | head -1)
    if [ -n "$WHSEC" ]; then
      echo ""
      echo "✓ Webhook registered!"
      echo ""
      echo "  Set this in Railway:"
      echo "  STRIPE_WEBHOOK_SECRET=$WHSEC"
      echo ""
      echo "  Run: railway variables set STRIPE_WEBHOOK_SECRET=$WHSEC"
    fi
  else
    echo "Manual registration required (Stripe CLI or STRIPE_SECRET_KEY not found)."
    echo ""
    echo "  1. Open: https://dashboard.stripe.com/webhooks"
    echo "  2. Click 'Add endpoint'"
    echo "  3. Endpoint URL:   $STRIPE_ENDPOINT"
    echo "  4. Events to send: checkout.session.completed"
    echo "                     payment_intent.payment_failed"
    echo "  5. Click 'Add endpoint'"
    echo "  6. Copy the Signing secret (whsec_...)"
    echo "  7. Set on Railway: railway variables set STRIPE_WEBHOOK_SECRET=<secret>"
  fi
}

# ─────────────────────────────────────────────
# TEST STRIPE WEBHOOK
# ─────────────────────────────────────────────
test_stripe() {
  echo ""
  echo "▶ Testing Stripe webhook..."
  if command -v stripe &>/dev/null && [ -n "$STRIPE_SECRET_KEY" ]; then
    stripe trigger checkout.session.completed --api-key "$STRIPE_SECRET_KEY"
    echo "✓ Test event sent — check Railway logs: railway logs --tail"
  else
    echo "  stripe CLI not installed. Install: brew install stripe/stripe-cli/stripe"
    echo "  Then run: stripe trigger checkout.session.completed"
  fi
}

# ─────────────────────────────────────────────
# TEMPOLOR WEBHOOK
# ─────────────────────────────────────────────
register_tempolor() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  TemPolor Webhook Configuration"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  Callback URL: $TEMPOLOR_ENDPOINT"
  echo ""

  if [ -n "$TEMPOLOR_API_KEY" ] && [ -n "$TEMPOLOR_BASE_URL" ]; then
    echo "▶ Registering callback URL with TemPolor API..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${TEMPOLOR_BASE_URL}/api/settings/webhook" \
      -H "Authorization: Bearer $TEMPOLOR_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"callbackUrl\": \"$TEMPOLOR_ENDPOINT\"}" 2>/dev/null)

    if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
      echo "✓ TemPolor callback URL registered (HTTP $HTTP_STATUS)"
    else
      echo "  API registration returned HTTP $HTTP_STATUS."
      echo "  Register manually in the TemPolor dashboard."
      echo ""
      echo "  1. Log in to TemPolor dashboard"
      echo "  2. Navigate to API Settings > Webhooks"
      echo "  3. Set callback URL to: $TEMPOLOR_ENDPOINT"
    fi
  else
    echo "  TEMPOLOR_API_KEY or TEMPOLOR_BASE_URL not set."
    echo "  Manual setup:"
    echo "  1. Log in to TemPolor dashboard"
    echo "  2. API Settings > Webhooks"
    echo "  3. Set callback URL to: $TEMPOLOR_ENDPOINT"
  fi
}

# ─────────────────────────────────────────────
# VERIFY ENDPOINTS
# ─────────────────────────────────────────────
verify_endpoints() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Verifying webhook endpoints are reachable"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Health check first
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${RAILWAY_URL}/api/health")
  if [ "$HEALTH_STATUS" = "200" ]; then
    echo "  ✓ Health check: ${RAILWAY_URL}/api/health (HTTP 200)"
  else
    echo "  ✗ Health check FAILED (HTTP $HEALTH_STATUS) — deploy backend first"
    return 1
  fi

  # POST to webhook endpoints expect 400 (missing body) not 404
  STRIPE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$STRIPE_ENDPOINT")
  if [ "$STRIPE_STATUS" != "404" ]; then
    echo "  ✓ Stripe webhook endpoint reachable (HTTP $STRIPE_STATUS)"
  else
    echo "  ✗ Stripe webhook endpoint returned 404 — route not registered"
  fi

  TEMPOLOR_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$TEMPOLOR_ENDPOINT")
  if [ "$TEMPOLOR_STATUS" != "404" ]; then
    echo "  ✓ TemPolor webhook endpoint reachable (HTTP $TEMPOLOR_STATUS)"
  else
    echo "  ✗ TemPolor webhook endpoint returned 404 — route not registered"
  fi

  echo ""
}

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

case "${1:-help}" in
  stripe)   register_stripe; test_stripe ;;
  tempolor) register_tempolor ;;
  verify)   verify_endpoints ;;
  all)      register_stripe; test_stripe; register_tempolor; verify_endpoints ;;
  help|*)
    echo ""
    echo "Usage: ./scripts/setup_webhooks.sh <command>"
    echo ""
    echo "Commands:"
    echo "  stripe     Register Stripe webhook and send test event"
    echo "  tempolor   Register TemPolor callback URL"
    echo "  verify     Verify both webhook endpoints are reachable"
    echo "  all        Run stripe + tempolor + verify"
    echo ""
    echo "Required env vars:"
    echo "  RAILWAY_URL          — e.g. https://your-app.up.railway.app"
    echo "  STRIPE_SECRET_KEY    — for CLI-based registration (optional)"
    echo "  TEMPOLOR_API_KEY     — for API-based registration (optional)"
    echo "  TEMPOLOR_BASE_URL    — e.g. https://api.tempolor.com"
    echo ""
    echo "Example:"
    echo "  export RAILWAY_URL=https://tailoredtunes.up.railway.app"
    echo "  ./scripts/setup_webhooks.sh all"
    echo ""
    ;;
esac
