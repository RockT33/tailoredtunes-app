#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  aws-manage.sh — TailoredTunez AWS Management CLI
#  Usage: ./aws-manage.sh <command> [args]
# ═══════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AWS_DIR="$SCRIPT_DIR/aws"
SCRIPTS="$AWS_DIR/scripts"
CONFIG="$AWS_DIR/.aws_config"

PROFILE="${AWS_PROFILE:-tailortunez}"
REGION="${AWS_REGION:-us-east-1}"
AWS_CMD="aws --profile $PROFILE --region $REGION"

# ── Load config if it exists ────────────────────────────
[ -f "$CONFIG" ] && source "$CONFIG"

# ── Colors ──────────────────────────────────────────────
B="\033[1m"; R="\033[0m"; G="\033[32m"; Y="\033[33m"; C="\033[36m"; E="\033[31m"

# ── Help ────────────────────────────────────────────────
usage() {
cat <<EOF
${B}TailoredTunez AWS Management${R}

${C}Setup${R}
  setup              Create all AWS resources (S3, ECR, ECS, ALB, IAM)
  secrets            Store / update secrets in SSM Parameter Store
  domain <name>      Configure Route 53 + ACM SSL + CloudFront + ALB domain
  monitoring [email] Create CloudWatch alarms + dashboard

${C}Deploy${R}
  deploy             Build & deploy backend + frontend
  deploy:backend     Build Docker image → push ECR → deploy ECS Fargate
  deploy:frontend    Build React app → sync S3 → invalidate CloudFront
  rollback           Re-deploy the previous task definition revision

${C}Manage${R}
  status             Show live status of all AWS services
  logs               Tail ECS backend application logs
  secrets:list       List all SSM parameters (names only)
  secrets:get <k>    Print a decrypted SSM value
  secrets:set <k>    Update a single SSM parameter interactively
  invalidate         Force CloudFront cache invalidation
  scale <n>          Set ECS desired task count (e.g. scale 2)
  configure          Run: aws configure --profile tailortunez

${C}Info${R}
  urls               Print live frontend + backend URLs
  health             Curl the backend /api/health endpoint
  monitor            Open CloudWatch dashboard in browser

${B}Examples${R}
  ./aws-manage.sh setup
  ./aws-manage.sh secrets
  ./aws-manage.sh deploy
  ./aws-manage.sh deploy:backend
  ./aws-manage.sh rollback
  ./aws-manage.sh status
  ./aws-manage.sh domain tailoredtunes.com
  ./aws-manage.sh monitoring you@example.com
  ./aws-manage.sh logs
  ./aws-manage.sh scale 2
  ./aws-manage.sh secrets:get STRIPE_SECRET_KEY
EOF
}

# ── Require config file for most commands ──────────────
require_config() {
  if [ ! -f "$CONFIG" ]; then
    echo -e "${E}✗ Run './aws-manage.sh setup' first.${R}"
    exit 1
  fi
}

# ── Commands ────────────────────────────────────────────
cmd="${1:-help}"
shift || true

