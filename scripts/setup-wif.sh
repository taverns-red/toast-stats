#!/usr/bin/env bash
# =============================================================================
# Workload Identity Federation Setup for GitHub Actions → GCP
# =============================================================================
#
# Run this script ONCE to configure keyless authentication from GitHub Actions
# to your GCP project. After running, add the output values as GitHub secrets.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Owner or Editor role on the GCP project
#
# Usage:
#   chmod +x scripts/setup-wif.sh
#   ./scripts/setup-wif.sh
#   PROJECT_ID=<new-project> ./scripts/setup-wif.sh   # rebuilt environment
#
# Run scripts/setup-hosting-sites.sh BEFORE this on a new project: Firebase no
# longer creates a default Hosting site (2026-10-15). Full order of a rebuild:
# docs/runbooks/new-environment.md (#1584).
# =============================================================================

set -euo pipefail

# Configuration — override via env for a new project/repo. Defaults match the
# live deployer for this repo (toast-stats-deployer, taverns-red/toast-stats).
PROJECT_ID="${PROJECT_ID:-toast-stats-prod-6d64a}"
GITHUB_REPO="${GITHUB_REPO:-taverns-red/toast-stats}"
REGION="us-east1"
POOL_NAME="github-actions-pool"
PROVIDER_NAME="github-provider"
SA_NAME="${SA_NAME:-toast-stats-deployer}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "============================================"
echo " Workload Identity Federation Setup"
echo "============================================"
echo ""
echo "Project:  ${PROJECT_ID}"
echo "Repo:     ${GITHUB_REPO}"
echo "Region:   ${REGION}"
echo ""

# Step 1: Set project
echo "→ Setting active project..."
gcloud config set project "${PROJECT_ID}"

# Step 2: Enable required APIs
echo "→ Enabling required APIs..."
gcloud services enable \
  iamcredentials.googleapis.com \
  iam.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firebasehosting.googleapis.com \
  artifactregistry.googleapis.com \
  apigateway.googleapis.com \
  servicemanagement.googleapis.com \
  servicecontrol.googleapis.com

# Step 3: Create Workload Identity Pool
echo "→ Creating Workload Identity Pool..."
gcloud iam workload-identity-pools create "${POOL_NAME}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --description="WIF pool for GitHub Actions CI/CD" \
  2>/dev/null || echo "  (pool already exists, skipping)"

# Step 4: Create WIF Provider
echo "→ Creating WIF Provider..."
gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_NAME}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_NAME}" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${GITHUB_REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  2>/dev/null || echo "  (provider already exists, skipping)"

# Step 5: Create service account
echo "→ Creating service account..."
if gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "  (service account already exists, skipping)"
else
  gcloud iam service-accounts create "${SA_NAME}" \
    --project="${PROJECT_ID}" \
    --display-name="GitHub Actions Deployer" \
    --description="Service account for GitHub Actions deployments"
  # Wait for propagation
  echo "  Waiting for service account to propagate..."
  sleep 10
fi

# Step 6: Grant roles to service account
echo "→ Granting IAM roles..."
ROLES=(
  "roles/run.admin"
  "roles/iam.serviceAccountUser"
  "roles/storage.admin"
  "roles/firebasehosting.admin"
  "roles/cloudbuild.builds.builder"
  "roles/artifactregistry.writer"
  "roles/apigateway.admin"
  "roles/servicemanagement.admin"
  "roles/serviceusage.serviceUsageConsumer"
)

for ROLE in "${ROLES[@]}"; do
  echo "  Granting ${ROLE}..."
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}" \
    --quiet >/dev/null
done

# Step 7: Allow GitHub Actions to impersonate the service account
echo "→ Binding WIF to service account..."
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
POOL_ID="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}"

gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${GITHUB_REPO}" \
  --quiet >/dev/null

# Get the full provider resource name
WIF_PROVIDER="${POOL_ID}/providers/${PROVIDER_NAME}"

echo ""
echo "============================================"
echo " ✅ Setup Complete!"
echo "============================================"
echo ""
echo "Add these as GitHub repository secrets"
echo "(Settings → Secrets and variables → Actions):"
echo ""
echo "  GCP_PROJECT_ID = ${PROJECT_ID}"
echo "  GCP_WORKLOAD_IDENTITY_PROVIDER = ${WIF_PROVIDER}"
echo "  GCP_SERVICE_ACCOUNT = ${SA_EMAIL}"
echo ""
echo "After adding secrets, push to main to trigger deployment."
echo ""
