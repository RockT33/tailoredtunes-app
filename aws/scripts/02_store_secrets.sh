#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 02_store_secrets.sh
# Stores all TailoredTunez secrets in AWS SSM Parameter Store.
# Values are encrypted with SecureString (AWS-managed KMS).
# Run after 01_setup_infrastructure.sh.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/../.aws_config"

if [ ! -f "$CONFIG" ]; then
  echo "✗ .aws_config not found. Run 01_setup_infrastructure.sh first."
  exit 1
fi
source "$CONFIG"

AWS="aws --profile $PROFILE --region $REGION"
NAMESPACE="/tailortunez"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TailoredTunez — Store Secrets in SSM"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All values are stored as SecureString (encrypted)."
echo "  Press Enter to skip a value (keeps existing)."
echo ""

store_param() {
  local name="$1"
  local prompt="$2"
  local default="${3:-}"

  if [ -n "$default" ]; then
    printf "  %-35s [%s]: " "$prompt" "$default"
  else
    printf "  %-35s : " "$prompt"
  fi

  read -r value
  value="${value:-$default}"

  if [ -z "$value" ]; then
    echo "    (skipped)"
    return
  fi

  $AWS ssm put-parameter \
    --name "$NAMESPACE/$name" \
    --value "$value" \
    --type SecureString \
    --overwrite \
    --no-cli-pager > /dev/null
  echo "    ✓ Stored $NAMESPACE/$name"
}

echo "── Supabase ──────────────────────────────────────"
store_param "SUPABASE_URL"              "Supabase URL"                "https://hdipsxxionbfnbqgjrnc.supabase.co"
store_param "SUPABASE_ANON_KEY"         "Supabase Anon Key"
store_param "SUPABASE_SERVICE_ROLE_KEY" "Supabase Service Role Key"

echo ""
echo "── TemPolor ──────────────────────────────────────"
store_param "TEMPOLOR_API_KEY"            "TemPolor API Key"            "Tempo-8-99dc0459cce048b1b26e0ed1504f66663_u"
store_param "TEMPOLOR_BASE_URL"           "TemPolor Base URL"           "https://api.tempolor.com"
store_param "TEMPOLOR_SONG_MODEL"         "TemPolor Song Model"         "TemPolor v3.5"
store_param "TEMPOLOR_INSTRUMENTAL_MODEL" "TemPolor Instrumental Model" "TemPolor i3.5"

echo ""
echo "── Stripe ────────────────────────────────────────"
store_param "STRIPE_SECRET_KEY"      "Stripe Secret Key (sk_live/test_)"
store_param "STRIPE_PUBLISHABLE_KEY" "Stripe Publishable Key (pk_live/test_)"
store_param "STRIPE_WEBHOOK_SECRET"  "Stripe Webhook Secret (whsec_)"
store_param "STRIPE_PRICE_BASIC"     "Stripe Price ID — Basic (price_)"
store_param "STRIPE_PRICE_PRO"       "Stripe Price ID — Pro (price_)"
store_param "STRIPE_PRICE_PREMIUM"   "Stripe Price ID — Premium (price_)"

echo ""
echo "── App Config ────────────────────────────────────"
store_param "JWT_SECRET"    "JWT Secret (32+ chars)"
store_param "FRONTEND_URL"  "Frontend URL"  "https://tailoredtunes.com"
store_param "CORS_ORIGIN"   "CORS Origin"   "https://tailoredtunes.com"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Secrets stored in SSM Parameter Store"
echo ""
echo "  To view all stored params:"
echo "  aws ssm get-parameters-by-path --path /tailortunez/ \\"
echo "    --with-decryption --profile $PROFILE --region $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
