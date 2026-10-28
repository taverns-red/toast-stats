# Storage and Artifact Registry cleanup (#2103, #2104)

Everything here is a **proposal**. Ron approves and runs every apply and every
delete. Nothing in CI applies these files. `scripts/lib/__tests__/infraCostPolicies.test.ts`
checks their shape.

Prices used below: GCS Standard at USD 0.026/GB-month (US multi-region,
staging) and USD 0.023 (northamerica-northeast1, ca); Artifact Registry at USD
0.10/GB-month; USD 1 = CAD 1.37. Taxes are not included.

## 1. GCS inventory (read-only, re-measured 2026-10-28)

Measured with `gcloud storage du -s gs://<bucket>/<prefix>/`, one call per
top-level prefix. Nothing was listed in full or copied. Sizes are in GB
(10^9 bytes). The first inventory (2026-10-16, PR #2109) is in git history.

| Prefix                   | staging (US)         | ca (northamerica-northeast1) | toast-stats-data (legacy, us-east1) |
| ------------------------ | -------------------- | ---------------------------- | ----------------------------------- |
| basemap/ (z0–10 + z0–14) | 72.54 (3.78 + 68.76) | 72.54 (3.78 + 68.76)         | n/a                                 |
| snapshots/               | 3.39                 | 3.39                         | **48.28**                           |
| raw-csv/                 | ~1.7 (est.)          | 0.78                         | ~1.6 (est.)                         |
| club-trends/             | 0.88                 | 0.87                         | 0.04                                |
| raw-fac/                 | 0.48                 | n/a                          | n/a                                 |
| runs/                    | 0.20                 | n/a                          | n/a                                 |
| raw-education-ledger/    | 0.18                 | n/a                          | n/a                                 |
| videos/                  | 0.10                 | 0.10                         | n/a                                 |
| club-race/               | 0.09                 | 0.06                         | n/a                                 |
| \_archive/               | 0.03                 | n/a                          | n/a                                 |
| config/, derived/, v1/   | 0.03                 | 0.02                         | under 0.01                          |
| time-series/, metrics/   | under 0.01           | under 0.01                   | under 0.01                          |

"est." marks a `du` that hadn't finished after 25 minutes. Those values are
the Monitoring live total minus the other prefixes. The same method gives
0.68 for ca raw-csv against a measured 0.78, so treat them as ±0.1.

Bytes by state, from Cloud Monitoring
`storage.googleapis.com/storage/v2/total_bytes` grouped by bucket and `type`
(daily mean, 2026-10-27 to 10-28):

| Bucket                              | live          | soft-deleted  | noncurrent |
| ----------------------------------- | ------------- | ------------- | ---------- |
| toast-stats-data-staging            | 74.12 GiB     | **34.23 GiB** | 0          |
| toast-stats-data-ca                 | 72.32 GiB     | 9.87 GiB      | 0          |
| toast-stats-data (legacy, us-east1) | **46.47 GiB** | 0             | 0          |

Since 10-16:

- The noncurrent 2.0 GiB in ca is gone; the 10-16 lifecycle rules work.
- Staging soft-deleted bytes rose from 19.80 to 34.23 GiB. That's the
  re-derive and backfill churn of 10-17 to 10-27, held for 30 days. None of it
  is basemap: `--soft-deleted` matches nothing under `basemap/`.
- The z0–14 basemap is in both buckets (two copies, by design; see §3).

**The legacy bucket `toast-stats-data` is the largest stale copy.** It holds
46.47 GiB (49.9 GB) of `snapshots/` and `raw-csv/` from before the move to
`toast-stats-data-ca` (#162). Its newest object
(`config/district-snapshot-index.json`) dates from 2026-03-15. No backend
bucket serves it: the CDN backends are `toast-stats-data-ca` and
`toast-stats-data-staging`. No code on main names it; the only mention is
an example in `packages/collector-cli/README.md`. It is not public, and its
IAM bindings are the project defaults plus one service account. See §2b.

### Estimated monthly savings (2026-10-28)

Each item needs Ron's approval and is independent of the others.

| Step                                             | Saving (CAD/month) |
| ------------------------------------------------ | ------------------ |
| §3: delete the z0–10 basemap (both buckets)      | 0.25               |
| §2a: soft delete from 30 days to 7 days          | about 1.25         |
| §2b: retire the legacy bucket `toast-stats-data` | 1.37               |
| §2: `_archive/` lifecycle rule                   | under 0.01         |
| **Total**                                        | **about 2.9**      |

The largest cost that remains is the two z0–14 copies, at about CAD 4.6/month.
Both are kept, because previews read the staging copy.

## 2. Lifecycle rules

### Applied on 10-16 (PR #2109)

Both buckets carry these today (`gcloud storage buckets describe`, 10-28):

- staging:
  - Delete `runs/` objects after 180 days, as a backstop to the 90-day prune
    (`RUN_MANIFEST_RETENTION_DAYS`, `scripts/expire-run-manifests.ts`).
  - Delete noncurrent generations 7 days after they become noncurrent.
  - Abort incomplete multipart uploads after 7 days.
- ca: the noncurrent and multipart rules only.

Rules only delete; none changes storage class. Ageing `runs/` (0.20 GB) to
Nearline would save under CAD 0.01/month. It would also cost Class A
transitions, a 30-day minimum and retrieval fees.

### Proposed on 10-28: delete staging `_archive/` after 30 days

`infra/gcs-lifecycle/toast-stats-data-staging.json` gains one rule:
`Delete` with `age: 30` and `matchesPrefix: ["_archive/"]`.
`_archive/pre-1384-backfill/` (26 MB) is a one-off copy taken before the
#1384 backfill in July. Nothing reads it.

The saving is under CAD 0.01/month; this is hygiene. The objects are older
than 30 days, so the first lifecycle pass after the apply removes them. They
stay restorable for the 30-day soft-delete window.

#### Prefixes left alone, because something reads them

Checked with `git grep` over `frontend/src`, `packages/*/src`, `scripts/` and
`.github/workflows/` on 2026-10-28:

- `snapshots/`, `v1/`, `time-series/` and `config/` are promoted to prod
  (`PROMOTED_PREFIXES`) and read by the frontend.
- `derived/` is read by the frontend (`cdn.ts`, the education rollup).
- `metrics/deploys/` holds the deploy records that `deploy.yml` writes. It's
  under 0.01 GB, so a rule would save nothing.
- `raw-csv/` is the rebuild source: `data-pipeline.yml` discovers rebuild dates
  from it. The ca copy (0.78 GB) is a cross-region copy of raw history,
  and prod-bucket scripts can still read it, so it's kept.
- `raw-fac/`, `raw-education-ledger/`, `club-trends/`, `club-race/` and
  `district-awards-history.json` are pipeline stores (sync, upsert, push back).
- `videos/` and `basemap/` are published and immutable.

`infraCostPolicies.test.ts` enforces this:

- A rule may age out live objects only under `runs/` or `_archive/`.
- No source file outside tests may name `_archive/`. The scan fails if it
  sees an empty tree.

#### Apply (Ron approves)

The command replaces the bucket's whole lifecycle config. The file holds
the three applied rules plus the new one.

```bash
gcloud storage buckets describe gs://toast-stats-data-staging --format="json(lifecycle_config)"
gcloud storage buckets update gs://toast-stats-data-staging --lifecycle-file=infra/gcs-lifecycle/toast-stats-data-staging.json
gcloud storage buckets describe gs://toast-stats-data-staging --format="json(lifecycle_config)"   # expect 4 rules
```

The ca file is unchanged, so it needs no re-apply. To undo, re-apply the file
from PR #2109 (`git show 1098a5853:infra/gcs-lifecycle/toast-stats-data-staging.json`).
`--clear-lifecycle` would drop all rules.

### 2a. Shorten soft delete to 7 days (separate decision)

This is the larger lever in the data buckets. The soft-deleted bytes are:

- staging: 34.23 GiB (36.8 GB), USD 0.96/month;
- ca: 9.87 GiB (10.6 GB), USD 0.24/month.

That's about CAD 1.64/month in total. In steady state, the soft-deleted bytes
scale with the retention window, so 7 days would keep about 7/30 of them.
That saves about **CAD 1.25/month**.

The cost is the restore window: an object a re-derive deletes by mistake can
be restored for 7 days instead of 30. The #1759 batches that set 30 days are
done, but backfills and re-derives were still running on 10-22 and 10-27. Pick
a quiet week.

```bash
gcloud storage buckets update gs://toast-stats-data-staging --soft-delete-duration=7d
gcloud storage buckets update gs://toast-stats-data-ca --soft-delete-duration=7d
```

Objects that are already soft-deleted keep the retention they had when they
were deleted, so the saving builds up over the next 30 days.

### 2b. Retire the legacy bucket `toast-stats-data` (separate decision)

It holds 49.9 GB at USD 0.020/GB-month (us-east1 Standard), about USD
1.00/month or **CAD 1.37/month**. That's the largest stale cost outside the
basemap. A lifecycle rule is the wrong tool here: the whole bucket goes, so
there's no JSON file for it.

Read-only checks first:

```bash
gcloud compute backend-buckets list --project toast-stats-prod-6d64a --format="table(name,bucketName)"   # must not list toast-stats-data
git grep -nE "toast-stats-data([^-a-z]|$)" origin/main -- ':!tasks/' ':!*.md'                          # expect no match
gcloud storage buckets get-iam-policy gs://toast-stats-data                                            # no allUsers
```

GCS Data Access logs are off (the project's `auditConfigs` covers only
Artifact Registry), so the absence of reads can't be shown from logs. The
evidence is the absence of any reader, plus the newest write on 03-15.

Delete (Ron approves). The bucket has 7-day soft delete, so its objects can be
restored with `gcloud storage restore` for 7 days:

```bash
gcloud storage rm --recursive "gs://toast-stats-data/**"
# after 7 days with no complaint:
gcloud storage buckets delete gs://toast-stats-data
```

## 3. Delete the old z0–10 basemap (on or after 2026-10-23)

The object is `basemap/protomaps-v4/world-z0-10-20261011.pmtiles`, 3,782,079,721
bytes, in both buckets. The z0–14 switch (#2089, commit `3c01be5d`) is in
`frontend-v3.40.0`. Basemap runbook §5 says to wait one week after the switch
reaches prod.

Checks to run before deleting. All of them are read-only.

```bash
# 1. No source file references the old object. Only the build-date examples in
#    docs/runbooks/basemap.md and scripts/basemap/build-basemap.sh may match.
git grep -n "world-z0-10" origin/main -- ':!tasks/'
git grep -n "BASEMAP_OBJECT_PATH" origin/main -- frontend/src/config/basemap.ts
# 2. The prod bundle names z0-14 (run against the deployed site)
curl -s https://ts.taverns.red/ | grep -o 'assets/[^"]*\.js' | head -1
# 3. Nothing has read z0-10 in the last 7 days (CDN logs filtered on the object path)
gcloud logging read 'resource.type="http_load_balancer" AND httpRequest.requestUrl:"world-z0-10-20261011"' \
  --project toast-stats-prod-6d64a --freshness=7d --limit 5 --format="value(timestamp,httpRequest.requestUrl)"
```

On 2026-10-16, `git grep "world-z0-10"` on origin/main (excluding `tasks/`)
matched only basemap docs and comments: `basemap-build.yml:101` (a timing
comment), `docs/runbooks/basemap.md:166` (this delete instruction) and the
build-script usage comments. `BASEMAP_OBJECT_PATH` is
`world-z0-14-20261015.pmtiles`, and no code path builds the z0–10 name.

**Re-check, 2026-10-28** (read-only):

- **Logs.** The `http_load_balancer` logs show 7 requests for
  `cdn.taverns.red/basemap/protomaps-v4/world-z0-10-20261011.pmtiles` from
  2026-10-19T12:26:00Z onward. All 7 fall between 12:26:47.96Z and
  12:26:48.28Z on 10-19, all with status 206. The last one is at
  **2026-10-19T12:26:48.280Z**. Six came from one desktop Chrome 152 (macOS)
  session, which had a cached pre-switch bundle; one was a Cloud CDN origin
  fill (`Cloud-CDN-Google`). There have been **0 requests since**, which is
  more than 9 days.
- **The log query is live.** The same query for z0–14 returns requests on
  10-28.
- **Daily counts for z0–10.** 1,182 on 10-15, 805 on 10-16, 2 on 10-17, 2 on
  10-18, 9 on 10-19, then none.
- **The prod bundle.** `BasemapMap-*.js`, lazy-loaded from
  `index-CIttt426.js`, names only `world-z0-14-20261015`.
- **The source.** `git grep world-z0-10` still matches only the docs listed
  above.
- **Staging reads aren't logged.** The `toast-stats-cdn-staging-backend`
  backend logged no requests in the last 3 days, and GCS Data Access logs are
  off. Preview builds take the object name from the same
  `BASEMAP_OBJECT_PATH`, so they read z0–14.

Exact objects (from `gcloud storage ls -l gs://<bucket>/basemap/**`):

| Bucket                   | Object                                              | Bytes          |
| ------------------------ | --------------------------------------------------- | -------------- |
| toast-stats-data-staging | `basemap/protomaps-v4/world-z0-10-20261011.pmtiles` | 3,782,079,721  |
| toast-stats-data-staging | `basemap/protomaps-v4/world-z0-14-20261015.pmtiles` | 68,759,126,401 |
| toast-stats-data-ca      | `basemap/protomaps-v4/world-z0-10-20261011.pmtiles` | 3,782,079,721  |
| toast-stats-data-ca      | `basemap/protomaps-v4/world-z0-14-20261015.pmtiles` | 68,759,126,401 |

**Delete. Ron approves; on or after 2026-10-23. The checks above passed on
10-28.**

```bash
gcloud storage rm gs://toast-stats-data-staging/basemap/protomaps-v4/world-z0-10-20261011.pmtiles
gcloud storage rm gs://toast-stats-data-ca/basemap/protomaps-v4/world-z0-10-20261011.pmtiles
```

This saves about CAD 0.25/month (3.78 GB in each bucket at USD 0.026 and
0.023). Billing for the objects stops only after the
30-day soft-delete window, and they can be restored during it
(`gcloud storage restore`).

**Keep the staging copy of z0–14** (64 GiB, CAD ~2.3/month). The billing
analysis listed dropping it as a possible saving, but PR previews read the
basemap from the staging base (`frontend/src/config/basemap.ts`). Deleting it
breaks the basemap on every preview and its smoke spec.

## 4. Artifact Registry (project toast-stats-prod-6d64a), read-only inventory

| Repo (location)                    | Size    | Versions (tagged / untagged)                                                                        | Live Cloud Run use                                                                                                           |
| ---------------------------------- | ------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| red-vote (na-ne1)                  | 53.5 GB | 1,741 (1,723 / 18); tags `pr-N-<sha>` ×1,215, `<sha>` ×426, `red-vote-vX` ×137, `staging-<sha>` ×82 | `red-vote` serves `app@b952a710…` (`red-vote-v0.3.94`, `latest`); `red-vote-pr` tag `pr-2441` → `app@02f68d1a…` (2026-09-27) |
| speech-evaluator (na-ne1)          | 41.2 GB | 81 (81 / 0)                                                                                         | `speech-evaluator` serves `app@87c5e507…`                                                                                    |
| cloud-run-source-deploy (us-east1) | 5.4 GB  | 135 (3 / 132), mostly `toast-stats-api`                                                             | none (all services pull from na-ne1)                                                                                         |
| speech-evaluator (us-east1)        | 2.6 GB  | 5 (4 / 1)                                                                                           | none                                                                                                                         |
| red-club (na-ne1)                  | 1.9 GB  | 35 (30 / 5)                                                                                         | `red-club` serves `server@443d8e93…`                                                                                         |
| cloud-run-source-deploy (na-ne1)   | 1.7 GB  | 32 (7 / 25); `toast-stats-api` 23, `stratosphere-relay` 5                                           | `toast-stats-api@d993d31d…`, `stratosphere-relay@11020273…`                                                                  |
| gcf-artifacts (us-east1)           | 0       | 0                                                                                                   | none (no policy proposed)                                                                                                    |

No repo has a cleanup policy.

## 5. Proposed cleanup policies

Files: `infra/artifact-registry/<location>--<repo>.json`, in the
`set-cleanup-policies --policy` format. Keep beats Delete.

The enum values are the API names: `KEEP`/`DELETE` and
`TAGGED`/`UNTAGGED`/`ANY`. The docs' mixed case (`Delete`, `tagged`) does not
map onto the API enums. gcloud 583's `ParseCleanupPolicy` →
`PyValueToMessage` matches case-sensitively, so mixed case reaches the API as
unrecognized enum strings, while the API names map cleanly. This was checked
offline by running the SDK's own parser on each file. The GCS lifecycle files
were checked the same way, through `metadata_field_converters.process_lifecycle`.
There, `action.type` is a plain string, and `Delete` is correct.

Every file has:

- `keep-most-recent`: `mostRecentVersions.keepCount`. This is 20 for red-vote,
  10 for red-club and na-ne1 speech-evaluator, 5 for na-ne1
  cloud-run-source-deploy and 2 for the unused us-east1 repos.
- `keep-deployed`: keeps any version with a tag starting `deployed-`. This is
  how a deployed digest is protected. AR cannot see Cloud Run, so the digest
  must be tagged; see step 0 below.
- `keep-release-tags`: `red-vote-v` for red-vote and `v` for red-club, with
  no age limit.
- `keep-env-tags`: `latest` and `staging`, newer than 90 days.
- `delete-untagged`: untagged versions older than 7 days.
- `delete-pr-previews` (red-vote only): `pr-` tags older than 14 days.
- `delete-stale`: any version older than 30 days.

A simulation of these rules against the 2026-10-16 listings deletes about 1,940
of 2,029 versions. It frees an estimated 93 GB (**about CAD 12.7/month**):
red-vote 48 GB, speech-evaluator 36 GB, us-east1 cloud-run-source-deploy 5.3 GB,
the rest about 3.8 GB. The bytes are estimated from per-image sizes because
layers are shared, so the dry run is the real measure. The simulation keeps
every serving digest except red-vote-pr's `pr-2441` (open PR, image from
2026-09-27), which step 0 protects. It drops older non-serving revisions, so
Cloud Run rollback is limited to the versions that are kept.

**Step 0. Tag the deployed digests** (an AR write; Ron approves):

```bash
R=northamerica-northeast1-docker.pkg.dev/toast-stats-prod-6d64a
gcloud artifacts docker tags add $R/red-vote/app@sha256:b952a710fe7c6ee8cdc614ed32f95a23fed751c221478c5cfd8cf13ed082e8f4 $R/red-vote/app:deployed-red-vote
gcloud artifacts docker tags add $R/red-vote/app@sha256:02f68d1a90d6d79d2c213aea5ab40d5cbf24b2dbf4b24d63e7f1e5bdd27d9ee6 $R/red-vote/app:deployed-red-vote-pr-2441
gcloud artifacts docker tags add $R/red-club/server@sha256:443d8e935cb917e3676df6e6b73867de3b5836020302a5a074db4803a59a2eec $R/red-club/server:deployed-red-club
gcloud artifacts docker tags add $R/speech-evaluator/app@sha256:87c5e507fbc1d86a6d9ae07f7c0c7dec42363eb9b3bec0acfcc5c3eb1d8c6005 $R/speech-evaluator/app:deployed-speech-evaluator
gcloud artifacts docker tags add $R/cloud-run-source-deploy/toast-stats-api@sha256:d993d31d9720a803ae356be8081d9a3120f1777590fc47e267f55b7efc2f1140 $R/cloud-run-source-deploy/toast-stats-api:deployed-toast-stats-api
gcloud artifacts docker tags add $R/cloud-run-source-deploy/stratosphere-relay@sha256:110202730562c62d132c16a4fd4682b3bf7a9ba068c3eed18af4bd3c835f04a1 $R/cloud-run-source-deploy/stratosphere-relay:deployed-stratosphere-relay
```

Re-read the serving digests first, because they change with every deploy:

```bash
gcloud run services list --project toast-stats-prod-6d64a
gcloud run revisions describe <rev> --region <region> --project toast-stats-prod-6d64a --format="value(status.imageDigest)"
```

To protect deployed digests durably, each product's deploy workflow should
move its `deployed-<service>` tag. That is a change for each repo session;
see the ops heads-up.

**Step 1. Prerequisite for reading dry-run results.** The dry-run log entries
appear only if Data Access audit logs (DATA_WRITE) are enabled for
`artifactregistry.googleapis.com`. That is a project IAM-policy change, so Ron
approves it. Without it, the dry run deletes nothing but produces no report.

**Step 2. Dry run** (Ron approves; deletes nothing):

```bash
P=toast-stats-prod-6d64a; D=infra/artifact-registry
for f in $D/*.json; do b=$(basename "$f" .json); loc=${b%%--*}; repo=${b#*--}
  gcloud artifacts repositories set-cleanup-policies "$repo" --project=$P --location="$loc" --policy="$f" --dry-run
done
```

Wait at least a day; policies run as a periodic background job. Then read
what would have been deleted, and check that no `deployed-*` digest is listed:

```bash
gcloud logging read 'protoPayload.serviceName="artifactregistry.googleapis.com" AND protoPayload.methodName:"BatchDeleteVersions" AND protoPayload.request.validateOnly=true' \
  --project toast-stats-prod-6d64a --freshness=2d --format=json > /tmp/ar-dry-run.json
```

**Step 3. Enforce** (Ron approves, after reviewing the dry run). Run the same
loop with `--no-dry-run` in place of `--dry-run`.

To undo: `gcloud artifacts repositories delete-cleanup-policies <repo> --location=<loc> --policynames=<name>`,
or re-run with `--dry-run`. Versions that have already been deleted cannot be
recovered.

`set-cleanup-policies --help` shows only `--dry-run`; `--no-dry-run` comes from
the cleanup-policy docs. In the SDK, `dry-run` is a declarative `type: bool`
flag with `default: null` (`surface/artifacts/repositories/set_cleanup_policies.yaml`).
Before enforcing, confirm that the flag parses with
`gcloud artifacts repositories describe <repo> --location=<loc> --format="value(cleanupPolicyDryRun)"`
after the dry run (expect `True`), and again after the `--no-dry-run` run
(expect empty or `False`).

The two unused us-east1 repos (`speech-evaluator`, `cloud-run-source-deploy`)
are candidates for deleting outright. That decision belongs to the
speech-evaluator owner; it is noted in the ops heads-up.
