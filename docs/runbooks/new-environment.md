# Runbook — New or Rebuilt Environment (#1584)

Use this when the Firebase/GCP project behind toast-stats has to be created
from scratch: a DR rebuild, a separate staging project, or a fork. Today's
environment (`toast-stats-prod-6d64a`) already has everything below, so none of
this is needed for day-to-day deploys.

**Why this exists:** from **2026-10-15**, Firebase no longer creates a default
Hosting site when a project is created or when Firebase is added to a GCP
project. A `firebase deploy` into a project without its site fails with
`404 Site Not Found`. Site creation used to happen implicitly, and
`staging-toast-stats` was created by hand. It is now an explicit step (3).

> **Shared project caveat.** `toast-stats-prod-6d64a` also hosts other Red
> Taverns sites (`red-club-prod`, `taverns-red-portal`) and other products'
> service accounts. Rebuilding _that_ project is a multi-product event; this
> runbook covers only what toast-stats needs.

CLI commands were checked against firebase-tools 15.19.0 (`firebase help
<command>` and its source), `gcloud` and `gh` help output.

## Order

### 1. Project

```bash
export PROJECT_ID=<new-project-id>
gcloud projects create "$PROJECT_ID"
gcloud billing projects link "$PROJECT_ID" --billing-account=<ACCOUNT_ID>
firebase projects:addfirebase "$PROJECT_ID"
```

### 2. APIs

`setup-wif.sh` enables its own API list (step 4), but Hosting must be on
before sites can be created:

```bash
gcloud services enable firebasehosting.googleapis.com --project="$PROJECT_ID"
```

### 3. Hosting sites and deploy targets

```bash
# Preview first; changes nothing.
scripts/setup-hosting-sites.sh --project "$PROJECT_ID" \
  --site production=<prod-site-id> \
  --site staging=<staging-site-id> \
  --dry-run

# Then for real (idempotent: re-running is a no-op).
scripts/setup-hosting-sites.sh --project "$PROJECT_ID" \
  --site production=<prod-site-id> \
  --site staging=<staging-site-id>
```

- Site ids are **globally unique** across Firebase, so a new project cannot
  reuse `toast-stats-prod-6d64a` or `staging-toast-stats`. By convention the
  production site id is the project id. If that subdomain is taken, choose
  another and check it with `firebase hosting:sites:list --project "$PROJECT_ID"`.
- The script creates only sites whose lookup returns `could not find site`.
  Any other error (auth, permissions, wrong project) aborts without creating
  anything.
- For a new project it runs `firebase target:apply`, which writes a
  `targets.<project>` block into `.firebaserc`. **Commit that change.** To make
  the new project the default, also update `projects.default`.
- On the existing project, `scripts/setup-hosting-sites.sh --dry-run` with no
  arguments verifies that both sites and both targets are present.

### 4. Workload Identity Federation

```bash
PROJECT_ID="$PROJECT_ID" scripts/setup-wif.sh
```

The defaults (`GITHUB_REPO=taverns-red/toast-stats`,
`SA_NAME=toast-stats-deployer`) match the live deployer. The live provider in
`toast-stats-prod-6d64a` is shared with other Red Taverns repos and uses the
condition `assertion.repository_owner=='taverns-red'`. The script's
per-repository condition is stricter, which is fine for a single-repo project.

### 5. Data buckets

ADR-002 Phase 1 covers the staging and production GCS buckets
(`toast-stats-data-staging`, `toast-stats-data-ca`). Seeding and CORS are in
ADR-002 and ADR-003. For pipeline backfill, see
[`pipeline-rerun-2017-to-now.md`](pipeline-rerun-2017-to-now.md).

### 6. GitHub secrets

Use the values that `setup-wif.sh` prints:

```bash
gh secret set GCP_PROJECT_ID --repo taverns-red/toast-stats --body "$PROJECT_ID"
gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER --repo taverns-red/toast-stats --body "<provider resource name>"
gh secret set GCP_SERVICE_ACCOUNT --repo taverns-red/toast-stats --body "<sa email>"
```

### 7. First deploy

```bash
gh workflow run deploy.yml --repo taverns-red/toast-stats
```

Open a frontend PR to exercise `pr-preview.yml` against the `staging` site.
Both workflows first run `scripts/check-hosting-site.sh <target>` (#1585). If
the site or its `.firebaserc` mapping is missing, they fail fast with an
`::error::` that points back to step 3. To run the same check locally:
`PROJECT="$PROJECT_ID" scripts/check-hosting-site.sh production`.
