#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 03_setup_domain.sh
# Sets up Route 53 hosted zone, ACM SSL cert, and wires
# CloudFront + App Runner to a custom domain.
# Usage: ./03_setup_domain.sh tailoredtunes.com
# ─────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <domain>   e.g. $0 tailoredtunes.com"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/../.aws_config"
CF_ID_FILE="$SCRIPT_DIR/../.cloudfront_id"

if [ ! -f "$CONFIG" ]; then
  echo "✗ .aws_config not found. Run 01_setup_infrastructure.sh first."
  exit 1
fi
source "$CONFIG"

AWS="aws --profile $PROFILE --region $REGION"
AWS_USE1="aws --profile $PROFILE --region us-east-1"   # ACM + CloudFront require us-east-1

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TailoredTunez — Domain Setup"
echo "  Domain  : $DOMAIN"
echo "  API     : api.$DOMAIN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Route 53 hosted zone ─────────────────────────────
echo ""
echo "▶ Setting up Route 53 hosted zone..."
ZONE_ID=$($AWS route53 list-hosted-zones-by-name \
  --dns-name "$DOMAIN." \
  --query "HostedZones[?Name=='$DOMAIN.'].Id | [0]" \
  --output text 2>/dev/null | sed 's|/hostedzone/||')

if [ -z "$ZONE_ID" ] || [ "$ZONE_ID" = "None" ]; then
  ZONE_ID=$($AWS route53 create-hosted-zone \
    --name "$DOMAIN" \
    --caller-reference "tailortunez-$(date +%s)" \
    --query "HostedZone.Id" --output text | sed 's|/hostedzone/||')
  echo "  ✓ Hosted zone created: $ZONE_ID"
else
  echo "  (zone already exists: $ZONE_ID)"
fi

# Print name servers
echo ""
echo "  ⚠  Point your domain registrar's nameservers to:"
$AWS route53 get-hosted-zone \
  --id "$ZONE_ID" \
  --query "DelegationSet.NameServers" \
  --output text | tr '\t' '\n' | sed 's/^/    /'

# ── 2. ACM SSL certificate (us-east-1 for CloudFront) ──
echo ""
echo "▶ Requesting ACM SSL certificate..."
CERT_ARN=$($AWS_USE1 acm list-certificates \
  --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" \
  --output text 2>/dev/null)

if [ -z "$CERT_ARN" ] || [ "$CERT_ARN" = "None" ]; then
  CERT_ARN=$($AWS_USE1 acm request-certificate \
    --domain-name "$DOMAIN" \
    --subject-alternative-names "*.$DOMAIN" \
    --validation-method DNS \
    --query "CertificateArn" --output text)
  echo "  ✓ Certificate requested: $CERT_ARN"
else
  echo "  (certificate already exists: $CERT_ARN)"
fi

# Get DNS validation records and add to Route 53
echo ""
echo "▶ Adding DNS validation records to Route 53..."
sleep 5  # ACM needs a moment to generate validation records

VALIDATION_RECORDS=$($AWS_USE1 acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --query "Certificate.DomainValidationOptions[].ResourceRecord" \
  --output json)

RECORD_NAME=$(echo "$VALIDATION_RECORDS" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r[0]['Name'])" 2>/dev/null || echo "")
RECORD_VALUE=$(echo "$VALIDATION_RECORDS" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r[0]['Value'])" 2>/dev/null || echo "")

if [ -n "$RECORD_NAME" ] && [ -n "$RECORD_VALUE" ]; then
  $AWS route53 change-resource-record-sets \
    --hosted-zone-id "$ZONE_ID" \
    --change-batch "{
      \"Changes\": [{
        \"Action\": \"UPSERT\",
        \"ResourceRecordSet\": {
          \"Name\": \"$RECORD_NAME\",
          \"Type\": \"CNAME\",
          \"TTL\": 300,
          \"ResourceRecords\": [{\"Value\": \"$RECORD_VALUE\"}]
        }
      }]
    }" > /dev/null
  echo "  ✓ DNS validation record added"
fi

