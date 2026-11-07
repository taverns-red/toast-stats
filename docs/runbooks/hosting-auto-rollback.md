# Runbook — Hosting auto-rollback (#2492)

A production Firebase Hosting release that breaks the core path is put back
to the previous release by `deploy.yml` itself, on the CI identity, with no
agent or human action. This runbook covers how that works, how to turn it
off, how to roll back by hand, and the staging drill.

The data half (restoring `toast-stats-data-ca` objects after a bad publish)
is separate and not covered here.

## How it works

`deploy.yml` → job `deploy-frontend`, in this order (pinned by
`scripts/lib/__tests__/hostingRollbackWorkflow.test.ts`):

1. **Install Chromium** for the smoke, before anything is released. If the
   install fails, nothing is deployed.
2. **Record the live Hosting version** —
   `scripts/hosting-release.ts record production` reads the version the
   live channel serves now (`firebase hosting:channel:list --json`, the
   live channel's `release.version.name`) into `steps.record.outputs.version`.
3. **Build and deploy production** — unchanged `firebase deploy --only
hosting:production`.
4. **Smoke the new release** — `scripts/hosting-smoke.ts`, every 30 s for
   600 s:
   - home `https://ts.taverns.red/` is 200 and loads the **new build's**
     entry asset (read from `frontend/dist/index.html`), and that asset is
     200 JavaScript (not an HTML fallback);
   - `/district/61` is 200 with the same SPA shell, and **renders** in
     Chromium: an `h1`, no error page, no uncaught page error;
   - `https://cdn.taverns.red/v1/latest.json` parses with a
     `latestSnapshotDate`.

   Three failed attempts in a row fail the smoke at once (about 1.5 min);
   one or two transient failures are tolerated. A smoke that crashes
   counts as failed.

5. On a failed smoke, **roll back to the recorded version** —
   `scripts/hosting-release.ts rollback production` runs

   ```bash
   firebase hosting:clone <site>@<previous-version> <site>:live
   ```

   then re-reads the live channel to confirm it serves that version.

6. **Smoke the restored release** — the same smoke for 120 s, with no
   expected entry asset.
7. **File or update a `hosting-rollback` issue** (one open at a time; later
   failures comment on it) with the versions, the failing checks and the
   timings: deployed, smoke failed, rollback started, rollback released,
   restored smoke finished.
8. **Fail the job** with an `::error::`. DORA metrics are recorded only
   after a healthy smoke.

All decisions live in `scripts/lib/hostingRollback.ts`, unit-tested in
`scripts/lib/__tests__/hostingRollback.test.ts`.

What the issue's outcome line means:

| Outcome                | Meaning                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `restored`             | Previous version is live again and passed its smoke. Fix forward at leisure.                                |
| `restore-failed-smoke` | Rolled back, but the old release also fails. Likely not the app: check `cdn.taverns.red` and the data path. |
| `rollback-error`       | The clone or its check failed. **The bad release may still be live.** Roll back by hand.                    |
| `skipped-override`     | The override was on, so nothing was rolled back.                                                            |
| `no-previous-version`  | Nothing was recorded (first deploy), or the deploy did not change the live version.                         |

### The mechanism, from the docs

- [Manage live & preview channels, releases, and versions](https://firebase.google.com/docs/hosting/manage-hosting-resources):
  "By rolling back, you create a new release that serves the same version
  of content as a previous release." The CLI table lists
  `firebase hosting:clone SOURCE_SITE_ID@VERSION_ID TARGET_SITE_ID:TARGET_CHANNEL_ID`,
  and cloning within one site "creates a new release object that points to
  the exact same version".
- [`sites.channels.releases.create`](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.channels.releases/create):
  `POST …/sites/SITE/channels/live/releases?versionName=sites/SITE/versions/VERSION`
  — the call `hosting:clone` makes here, and the same call
  `firebase deploy` makes to release.
- Permissions: the CI service account has `roles/firebasehosting.admin`
  (`scripts/setup-wif.sh`), which grants `firebasehosting.*`
  ([IAM reference](https://docs.cloud.google.com/iam/docs/roles-permissions/firebasehosting)).
  No new IAM or secrets.
- Retention: a version can only be restored while Hosting retains it
  (Hosting settings → release storage). The previous release is the newest
  retained one, so the default retention is enough.

## How to override it

The rollback is skipped (the issue is still filed and the job still fails)
when either is set:

- **One run:** dispatch Deploy with `skip_auto_rollback: true` (Actions →
  Deploy → Run workflow).
- **Every run until cleared:** set the repository variable
  `HOSTING_AUTO_ROLLBACK=off` (Settings → Secrets and variables → Actions →
  Variables). Delete it, or set it to anything else, to turn the rollback
  back on.

Use it when a release is expected to fail the smoke on purpose, for
example a deliberate change to `/district/61` or to the entry asset layout,
or when the smoke itself is wrong. Fix the smoke in the same PR rather than
leaving the override on.

## How to roll back by hand

Firebase console: Hosting → the site → Release history → the previous
release's ⋮ menu → **Roll back**.

CLI, with an identity that has Firebase Hosting Admin:

```bash
PROJECT=toast-stats-prod-6d64a
SITE=toast-stats-prod-6d64a        # .firebaserc targets.<project>.hosting.production
# Take the version id to restore from the console's Release history
# (the run's hosting-rollback issue also names it). What is live now:
firebase hosting:channel:list --site "$SITE" --project "$PROJECT" --json \
  | jq -r '.result.channels[] | select(.name | endswith("/channels/live")) | .release.version.name'
firebase hosting:clone "$SITE@<VERSION_ID>" "$SITE:live" --project "$PROJECT"
```

Or the same runner CI uses:

```bash
PROJECT=toast-stats-prod-6d64a PREVIOUS_VERSION=<VERSION_ID> \
  npx tsx scripts/hosting-release.ts rollback production
```

Then confirm with the smoke:

```bash
SMOKE_WINDOW_SECONDS=60 npx tsx scripts/hosting-smoke.ts
```

After a rollback, the next `firebase deploy` releases normally; nothing has
to be undone.

## Staging drill (design — not yet run)

Goal: watch a deliberately broken release get rolled back on the `staging`
Hosting site (`staging-toast-stats`, `https://staging-toast-stats.web.app`),
with the same runners CI uses, and record the timings. Prod is not touched.
It runs from Ron's local session, authenticated to the project
(`gcloud auth application-default login`, or impersonating the CI service
account).

```bash
export PROJECT=toast-stats-prod-6d64a
export BASE_URL=https://staging-toast-stats.web.app
export CDN_BASE_URL=https://cdn.taverns.red
OUT=$(mktemp); export GITHUB_OUTPUT=$OUT   # the runners write outputs here

# 0. The staging live channel needs a good release to fall back to.
#    If step 1 records nothing, first deploy a good build:
#    npm run build:frontend && firebase deploy --only hosting:staging --project "$PROJECT"

# 1. Record the good version.
npx tsx scripts/hosting-release.ts record staging
PREV=$(grep '^version=' "$OUT" | tail -1 | cut -d= -f2)

# 2. Build, then break the entry bundle so the page throws on load.
npm run build:frontend
ENTRY=$(grep -o '/assets/index-[^"]*\.js' frontend/dist/index.html | head -1)
echo "throw new Error('rollback drill #2492')" > "frontend/dist$ENTRY"
firebase deploy --only hosting:staging --project "$PROJECT"
date -u +%FT%TZ   # deployed at

# 3. Smoke it: expect district-render to fail 3 times and healthy=false.
EXPECTED_INDEX_HTML=frontend/dist/index.html npx tsx scripts/hosting-smoke.ts
grep -E '^(healthy|finished_at)=' "$OUT"

# 4. Roll back, then smoke the restored release (expect healthy=true).
PREVIOUS_VERSION=$PREV npx tsx scripts/hosting-release.ts rollback staging
SMOKE_WINDOW_SECONDS=120 npx tsx scripts/hosting-smoke.ts
grep -E '^(rolled_back|started_at|finished_at|healthy)=' "$OUT"

# 5. Clean the broken build out of the working tree.
rm -rf frontend/dist
```

Record in the issue: deployed at → smoke failed at → rollback started /
released → restored smoke healthy at, plus the two version ids.

To drill the **workflow** itself rather than the runners, a follow-up could
add a `hosting_target` dispatch input to `deploy.yml`; it was left out so the
production workflow gains no staging path.

Locally, without `npx playwright install`, point the render probe at an
installed Chromium with `SMOKE_CHROMIUM_PATH=/path/to/chrome`, or skip it
with `SMOKE_RENDER=off` (then step 3 needs a different break, e.g. delete
`frontend/dist$ENTRY` so the entry asset 404s).
