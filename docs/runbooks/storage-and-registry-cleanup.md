# Storage and Artifact Registry cleanup (#2103, #2104)

Everything here is a **proposal**. Ron approves and runs every apply and every
delete. Nothing in CI applies these files. `scripts/lib/__tests__/infraCostPolicies.test.ts`
checks their shape.

Prices used below: GCS Standard at USD 0.026/GB-month (US multi-region,
staging) and USD 0.023 (northamerica-northeast1, ca); Artifact Registry at USD
0.10/GB-month; USD 1 = CAD 1.37. Taxes are not included.

## 1. GCS inventory (read-only, 2026-10-16)

Measured with `gcloud storage du -s gs://<bucket>/<prefix>/`. Sizes are in GB
(10^9 bytes).

| Prefix                      | staging (US)                                                                             | ca (northamerica-northeast1) |
| --------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------- |
| basemap/ (z0–10 + z0–14)    | 72.54 (3.78 + 68.76)                                                                     | 72.54 (3.78 + 68.76)         |
| snapshots/                  | 3.33                                                                                     | 3.34                         |
| club-trends/                | 1.12                                                                                     | 0.87                         |
| raw-csv/                    | ~1.9 (estimated: Monitoring live total minus the other prefixes; `du` was still running) | 0.78                         |
| raw-education-ledger/       | 0.18                                                                                     | n/a                          |
| raw-fac/                    | 0.14                                                                                     | n/a                          |
| runs/                       | 0.10                                                                                     | n/a                          |
| club-race/                  | 0.07                                                                                     | 0.06                         |
| \_archive/                  | 0.03                                                                                     | n/a                          |
| derived/                    | 0.01                                                                                     | n/a                          |
| config/                     | 0.01                                                                                     | 0.01                         |
| time-series/, v1/, metrics/ | under 0.01                                                                               | under 0.01                   |

Bytes that `du` does not show, from Cloud Monitoring
`storage.googleapis.com/storage/v2/total_bytes` grouped by `type` (2026-10-15):

| Bucket                              | live      | soft-deleted  | noncurrent |
| ----------------------------------- | --------- | ------------- | ---------- |
| toast-stats-data-staging            | 9.93 GiB  | **19.80 GiB** | 0          |
| toast-stats-data-ca                 | 8.46 GiB  | **8.16 GiB**  | 2.00 GiB   |
| toast-stats-data (legacy, us-east1) | 46.47 GiB | 0             | 0          |

The live figures are from before the z0–14 upload on 10-16. Both data buckets
have **30-day soft delete** (staging since 2026-10-04, ca since 2026-10-09).
Every overwrite and delete is billed for 30 more days. Re-derive churn left
soft-deleted bytes at twice the live data, not counting the basemap.

### What this means for the proposed rules

Without the basemap, all data in both buckets costs under CAD 1/month. Ageing
`runs/` to Nearline would save less than CAD 0.01/month. It would also cost
Class A transition operations, a 30-day minimum and retrieval fees. So the
rules below **only delete**; none of them changes storage class. The pipeline
already expires `runs/<id>/` after `RUN_MANIFEST_RETENTION_DAYS` (90) in
`data-pipeline.yml`, so the `runs/` rule is only a backstop.

## 2. Proposed lifecycle rules

- `infra/gcs-lifecycle/toast-stats-data-staging.json`:
  - Delete `runs/` objects after 180 days, as a backstop to the 90-day pipeline expiry.
  - Delete noncurrent generations 7 days after they become noncurrent.
  - Abort incomplete multipart uploads after 7 days.
- `infra/gcs-lifecycle/toast-stats-data-ca.json` has the noncurrent and multipart rules only.
  It removes the 2.0 GiB of noncurrent generations (CAD ~0.06/month).

No rule touches `snapshots/`, `basemap/`, `config/` or `time-series/`; the test
enforces this.

The estimated saving is **about CAD 0.06/month**. The rules are hygiene; they
are not a cost lever.

Apply them. **Ron approves.** Each command replaces the bucket's whole
lifecycle config, and neither bucket has one today.

```bash
gcloud storage buckets describe gs://toast-stats-data-staging --format="json(lifecycle_config)"
gcloud storage buckets describe gs://toast-stats-data-ca --format="json(lifecycle_config)"
gcloud storage buckets update gs://toast-stats-data-staging --lifecycle-file=infra/gcs-lifecycle/toast-stats-data-staging.json
gcloud storage buckets update gs://toast-stats-data-ca --lifecycle-file=infra/gcs-lifecycle/toast-stats-data-ca.json
```

To undo: `gcloud storage buckets update gs://<bucket> --clear-lifecycle`.

### Optional, separate decision: shorten soft delete

Reducing soft delete from 30 days to 7 is the larger storage lever. If the
soft-deleted bytes fall in proportion, it saves about CAD 0.55/month on staging
and CAD 0.20/month on ca. It also shortens the window in which an object
deleted during a re-derive can be restored. Soft delete was set to 30 days
deliberately during the #1759 batches, so leave it until those batches are
done. To apply it:

```bash
gcloud storage buckets update gs://toast-stats-data-staging --soft-delete-duration=7d
gcloud storage buckets update gs://toast-stats-data-ca --soft-delete-duration=7d
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

**Delete. Ron approves; on or after 2026-10-23.**

```bash
gcloud storage rm gs://toast-stats-data-staging/basemap/protomaps-v4/world-z0-10-20261011.pmtiles
gcloud storage rm gs://toast-stats-data-ca/basemap/protomaps-v4/world-z0-10-20261011.pmtiles
```

This saves about CAD 0.24/month. Billing for the objects stops only after the
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