case "$cmd" in

  # ── Setup ─────────────────────────────────────────────
  setup)
    bash "$SCRIPTS/01_setup_infrastructure.sh"
    ;;

  secrets)
    require_config
    bash "$SCRIPTS/02_store_secrets.sh"
    ;;

  domain)
    require_config
    DOMAIN="${1:-}"
    [ -z "$DOMAIN" ] && { echo "Usage: $0 domain <name>"; exit 1; }
    bash "$SCRIPTS/03_setup_domain.sh" "$DOMAIN"
    ;;

  monitoring)
    require_config
    bash "$SCRIPTS/04_setup_monitoring.sh" "${1:-}"
    ;;

  # ── Deploy ────────────────────────────────────────────
  deploy)
    require_config
    bash "$SCRIPTS/deploy_all.sh"
    ;;

  deploy:backend)
    require_config
    bash "$SCRIPTS/deploy_backend.sh" "${1:-latest}"
    ;;

  deploy:frontend)
    require_config
    bash "$SCRIPTS/deploy_frontend.sh"
    ;;

  rollback)
    require_config
    echo -e "${B}TailoredTunez — Rollback${R}"
    echo ""
    # Find the previous active task definition revision
    CURRENT_REV=$($AWS_CMD ecs describe-services \
      --cluster "$CLUSTER" --services "$SERVICE" \
      --query "services[0].taskDefinition" --output text 2>/dev/null || echo "")
    CURRENT_NUM=$(echo "$CURRENT_REV" | awk -F: '{print $NF}')
    PREV_NUM=$((CURRENT_NUM - 1))
    if [ "$PREV_NUM" -lt 1 ]; then
      echo -e "${E}✗ No previous task definition revision to roll back to.${R}"
      exit 1
    fi
    PREV_DEF="tailortunez-backend:$PREV_NUM"
    echo "  Current : tailortunez-backend:$CURRENT_NUM"
    echo "  Rolling back to: $PREV_DEF"
    $AWS_CMD ecs update-service \
      --cluster "$CLUSTER" \
      --service "$SERVICE" \
      --task-definition "$PREV_DEF" \
      --force-new-deployment \
      --no-cli-pager > /dev/null
    echo -e "  ${G}✓ Rollback deployment triggered${R}"
    echo "  ⏳ Waiting for service to stabilise..."
    $AWS_CMD ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"
    echo -e "  ${G}✓ Service stable on $PREV_DEF${R}"
    ;;

  # ── Status ────────────────────────────────────────────
  status)
    require_config
    echo -e "${B}TailoredTunez — Service Status${R}"
    echo ""

    # ECS service
    echo -e "${C}▶ ECS Fargate (Backend)${R}"
    $AWS_CMD ecs describe-services \
      --cluster "$CLUSTER" --services "$SERVICE" \
      --query "services[0].{Status:status,Running:runningCount,Desired:desiredCount,TaskDef:taskDefinition}" \
      --output table 2>/dev/null || echo "  (no service found)"

    # ALB
    echo ""
    echo -e "${C}▶ Load Balancer${R}"
    echo "  http://${ALB_DNS:-not configured}"
    if [ -n "${ALB_DNS:-}" ]; then
      HEALTH=$(curl -sf --max-time 5 "http://$ALB_DNS/api/health" 2>/dev/null && echo "UP" || echo "DOWN")
      echo "  Health: $HEALTH"
    fi

    # S3
    echo ""
    echo -e "${C}▶ S3 (Frontend bucket)${R}"
    $AWS_CMD s3 ls "s3://$BUCKET" --summarize 2>/dev/null | tail -2 || echo "  (bucket not found)"

    # CloudFront
    echo ""
    echo -e "${C}▶ CloudFront${R}"
    CF_ID_FILE="$AWS_DIR/.cloudfront_id"
    if [ -f "$CF_ID_FILE" ]; then
      CF_ID=$(cat "$CF_ID_FILE")
      $AWS_CMD cloudfront get-distribution \
        --id "$CF_ID" \
        --query "{Id:Distribution.Id,Status:Distribution.Status,Domain:Distribution.DomainName}" \
        --output table 2>/dev/null || echo "  (distribution not found)"
    else
      echo "  (not created yet — run deploy:frontend)"
    fi

    # SSM
    echo ""
    echo -e "${C}▶ SSM Parameter Store${R}"
    COUNT=$($AWS_CMD ssm get-parameters-by-path \
      --path "/tailortunez/" \
      --query "length(Parameters)" \
      --output text 2>/dev/null || echo "0")
    echo "  $COUNT secrets stored in /tailortunez/"
    ;;

  # ── Logs ──────────────────────────────────────────────
  logs)
    require_config
    LOG_GROUP="/ecs/tailortunez-backend"
    echo "Tailing $LOG_GROUP ..."
    # Get most recent log stream
    STREAM=$($AWS_CMD logs describe-log-streams \
      --log-group-name "$LOG_GROUP" \
      --order-by LastEventTime \
      --descending \
      --max-items 1 \
      --query "logStreams[0].logStreamName" \
      --output text 2>/dev/null || echo "None")
    if [ -z "$STREAM" ] || [ "$STREAM" = "None" ]; then
      echo "  ⚠  No log streams found yet — service may still be starting."
      exit 1
    fi
    $AWS_CMD logs tail "$LOG_GROUP" --follow
    ;;

  # ── Secrets management ────────────────────────────────
  secrets:list)
    require_config
    echo -e "${C}SSM Parameters under /tailortunez/${R}"
    $AWS_CMD ssm get-parameters-by-path \
      --path "/tailortunez/" \
      --query "Parameters[].Name" \
      --output table
    ;;

  secrets:get)
    require_config
    KEY="${1:-}"
    [ -z "$KEY" ] && { echo "Usage: $0 secrets:get <KEY>"; exit 1; }
    $AWS_CMD ssm get-parameter \
      --name "/tailortunez/$KEY" \
      --with-decryption \
      --query "Parameter.Value" \
      --output text
    ;;

  secrets:set)
    require_config
    KEY="${1:-}"
    [ -z "$KEY" ] && { echo "Usage: $0 secrets:set <KEY>"; exit 1; }
    printf "New value for %s: " "$KEY"
    read -r VALUE
    $AWS_CMD ssm put-parameter \
      --name "/tailortunez/$KEY" \
      --value "$VALUE" \
      --type SecureString \
      --overwrite \
      --no-cli-pager > /dev/null
    echo -e "${G}✓ /tailortunez/$KEY updated${R}"
    ;;

  # ── CloudFront invalidation ───────────────────────────
  invalidate)
    require_config
    CF_ID_FILE="$AWS_DIR/.cloudfront_id"
    if [ ! -f "$CF_ID_FILE" ]; then
      echo -e "${E}✗ CloudFront distribution ID not found.${R}"
      exit 1
    fi
    CF_ID=$(cat "$CF_ID_FILE")
    ID=$($AWS_CMD cloudfront create-invalidation \
      --distribution-id "$CF_ID" \
      --paths "/*" \
      --query "Invalidation.Id" --output text)
    echo -e "${G}✓ Invalidation $ID created${R}"
    ;;

  # ── Scale ECS ─────────────────────────────────────────
  scale)
    require_config
    COUNT="${1:-}"
    [ -z "$COUNT" ] && { echo "Usage: $0 scale <desired-count>"; exit 1; }
    $AWS_CMD ecs update-service \
      --cluster "$CLUSTER" \
      --service "$SERVICE" \
      --desired-count "$COUNT" \
      --no-cli-pager > /dev/null
    echo -e "${G}✓ ECS desired count set to $COUNT${R}"
    ;;

  # ── CloudWatch dashboard ──────────────────────────────
  monitor)
    require_config
    URL="https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=TailoredTunez"
    echo -e "${C}CloudWatch Dashboard:${R}"
    echo "  $URL"
    command -v open &>/dev/null && open "$URL" || true
    ;;

  # ── URLs ──────────────────────────────────────────────
  urls)
    require_config
    echo -e "${B}Live URLs${R}"

    CF_ID_FILE="$AWS_DIR/.cloudfront_id"
    if [ -f "$CF_ID_FILE" ]; then
      CF_ID=$(cat "$CF_ID_FILE")
      CF_DOMAIN=$($AWS_CMD cloudfront get-distribution \
        --id "$CF_ID" --query "Distribution.DomainName" --output text 2>/dev/null || echo "")
      [ -n "$CF_DOMAIN" ] && echo "  Frontend : https://$CF_DOMAIN"
    fi

    [ -n "${ALB_DNS:-}" ] && echo "  Backend  : http://$ALB_DNS"
    ;;

  # ── Health check ──────────────────────────────────────
  health)
    require_config
    if [ -z "${ALB_DNS:-}" ]; then
      echo -e "${E}✗ ALB DNS not found in config.${R}"
      exit 1
    fi
    echo "Checking http://$ALB_DNS/api/health ..."
    curl -sf "http://$ALB_DNS/api/health" | python3 -m json.tool
    ;;

  # ── AWS CLI configure ─────────────────────────────────
  configure)
    aws configure --profile tailortunez
    ;;

  # ── Help ──────────────────────────────────────────────
  help|--help|-h|"")
    usage
    ;;

  *)
    echo -e "${E}Unknown command: $cmd${R}"
    echo ""
    usage
    exit 1
    ;;
esac
