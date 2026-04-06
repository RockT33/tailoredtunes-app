#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 04_setup_monitoring.sh
# Creates CloudWatch alarms and a dashboard for TailoredTunez.
# Run after deploy_backend.sh so the App Runner service exists.
# Usage: ./04_setup_monitoring.sh [--alert-email you@example.com]
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
ALERT_EMAIL="${1:-}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TailoredTunez — CloudWatch Monitoring Setup"
echo "  Region  : $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. SNS topic for alert emails ──────────────────────
echo ""
echo "▶ Setting up SNS alert topic..."
TOPIC_ARN=$($AWS sns list-topics \
  --query "Topics[?ends_with(TopicArn, ':tailortunez-alerts')].TopicArn | [0]" \
  --output text 2>/dev/null || echo "None")

if [ -z "$TOPIC_ARN" ] || [ "$TOPIC_ARN" = "None" ]; then
  TOPIC_ARN=$($AWS sns create-topic \
    --name "tailortunez-alerts" \
    --query "TopicArn" --output text)
  echo "  ✓ SNS topic created: $TOPIC_ARN"
else
  echo "  (topic already exists: $TOPIC_ARN)"
fi

if [ -n "$ALERT_EMAIL" ]; then
  $AWS sns subscribe \
    --topic-arn "$TOPIC_ARN" \
    --protocol email \
    --notification-endpoint "$ALERT_EMAIL" > /dev/null
  echo "  ✓ Alert subscription sent to $ALERT_EMAIL (confirm the email)"
fi

# ── 2. Discover App Runner service ARN ─────────────────
echo ""
echo "▶ Looking up App Runner service..."
SERVICE_ARN=$($AWS apprunner list-services \
  --query "ServiceSummaryList[?ServiceName=='$APP_NAME'].ServiceArn | [0]" \
  --output text 2>/dev/null || echo "None")

if [ -z "$SERVICE_ARN" ] || [ "$SERVICE_ARN" = "None" ]; then
  echo "  ⚠  App Runner service '$APP_NAME' not found."
  echo "     Run deploy_backend.sh first, then re-run this script."
  exit 1
fi

# Extract service ID from ARN (last path segment)
SERVICE_ID=$(echo "$SERVICE_ARN" | awk -F'/' '{print $NF}')
echo "  Service ARN: $SERVICE_ARN"
echo "  Service ID : $SERVICE_ID"

# ── 3. CloudWatch alarms ────────────────────────────────
echo ""
echo "▶ Creating CloudWatch alarms..."

put_alarm() {
  local name="$1"
  local metric="$2"
  local namespace="$3"
  local threshold="$4"
  local comparison="$5"   # GreaterThanThreshold | LessThanThreshold
  local period="${6:-300}"
  local description="$7"

  $AWS cloudwatch put-metric-alarm \
    --alarm-name "tailortunez-$name" \
    --alarm-description "$description" \
    --metric-name "$metric" \
    --namespace "$namespace" \
    --dimensions "Name=ServiceName,Value=$APP_NAME" "Name=ServiceId,Value=$SERVICE_ID" \
    --statistic Average \
    --period "$period" \
    --evaluation-periods 2 \
    --threshold "$threshold" \
    --comparison-operator "$comparison" \
    --treat-missing-data notBreaching \
    --alarm-actions "$TOPIC_ARN" \
    --ok-actions "$TOPIC_ARN" \
    --no-cli-pager
  echo "  ✓ $name"
}

# App Runner — HTTP 5xx error rate
$AWS cloudwatch put-metric-alarm \
  --alarm-name "tailortunez-5xx-errors" \
  --alarm-description "High 5xx error rate on TailoredTunez backend" \
  --metric-name "5xxStatusCode" \
  --namespace "AWS/AppRunner" \
  --dimensions "Name=ServiceName,Value=$APP_NAME" "Name=ServiceId,Value=$SERVICE_ID" \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions "$TOPIC_ARN" \
  --ok-actions "$TOPIC_ARN" \
  --no-cli-pager
echo "  ✓ 5xx-errors (>10 per 5 min)"

# App Runner — 4xx error rate (high volume may indicate attack)
$AWS cloudwatch put-metric-alarm \
  --alarm-name "tailortunez-4xx-spike" \
  --alarm-description "Spike in 4xx errors on TailoredTunez backend" \
  --metric-name "4xxStatusCode" \
  --namespace "AWS/AppRunner" \
  --dimensions "Name=ServiceName,Value=$APP_NAME" "Name=ServiceId,Value=$SERVICE_ID" \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions "$TOPIC_ARN" \
  --no-cli-pager
echo "  ✓ 4xx-spike (>100 per 5 min)"

# App Runner — high request latency (p99 > 5s)
$AWS cloudwatch put-metric-alarm \
  --alarm-name "tailortunez-high-latency" \
  --alarm-description "High backend response latency" \
  --metric-name "RequestLatency" \
  --namespace "AWS/AppRunner" \
  --dimensions "Name=ServiceName,Value=$APP_NAME" "Name=ServiceId,Value=$SERVICE_ID" \
  --extended-statistic "p99" \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 5000 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions "$TOPIC_ARN" \
  --no-cli-pager
echo "  ✓ high-latency (p99 > 5000ms)"

# App Runner — instance CPU
$AWS cloudwatch put-metric-alarm \
  --alarm-name "tailortunez-high-cpu" \
  --alarm-description "High CPU utilization on App Runner" \
  --metric-name "CPUUtilization" \
  --namespace "AWS/AppRunner" \
  --dimensions "Name=ServiceName,Value=$APP_NAME" "Name=ServiceId,Value=$SERVICE_ID" \
  --statistic Average \
  --period 300 \
  --evaluation-periods 3 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions "$TOPIC_ARN" \
  --no-cli-pager
