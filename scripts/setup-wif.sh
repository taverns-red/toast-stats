#!/usr/bin/env bash
# =============================================================================
# Workload Identity Federation Setup for GitHub Actions → GCP
# =============================================================================
#
# Run this script ONCE to create the Workload Identity pool and GitHub provider
# for keyless authentication from GitHub Actions to your GCP project. It
# creates no service account and grants no role (#3025): every job has its own
# identity (scripts/lib/gcpIdentityMap.ts), set up per
# docs/runbooks/new-environment.md. After running, add the output values as
# GitHub secrets.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Owner or Editor role on the GCP project
#
# Usage:
#   chmod +x scripts/setup-wif.sh
#   ./scripts/setup-wif.sh
#   PROJECT_ID=<project> ./scripts/setup-wif.sh   # PROJECT_ID is required
#
# Run scripts/setup-hosting-sites.sh BEFORE this on a new project: Firebase no
# longer creates a default Hosting site (2026-10-15). Full order of a rebuild:
# docs/runbooks/new-environment.md (#1584).
# =============================================================================

set -euo pipefail

# Configuration. PROJECT_ID has no default, so a run never lands on production
# by accident. GITHUB_REPO can be overridden for a different repo.
PROJECT_ID="${PROJECT_ID:?set PROJECT_ID to the target GCP project}"
GITHUB_REPO="${GITHUB_REPO:-taverns-red/toast-stats}"
REGION="us-east1"
POOL_NAME="github-actions-pool"
PROVIDER_NAME="github-provider"

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

# Look up the pool resource name for the provider value printed below.
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
POOL_ID="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}"

# Get the full provider resource name
WIF_PROVIDER="${POOL_ID}/providers/${PROVIDER_NAME}"

echo ""
echo "============================================"
echo " ✅ Setup Complete!"
echo "============================================"
echo ""
echo "Pool and provider are ready. Add these as GitHub repository secrets"
echo "(Settings → Secrets and variables → Actions):"
echo ""
echo "  GCP_PROJECT_ID = ${PROJECT_ID}"
echo "  GCP_WORKLOAD_IDENTITY_PROVIDER = ${WIF_PROVIDER}"
echo ""
echo "This script creates no service account and grants no role. Set each"
echo "per-job identity as a repository variable (GCP_DATA_READER_SA,"
echo "GCP_PREVIEW_SA, GCP_PIPELINE_SA, GCP_RESTORE_SA, GCP_MEDIA_SA,"
echo "GCP_HOSTING_DEPLOY_SA). See docs/runbooks/new-environment.md, step 6."
echo ""