echo "  ⏳ Waiting for certificate validation (2–10 min)..."
$AWS_USE1 acm wait certificate-validated --certificate-arn "$CERT_ARN" && \
  echo "  ✓ Certificate validated!" || \
  echo "  ⚠  Validation still pending — re-run this script after DNS propagates"

# ── 3. Attach domain to CloudFront ─────────────────────
if [ -f "$CF_ID_FILE" ]; then
  CF_ID=$(cat "$CF_ID_FILE")
  echo ""
  echo "▶ Attaching $DOMAIN to CloudFront distribution $CF_ID..."

  # Get current distribution config + etag
  CF_ETAG=$($AWS_USE1 cloudfront get-distribution-config \
    --id "$CF_ID" --query "ETag" --output text)
  CF_CONFIG=$($AWS_USE1 cloudfront get-distribution-config \
    --id "$CF_ID" --query "DistributionConfig" --output json)

  # Update aliases and certificate
  UPDATED_CONFIG=$(echo "$CF_CONFIG" | python3 -c "
import sys, json
cfg = json.load(sys.stdin)
cfg['Aliases'] = {'Quantity': 1, 'Items': ['$DOMAIN']}
cfg['ViewerCertificate'] = {
  'ACMCertificateArn': '$CERT_ARN',
  'SSLSupportMethod': 'sni-only',
  'MinimumProtocolVersion': 'TLSv1.2_2021'
}
print(json.dumps(cfg))
")

  $AWS_USE1 cloudfront update-distribution \
    --id "$CF_ID" \
    --if-match "$CF_ETAG" \
    --distribution-config "$UPDATED_CONFIG" > /dev/null
  echo "  ✓ Custom domain attached to CloudFront"

  # Add A record (alias) for root domain
  CF_DOMAIN=$($AWS_USE1 cloudfront get-distribution \
    --id "$CF_ID" --query "Distribution.DomainName" --output text)
  $AWS route53 change-resource-record-sets \
    --hosted-zone-id "$ZONE_ID" \
    --change-batch "{
      \"Changes\": [{
        \"Action\": \"UPSERT\",
        \"ResourceRecordSet\": {
          \"Name\": \"$DOMAIN\",
          \"Type\": \"A\",
          \"AliasTarget\": {
            \"HostedZoneId\": \"Z2FDTNDATAQYW2\",
            \"DNSName\": \"$CF_DOMAIN\",
            \"EvaluateTargetHealth\": false
          }
        }
      }]
    }" > /dev/null
  echo "  ✓ Route 53 A record created → CloudFront"
fi

# ── 4. Attach api. subdomain to App Runner ──────────────
echo ""
echo "▶ Attaching api.$DOMAIN to App Runner..."
SERVICE_ARN=$($AWS apprunner list-services \
  --query "ServiceSummaryList[?ServiceName=='$APP_NAME'].ServiceArn | [0]" \
  --output text 2>/dev/null || echo "")

if [ -n "$SERVICE_ARN" ] && [ "$SERVICE_ARN" != "None" ]; then
  $AWS apprunner associate-custom-domain \
    --service-arn "$SERVICE_ARN" \
    --domain-name "api.$DOMAIN" 2>/dev/null || echo "  (already associated)"

  # Get App Runner validation records
  echo "  ✓ api.$DOMAIN associated with App Runner"
  echo "  ⚠  Add App Runner's CNAME validation records to Route 53:"
  $AWS apprunner describe-custom-domains \
    --service-arn "$SERVICE_ARN" \
    --query "CustomDomains[].CertificateValidationRecords[]" \
    --output table 2>/dev/null || true
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Domain setup complete!"
echo ""
echo "  Frontend : https://$DOMAIN"
echo "  Backend  : https://api.$DOMAIN"
echo ""
echo "  Update SSM secrets with the new URLs:"
echo "  aws ssm put-parameter --name /tailortunez/FRONTEND_URL \\"
echo "    --value https://$DOMAIN --type SecureString --overwrite \\"
echo "    --profile $PROFILE --region $REGION"
echo "  aws ssm put-parameter --name /tailortunez/CORS_ORIGIN \\"
echo "    --value https://$DOMAIN --type SecureString --overwrite \\"
echo "    --profile $PROFILE --region $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