echo "  ✓ high-cpu (avg > 80%)"

# App Runner — memory
$AWS cloudwatch put-metric-alarm \
  --alarm-name "tailortunez-high-memory" \
  --alarm-description "High memory utilization on App Runner" \
  --metric-name "MemoryUtilization" \
  --namespace "AWS/AppRunner" \
  --dimensions "Name=ServiceName,Value=$APP_NAME" "Name=ServiceId,Value=$SERVICE_ID" \
  --statistic Average \
  --period 300 \
  --evaluation-periods 3 \
  --threshold 85 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions "$TOPIC_ARN" \
  --no-cli-pager
echo "  ✓ high-memory (avg > 85%)"

# ── 4. CloudWatch dashboard ─────────────────────────────
echo ""
echo "▶ Creating CloudWatch dashboard..."

DASHBOARD_BODY=$(cat <<DASHBOARD
{
  "widgets": [
    {
      "type": "metric",
      "x": 0, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "Request Count",
        "view": "timeSeries",
        "stat": "Sum",
        "period": 60,
        "metrics": [
          ["AWS/AppRunner", "Requests", "ServiceName", "$APP_NAME", "ServiceId", "$SERVICE_ID"]
        ],
        "region": "$REGION"
      }
    },
    {
      "type": "metric",
      "x": 12, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "HTTP Status Codes",
        "view": "timeSeries",
        "stat": "Sum",
        "period": 60,
        "metrics": [
          ["AWS/AppRunner", "2xxStatusCode", "ServiceName", "$APP_NAME", "ServiceId", "$SERVICE_ID", {"label": "2xx", "color": "#2ca02c"}],
          ["AWS/AppRunner", "4xxStatusCode", "ServiceName", "$APP_NAME", "ServiceId", "$SERVICE_ID", {"label": "4xx", "color": "#ff7f0e"}],
          ["AWS/AppRunner", "5xxStatusCode", "ServiceName", "$APP_NAME", "ServiceId", "$SERVICE_ID", {"label": "5xx", "color": "#d62728"}]
        ],
        "region": "$REGION"
      }
    },
    {
      "type": "metric",
      "x": 0, "y": 6, "width": 12, "height": 6,
      "properties": {
        "title": "Request Latency (ms)",
        "view": "timeSeries",
        "metrics": [
          ["AWS/AppRunner", "RequestLatency", "ServiceName", "$APP_NAME", "ServiceId", "$SERVICE_ID", {"stat": "p50", "label": "p50"}],
          ["AWS/AppRunner", "RequestLatency", "ServiceName", "$APP_NAME", "ServiceId", "$SERVICE_ID", {"stat": "p95", "label": "p95"}],
          ["AWS/AppRunner", "RequestLatency", "ServiceName", "$APP_NAME", "ServiceId", "$SERVICE_ID", {"stat": "p99", "label": "p99"}]
        ],
        "period": 60,
        "region": "$REGION"
      }
    },
    {
      "type": "metric",
      "x": 12, "y": 6, "width": 12, "height": 6,
      "properties": {
        "title": "CPU & Memory Utilization (%)",
        "view": "timeSeries",
        "stat": "Average",
        "period": 60,
        "metrics": [
          ["AWS/AppRunner", "CPUUtilization",    "ServiceName", "$APP_NAME", "ServiceId", "$SERVICE_ID", {"label": "CPU"}],
          ["AWS/AppRunner", "MemoryUtilization", "ServiceName", "$APP_NAME", "ServiceId", "$SERVICE_ID", {"label": "Memory"}]
        ],
        "yAxis": {"left": {"min": 0, "max": 100}},
        "region": "$REGION"
      }
    },
    {
      "type": "alarm",
      "x": 0, "y": 12, "width": 24, "height": 4,
      "properties": {
        "title": "Active Alarms",
        "alarms": [
          "arn:aws:cloudwatch:$REGION:$ACCOUNT_ID:alarm:tailortunez-5xx-errors",
          "arn:aws:cloudwatch:$REGION:$ACCOUNT_ID:alarm:tailortunez-4xx-spike",
          "arn:aws:cloudwatch:$REGION:$ACCOUNT_ID:alarm:tailortunez-high-latency",
          "arn:aws:cloudwatch:$REGION:$ACCOUNT_ID:alarm:tailortunez-high-cpu",
          "arn:aws:cloudwatch:$REGION:$ACCOUNT_ID:alarm:tailortunez-high-memory"
        ]
      }
    }
  ]
}
DASHBOARD
)

$AWS cloudwatch put-dashboard \
  --dashboard-name "TailoredTunez" \
  --dashboard-body "$DASHBOARD_BODY" \
  --no-cli-pager > /dev/null
echo "  ✓ Dashboard 'TailoredTunez' created"

# ── 5. Save monitoring config ───────────────────────────
cat >> "$SCRIPT_DIR/../.aws_config" <<EOF

# Monitoring (added by 04_setup_monitoring.sh)
TOPIC_ARN=$TOPIC_ARN
SERVICE_ID=$SERVICE_ID
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Monitoring setup complete!"
echo ""
echo "  Dashboard:"
echo "  https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=TailoredTunez"
echo ""
echo "  Alarms:"
echo "  https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#alarmsV2:"
if [ -n "$ALERT_EMAIL" ]; then
  echo ""
  echo "  ⚠  Check $ALERT_EMAIL and confirm the SNS subscription."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
