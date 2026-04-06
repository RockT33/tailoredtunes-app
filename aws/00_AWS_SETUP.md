# AWS Setup Guide — TailoredTunez

## Architecture

```
                    Route 53 (DNS)
                         │
              ┌──────────┴──────────┐
              │                     │
   tailoredtunes.com         api.tailoredtunes.com
              │                     │
        CloudFront             App Runner
              │                     │
    S3 Bucket (frontend)    ECR (Docker image)
                                     │
                            Supabase (DB stays)
```

| Layer       | AWS Service          | Replaces       |
|-------------|----------------------|----------------|
| Frontend    | S3 + CloudFront      | Vercel         |
| Backend     | App Runner (Docker)  | Railway        |
| DNS         | Route 53             | —              |
| SSL         | ACM (free)           | —              |
| Secrets     | SSM Parameter Store  | .env files     |
| Registry    | ECR                  | Docker Hub     |

---

## Step 1 — Create IAM User

1. Go to AWS Console → IAM → Users → **Create user**
2. Name: `tailortunez-deploy`
3. Select **"Attach policies directly"**
4. Click **"Create policy"** → JSON tab → paste `aws/policies/tailortunez-deploy-policy.json`
5. Name it `TailoredTunezDeployPolicy` → Create
6. Attach it to `tailortunez-deploy`
7. After user is created → **Security credentials** tab → **Create access key**
8. Choose **"CLI"** use case → copy **Access Key ID** and **Secret Access Key**

---

## Step 2 — Configure AWS CLI

Run this and enter your keys when prompted:

```bash
aws configure --profile tailortunez
```

Inputs:
- AWS Access Key ID: (from step 1)
- AWS Secret Access Key: (from step 1)
- Default region: `us-east-1`  ← required for CloudFront ACM certs
- Default output format: `json`

Verify:
```bash
aws sts get-caller-identity --profile tailortunez
```

---

## Step 3 — Run Infrastructure Setup

Once credentials are configured, run the master setup script:

```bash
cd tailoredtunes-app/aws/scripts
./01_setup_infrastructure.sh
```

This creates:
- S3 bucket for frontend
- ECR repository for backend Docker image (with lifecycle policy: keep 10 tagged, expire untagged in 1 day)
- IAM role for App Runner → ECR access
- SSM Parameter Store namespace `/tailortunez/`

---

## Step 4 — Store Secrets in SSM

```bash
./02_store_secrets.sh
```

Prompts you for all API keys and stores them encrypted in AWS SSM.

---

## Step 5 — Deploy

```bash
# Deploy frontend (build + upload to S3 + invalidate CloudFront)
./deploy_frontend.sh

# Deploy backend (build Docker image + push to ECR + update App Runner)
./deploy_backend.sh

# Both at once
./deploy_all.sh
```

---

## Step 6 — Monitoring

```bash
./04_setup_monitoring.sh you@example.com
```

Creates:
- SNS topic for email alerts (confirm the subscription email)
- CloudWatch alarms: 5xx errors, 4xx spike, high latency (p99 > 5s), high CPU (>80%), high memory (>85%)
- CloudWatch dashboard "TailoredTunez" showing request count, status codes, latency, CPU/memory

Open the dashboard at any time:
```bash
cd tailoredtunes-app
./aws-manage.sh monitor
```

---

## Step 7 — Custom Domain (optional)

```bash
./03_setup_domain.sh tailoredtunes.com
```

Sets up Route 53 hosted zone + ACM certificate + CloudFront + App Runner custom domains.

---

## Day-to-day Management

All operations are available via the top-level `aws-manage.sh` script:

```bash
# From the tailoredtunes-app/ directory:
./aws-manage.sh status           # live health of all AWS resources
./aws-manage.sh logs             # tail App Runner application logs
./aws-manage.sh health           # curl /api/health
./aws-manage.sh deploy           # full redeploy (backend + frontend)
./aws-manage.sh deploy:backend   # backend only
./aws-manage.sh deploy:frontend  # frontend only
./aws-manage.sh rollback         # re-deploy previous backend image
./aws-manage.sh scale 1 2        # resize to 1 vCPU / 2 GB RAM
./aws-manage.sh monitor          # open CloudWatch dashboard
./aws-manage.sh secrets:list     # list all SSM keys
./aws-manage.sh secrets:get JWT_SECRET
./aws-manage.sh secrets:set STRIPE_SECRET_KEY
./aws-manage.sh invalidate       # force CloudFront cache clear
```
