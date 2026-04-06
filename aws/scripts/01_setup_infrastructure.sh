#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 01_setup_infrastructure.sh
# Creates all AWS resources needed for TailoredTunez.
# Run once before first deploy.
# Usage: ./01_setup_infrastructure.sh [--profile tailortunez]
# ─────────────────────────────────────────────────────────────
set -euo pipefail

PROFILE="${AWS_PROFILE:-tailortunez}"
REGION="${AWS_REGION:-us-east-1}"
BUCKET="tailoredtunes-frontend"
ECR_REPO="tailortunez-backend"
CLUSTER="tailortunez"
SERVICE="tailortunez-backend"
EXEC_ROLE="TailoredTunezECSTaskExecutionRole"

AWS="aws --profile $PROFILE --region $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TailoredTunez — AWS Infrastructure Setup"
echo "  Profile : $PROFILE"
echo "  Region  : $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ACCOUNT_ID=$($AWS sts get-caller-identity --query Account --output text)
echo "✓ AWS Account: $ACCOUNT_ID"

# ── 1. S3 bucket for frontend ───────────────────────────
echo ""
echo "▶ Creating S3 bucket: $BUCKET"
if $AWS s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "  (already exists, skipping)"
else
  if [ "$REGION" = "us-east-1" ]; then
    $AWS s3api create-bucket --bucket "$BUCKET" > /dev/null
  else
    $AWS s3api create-bucket --bucket "$BUCKET" \
      --create-bucket-configuration LocationConstraint="$REGION" > /dev/null
  fi
  echo "  ✓ Bucket created"
fi
$AWS s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
echo "  ✓ Public access blocked (CloudFront OAC will serve content)"

# ── 2. ECR repository ───────────────────────────────────
echo ""
echo "▶ Creating ECR repository: $ECR_REPO"
if $AWS ecr describe-repositories --repository-names "$ECR_REPO" 2>/dev/null | grep -q repositoryName; then
  echo "  (already exists, skipping)"
else
  $AWS ecr create-repository \
    --repository-name "$ECR_REPO" \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 > /dev/null
  echo "  ✓ ECR repository created"
fi

ECR_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO"
echo "  ECR URI: $ECR_URI"

# ECR lifecycle policy — keep 10 tagged images, expire untagged after 1 day
$AWS ecr put-lifecycle-policy \
  --repository-name "$ECR_REPO" \
  --lifecycle-policy-text '{
    "rules": [
      {
        "rulePriority": 1,
        "description": "Expire untagged images after 1 day",
        "selection": {
          "tagStatus": "untagged",
          "countType": "sinceImagePushed",
          "countUnit": "days",
          "countNumber": 1
        },
        "action": { "type": "expire" }
      },
      {
        "rulePriority": 2,
        "description": "Keep only 10 most recent tagged images",
        "selection": {
          "tagStatus": "tagged",
          "tagPrefixList": ["v", "latest"],
          "countType": "imageCountMoreThan",
          "countNumber": 10
        },
        "action": { "type": "expire" }
      }
    ]
  }' > /dev/null
echo "  ✓ ECR lifecycle policy set"

# ── 3. ECS task execution IAM role ──────────────────────
echo ""
echo "▶ Creating ECS task execution IAM role: $EXEC_ROLE"
TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ecs-tasks.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}'

IAM="aws --profile $PROFILE"
if $IAM iam get-role --role-name "$EXEC_ROLE" 2>/dev/null | grep -q RoleName; then
  echo "  (already exists, skipping)"
else
  $IAM iam create-role \
    --role-name "$EXEC_ROLE" \
    --assume-role-policy-document "$TRUST_POLICY" > /dev/null
  # Standard ECS execution policy (ECR pull + CloudWatch logs)
  $IAM iam attach-role-policy \
    --role-name "$EXEC_ROLE" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
  # Inline policy for SSM Parameter Store access
  $IAM iam put-role-policy \
    --role-name "$EXEC_ROLE" \
    --policy-name "SSMParameterAccess" \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Action": [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ],
        "Resource": "arn:aws:ssm:*:*:parameter/tailortunez/*"
      }]
    }'
  echo "  ✓ IAM role created with ECR + SSM + CloudWatch permissions"
