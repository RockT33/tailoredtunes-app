#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# deploy_backend.sh
# Builds Docker image → pushes to ECR → deploys to ECS Fargate.
# First run: creates the ECS service.
# Subsequent runs: registers a new task definition revision + updates service.
# Usage: ./deploy_backend.sh [image-tag]   default: latest
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

AWS="aws --profile $PROFILE --region $REGION"
IMAGE_TAG="${1:-latest}"
FULL_IMAGE="$ECR_URI:$IMAGE_TAG"
TASK_FAMILY="tailortunez-backend"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TailoredTunez — Backend Deploy (ECS Fargate)"
echo "  Image : $FULL_IMAGE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Authenticate Docker with ECR ────────────────────
echo ""
echo "▶ Authenticating Docker with ECR..."
$AWS ecr get-login-password \
  | docker login \
    --username AWS \
    --password-stdin \
    "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
echo "  ✓ Docker authenticated"

# ── 2. Build image ──────────────────────────────────────
echo ""
echo "▶ Building Docker image..."
cd "$ROOT"
docker build \
  --platform linux/amd64 \
  --tag "$FULL_IMAGE" \
  --tag "$ECR_URI:latest" \
  .
echo "  ✓ Image built"

# ── 3. Push to ECR ──────────────────────────────────────
echo ""
echo "▶ Pushing to ECR..."
docker push "$FULL_IMAGE"
[ "$IMAGE_TAG" != "latest" ] && docker push "$ECR_URI:latest"
echo "  ✓ Image pushed"

# ── 4. Register ECS task definition ────────────────────
echo ""
echo "▶ Registering ECS task definition..."

# Inject ACCOUNT_ID and IMAGE_TAG into template
TASK_DEF=$(sed \
  -e "s/ACCOUNT_ID/$ACCOUNT_ID/g" \
  -e "s|IMAGE_TAG|$IMAGE_TAG|g" \
  "$SCRIPT_DIR/../ecs/task-definition.json")

TASK_DEF_ARN=$($AWS ecs register-task-definition \
  --cli-input-json "$TASK_DEF" \
  --query "taskDefinition.taskDefinitionArn" --output text)
TASK_REVISION=$(echo "$TASK_DEF_ARN" | awk -F: '{print $NF}')
echo "  ✓ Task definition registered: $TASK_FAMILY:$TASK_REVISION"

# ── 5. Create or update ECS service ────────────────────
echo ""
echo "▶ Checking ECS service..."

# Get public subnets as comma-separated list for awsvpcConfiguration
SUBNET_IDS=$($AWS ec2 describe-subnets \
  --filters "Name=defaultForAz,Values=true" \
  --query "Subnets[*].SubnetId" \
  --output json | python3 -c "import sys,json; print(','.join(json.load(sys.stdin)))")

EXISTING_SERVICE=$($AWS ecs describe-services \
  --cluster "$CLUSTER" --services "$SERVICE" \
  --query "services[?status=='ACTIVE'].serviceName | [0]" \
  --output text 2>/dev/null || echo "None")

if [ -z "$EXISTING_SERVICE" ] || [ "$EXISTING_SERVICE" = "None" ]; then
  echo "  No service found — creating ECS service..."
  $AWS ecs create-service \
    --cluster "$CLUSTER" \
    --service-name "$SERVICE" \
    --task-definition "$TASK_FAMILY:$TASK_REVISION" \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$ECS_SG_ID],assignPublicIp=ENABLED}" \
    --load-balancers "targetGroupArn=$TG_ARN,containerName=tailortunez-backend,containerPort=3001" \
    --health-check-grace-period-seconds 60 \
    --no-cli-pager > /dev/null
  echo "  ✓ ECS service created"
  echo ""
  echo "  ⏳ Waiting for service to become stable (2–4 min)..."
  $AWS ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"
  echo "  ✓ Service is stable"
else
  echo "  Service found — updating to new task definition..."
  $AWS ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SERVICE" \
    --task-definition "$TASK_FAMILY:$TASK_REVISION" \
    --force-new-deployment \
    --no-cli-pager > /dev/null
  echo "  ✓ Deployment triggered: $TASK_FAMILY:$TASK_REVISION"
  echo ""
  echo "  ⏳ Waiting for service to stabilise..."
  $AWS ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"
  echo "  ✓ Service is stable"
fi

# ── 6. Print backend URL ────────────────────────────────
echo ""
echo "  ✓ Backend URL : http://$ALB_DNS"
echo "  ✓ Health      : http://$ALB_DNS/api/health"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Backend deployed successfully"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
