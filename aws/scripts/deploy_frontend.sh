#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# deploy_frontend.sh
# Builds the React app and deploys to S3 + invalidates CloudFront.
# First run: also creates the CloudFront distribution.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/../.."
CONFIG="$SCRIPT_DIR/../.aws_config"

if [ ! -f "$CONFIG" ]; then
  echo "✗ .aws_config not found. Run 01_setup_infrastructure.sh first."
  exit 1
fi
source "$CONFIG"

CF_CONFIG_FILE="$SCRIPT_DIR/../.cloudfront_id"
AWS="aws --profile $PROFILE --region $REGION"
# CloudFront + ACM always require us-east-1
AWS_CF="aws --profile $PROFILE --region us-east-1"

# ── Helper: create CloudFront distribution ─────────────
# Must be defined before it is called below.
_create_cloudfront_distribution() {
  # Create OAC for S3
  OAC_ID=$($AWS_CF cloudfront create-origin-access-control \
    --origin-access-control-config '{
      "Name": "tailortunez-s3-oac",
      "Description": "OAC for TailoredTunez S3 bucket",
      "SigningProtocol": "sigv4",
      "SigningBehavior": "always",
      "OriginAccessControlOriginType": "s3"
    }' \
    --query "OriginAccessControl.Id" --output text)
  echo "  ✓ Origin Access Control created: $OAC_ID"

  # Create distribution
  CALLER_REF="tailortunez-$(date +%s)"
  CF_ID=$($AWS_CF cloudfront create-distribution --distribution-config "{
    \"CallerReference\": \"$CALLER_REF\",
    \"Comment\": \"TailoredTunez Frontend\",
    \"DefaultRootObject\": \"index.html\",
    \"Origins\": {
      \"Quantity\": 1,
      \"Items\": [{
        \"Id\": \"s3-tailortunez\",
        \"DomainName\": \"$BUCKET.s3.$REGION.amazonaws.com\",
        \"OriginAccessControlId\": \"$OAC_ID\",
        \"S3OriginConfig\": { \"OriginAccessIdentity\": \"\" }
      }]
    },
    \"DefaultCacheBehavior\": {
      \"TargetOriginId\": \"s3-tailortunez\",
      \"ViewerProtocolPolicy\": \"redirect-to-https\",
      \"CachePolicyId\": \"658327ea-f89d-4fab-a63d-7e88639e58f6\",
      \"Compress\": true
    },
    \"CustomErrorResponses\": {
      \"Quantity\": 1,
      \"Items\": [{
        \"ErrorCode\": 403,
        \"ResponseCode\": \"200\",
        \"ResponsePagePath\": \"/index.html\",
        \"ErrorCachingMinTTL\": 0
      }]
    },
    \"Enabled\": true,
    \"PriceClass\": \"PriceClass_100\"
  }" --query "Distribution.Id" --output text)

  echo "$CF_ID" > "$CF_CONFIG_FILE"
  CF_DOMAIN=$($AWS_CF cloudfront get-distribution \
    --id "$CF_ID" \
    --query "Distribution.DomainName" --output text)

  # Update bucket policy to allow CloudFront OAC
  $AWS s3api put-bucket-policy --bucket "$BUCKET" --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Sid\": \"AllowCloudFrontOAC\",
      \"Effect\": \"Allow\",
      \"Principal\": { \"Service\": \"cloudfront.amazonaws.com\" },
      \"Action\": \"s3:GetObject\",
      \"Resource\": \"arn:aws:s3:::$BUCKET/*\",
      \"Condition\": {
        \"StringEquals\": {
          \"AWS:SourceArn\": \"arn:aws:cloudfront::$ACCOUNT_ID:distribution/$CF_ID\"
        }
      }
    }]
  }"

  echo ""
  echo "  ✓ CloudFront distribution created: $CF_ID"
  echo "  ✓ Distribution URL: https://$CF_DOMAIN"
  echo "  ⏳ Distribution deploying (5–15 min first time)"
  echo "  → To attach a custom domain, run: ./03_setup_domain.sh"
}

# ── Main ───────────────────────────────────────────────

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TailoredTunez — Frontend Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Build frontend ───────────────────────────────────
echo ""
echo "▶ Building frontend..."
cd "$ROOT/frontend"

# Pull VITE_API_URL from SSM (stored by deploy_backend.sh) if not set in env
if [ -z "${VITE_API_URL:-}" ]; then
  BACKEND_URL=$($AWS ssm get-parameter \
    --name "/tailortunez/BACKEND_URL" \
    --with-decryption --query "Parameter.Value" --output text 2>/dev/null || echo "")
  if [ -n "$BACKEND_URL" ] && [ "$BACKEND_URL" != "None" ]; then
    export VITE_API_URL="${BACKEND_URL}/api"
  else
    # Fallback: derive from live App Runner service
    APP_RUNNER_URL=$($AWS apprunner list-services \
      --query "ServiceSummaryList[?ServiceName=='$APP_NAME'].ServiceUrl | [0]" \
      --output text 2>/dev/null || echo "")
    [ -n "$APP_RUNNER_URL" ] && [ "$APP_RUNNER_URL" != "None" ] && \
      export VITE_API_URL="https://$APP_RUNNER_URL/api"
  fi
fi

VITE_STRIPE_PK=$($AWS ssm get-parameter \
  --name "/tailortunez/STRIPE_PUBLISHABLE_KEY" \
  --with-decryption --query "Parameter.Value" --output text 2>/dev/null || echo "")

echo "  VITE_API_URL=${VITE_API_URL:-http://localhost:3001/api}"

VITE_API_URL="${VITE_API_URL:-http://localhost:3001/api}" \
VITE_STRIPE_PUBLISHABLE_KEY="$VITE_STRIPE_PK" \
npm run build

echo "  ✓ Build complete → frontend/dist/"

# ── 2. Sync to S3 ──────────────────────────────────────
echo ""
echo "▶ Syncing to S3: s3://$BUCKET"

# Long-lived assets (hashed filenames by Vite)
$AWS s3 sync dist/ "s3://$BUCKET" \
  --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable" \
  --delete

# index.html — never cache (SPA entry point must always be fresh)
$AWS s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache,no-store,must-revalidate"

echo "  ✓ S3 sync complete"

# ── 3. CloudFront — create or invalidate ───────────────
cd "$SCRIPT_DIR"

if [ -f "$CF_CONFIG_FILE" ]; then
  CF_ID=$(cat "$CF_CONFIG_FILE")
  echo ""
  echo "▶ Invalidating CloudFront distribution: $CF_ID"
  INVALIDATION_ID=$($AWS_CF cloudfront create-invalidation \
    --distribution-id "$CF_ID" \
    --paths "/*" \
    --query "Invalidation.Id" --output text)
  echo "  ✓ Invalidation $INVALIDATION_ID created (propagates in ~30s)"
else
  echo ""
  echo "▶ No CloudFront distribution found — creating one..."
  _create_cloudfront_distribution
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Frontend deployed successfully"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