fi

EXEC_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${EXEC_ROLE}"

# ── 4. ECS cluster ──────────────────────────────────────
echo ""
echo "▶ Creating ECS cluster: $CLUSTER"
EXISTING_CLUSTER=$($AWS ecs describe-clusters --clusters "$CLUSTER" \
  --query "clusters[?status=='ACTIVE'].clusterName | [0]" --output text 2>/dev/null || echo "None")
if [ "$EXISTING_CLUSTER" = "$CLUSTER" ]; then
  echo "  (already exists, skipping)"
else
  $AWS ecs create-cluster \
    --cluster-name "$CLUSTER" \
    --no-cli-pager > /dev/null
  echo "  ✓ ECS cluster created"
fi

# ── 5. Security groups ──────────────────────────────────
echo ""
echo "▶ Setting up security groups..."
VPC_ID=$($AWS ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" --output text)
echo "  VPC: $VPC_ID"

# ALB security group (public HTTP/HTTPS)
ALB_SG_ID=$($AWS ec2 describe-security-groups \
  --filters "Name=group-name,Values=tailortunez-alb" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "None")
if [ -z "$ALB_SG_ID" ] || [ "$ALB_SG_ID" = "None" ]; then
  ALB_SG_ID=$($AWS ec2 create-security-group \
    --group-name "tailortunez-alb" \
    --description "TailoredTunez ALB - public HTTP/HTTPS" \
    --vpc-id "$VPC_ID" \
    --query "GroupId" --output text)
  $AWS ec2 authorize-security-group-ingress \
    --group-id "$ALB_SG_ID" --protocol tcp --port 80  --cidr 0.0.0.0/0 > /dev/null
  $AWS ec2 authorize-security-group-ingress \
    --group-id "$ALB_SG_ID" --protocol tcp --port 443 --cidr 0.0.0.0/0 > /dev/null
  echo "  ✓ ALB security group created: $ALB_SG_ID"
else
  echo "  (ALB SG already exists: $ALB_SG_ID)"
fi

# ECS task security group (port 3001 from ALB only)
ECS_SG_ID=$($AWS ec2 describe-security-groups \
  --filters "Name=group-name,Values=tailortunez-ecs" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "None")
if [ -z "$ECS_SG_ID" ] || [ "$ECS_SG_ID" = "None" ]; then
  ECS_SG_ID=$($AWS ec2 create-security-group \
    --group-name "tailortunez-ecs" \
    --description "TailoredTunez ECS tasks - inbound from ALB only" \
    --vpc-id "$VPC_ID" \
    --query "GroupId" --output text)
  $AWS ec2 authorize-security-group-ingress \
    --group-id "$ECS_SG_ID" \
    --protocol tcp --port 3001 \
    --source-group "$ALB_SG_ID" > /dev/null
  echo "  ✓ ECS security group created: $ECS_SG_ID"
else
  echo "  (ECS SG already exists: $ECS_SG_ID)"
fi

# ── 6. Application Load Balancer ────────────────────────
echo ""
echo "▶ Creating Application Load Balancer..."
readarray -t SUBNET_ARRAY < <($AWS ec2 describe-subnets \
  --filters "Name=defaultForAz,Values=true" \
  --query "Subnets[*].SubnetId" --output text | tr '\t' '\n')

ALB_ARN=$($AWS elbv2 describe-load-balancers \
  --names "tailortunez-alb" \
  --query "LoadBalancers[0].LoadBalancerArn" --output text 2>/dev/null || echo "None")
if [ -z "$ALB_ARN" ] || [ "$ALB_ARN" = "None" ]; then
  ALB_ARN=$($AWS elbv2 create-load-balancer \
    --name "tailortunez-alb" \
    --type application \
    --scheme internet-facing \
    --subnets "${SUBNET_ARRAY[@]}" \
    --security-groups "$ALB_SG_ID" \
    --query "LoadBalancers[0].LoadBalancerArn" --output text)
  echo "  ✓ ALB created: $ALB_ARN"
else
  echo "  (ALB already exists)"
fi

ALB_DNS=$($AWS elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --query "LoadBalancers[0].DNSName" --output text)
echo "  ALB DNS: $ALB_DNS"

# ── 7. Target group ─────────────────────────────────────
echo ""
echo "▶ Creating target group..."
TG_ARN=$($AWS elbv2 describe-target-groups \
  --names "tailortunez-backend" \
  --query "TargetGroups[0].TargetGroupArn" --output text 2>/dev/null || echo "None")
if [ -z "$TG_ARN" ] || [ "$TG_ARN" = "None" ]; then
  TG_ARN=$($AWS elbv2 create-target-group \
    --name "tailortunez-backend" \
    --protocol HTTP \
    --port 3001 \
    --vpc-id "$VPC_ID" \
    --target-type ip \
    --health-check-path "/api/health" \
    --health-check-interval-seconds 15 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --query "TargetGroups[0].TargetGroupArn" --output text)
  echo "  ✓ Target group created: $TG_ARN"
else
  echo "  (target group already exists)"
fi

# ── 8. ALB listener (HTTP → forward) ───────────────────
echo ""
echo "▶ Creating ALB HTTP listener..."
LISTENER_ARN=$($AWS elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --query "Listeners[?Port==\`80\`].ListenerArn | [0]" --output text 2>/dev/null || echo "None")
if [ -z "$LISTENER_ARN" ] || [ "$LISTENER_ARN" = "None" ]; then
  LISTENER_ARN=$($AWS elbv2 create-listener \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=forward,TargetGroupArn="$TG_ARN" \
    --query "Listeners[0].ListenerArn" --output text)
  echo "  ✓ HTTP listener created"
else
  echo "  (listener already exists)"
fi

# ── 9. Save config ──────────────────────────────────────
CONFIG_FILE="$(dirname "$0")/../.aws_config"
cat > "$CONFIG_FILE" <<EOF
# Auto-generated by 01_setup_infrastructure.sh — do not commit
ACCOUNT_ID=$ACCOUNT_ID
REGION=$REGION
PROFILE=$PROFILE
BUCKET=$BUCKET
ECR_REPO=$ECR_REPO
ECR_URI=$ECR_URI
EXEC_ROLE_ARN=$EXEC_ROLE_ARN
CLUSTER=$CLUSTER
SERVICE=$SERVICE
VPC_ID=$VPC_ID
ALB_SG_ID=$ALB_SG_ID
ECS_SG_ID=$ECS_SG_ID
ALB_ARN=$ALB_ARN
ALB_DNS=$ALB_DNS
TG_ARN=$TG_ARN
LISTENER_ARN=$LISTENER_ARN
APP_NAME=$SERVICE
EOF
echo ""
echo "  ✓ Config saved to aws/.aws_config"

# Also store ALB URL in SSM for deploy_frontend to pick up
$AWS ssm put-parameter \
  --name "/tailortunez/BACKEND_URL" \
  --value "http://$ALB_DNS" \
  --type String \
  --overwrite \
  --no-cli-pager > /dev/null
echo "  ✓ Backend URL stored in SSM"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Infrastructure setup complete!"
echo ""
echo "  Backend URL : http://$ALB_DNS"
echo ""
echo "  Next steps:"
echo "  1. Run: ./02_store_secrets.sh   (if not done)"
echo "  2. Run: ./deploy_backend.sh     (first deploy)"
echo "  3. Run: ./deploy_frontend.sh    (first deploy)"
echo "  4. Run: ./04_setup_monitoring.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
