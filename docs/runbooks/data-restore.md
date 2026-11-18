# Runbook — Data restore after a bad publish (#2492)

The data half of #2492. A daily (or rebuild) run that promotes bad objects
to the production bucket `toast-stats-data-ca` is put back by restoring the
previous **generation** of every object it wrote, from GCS soft delete. This
runbook covers what a bad publish can damage, how to spot it, the backup to
take first, the restore, and the staging drill. The Hosting half is
[hosting-auto-rollback.md](hosting-auto-rollback.md).

Status: **manual procedure; drill designed, not yet run.** No step below is
automated yet. #2492's acceptance criterion (a broken data publish restored
with no human action) needs the follow-ups at the end.

Every command marked **WRITE** changes a bucket or the CDN. Run none of them
without Ron's approval for that drill or incident (for prod, a separate
approval from the staging drill). Everything else is a read.

## Why soft delete is the restore mechanism

Neither bucket has Object Versioning. Both have soft delete, which keeps
**overwritten** generations as well as deleted ones:

```text
$ gcloud storage buckets describe gs://toast-stats-data-ca \
    --format="json(versioning_enabled,soft_delete_policy)"
"soft_delete_policy": {"effectiveTime": "2026-11-05T02:33:34.545000+00:00",
                       "retentionDurationSeconds": "1209600"},   # 14 days
"versioning_enabled": false

$ gcloud storage buckets describe gs://toast-stats-data-staging ...
"soft_delete_policy": {"effectiveTime": "2026-10-04T18:26:07.379000+00:00",
                       "retentionDurationSeconds": "604800"}     # 7 days
(no versioning field: off)
```

(read 2026-11-08)

- Google: soft delete "preserves objects and buckets that get deleted or
  overwritten by retaining them in a soft-deleted state", and "When you
  restore an object, Cloud Storage generates a new version of the object.
  … If a live object with the same name … already exists …, the restored
  object will overwrite the existing live version. The overwritten object
  that was formerly live is then automatically soft-deleted."
  ([Soft delete](https://docs.cloud.google.com/storage/docs/soft-delete))
- Commands: `gcloud storage ls gs://BUCKET/OBJECT --soft-deleted`,
  `gcloud storage restore gs://BUCKET/OBJECT#GENERATION`, bulk
  `gcloud storage restore gs://BUCKET/** --async --deleted-after-time=…
--deleted-before-time=…` (`--allow-overwrite` to replace live objects).
  ([Use soft-deleted objects](https://docs.cloud.google.com/storage/docs/use-soft-deleted-objects);
  flags from `gcloud storage restore --help`, SDK 592.0.0.)
- Seen in prod: each daily's overwrite of `v1/latest.json` left the
  previous generation soft-deleted, and a generation's `soft_delete_time`
  equals the `creation_time` of the generation that replaced it:

  ```text
  $ gcloud storage objects list gs://toast-stats-data-ca/v1/latest.json --soft-deleted \
      --format="table(generation,creation_time,soft_delete_time,hard_delete_time)"
  GENERATION        CREATION_TIME             SOFT_DELETE_TIME          HARD_DELETE_TIME
  1791548547852996  2026-10-09T12:22:27+0000  2026-10-09T21:35:17+0000  2026-11-08T21:35:17+0000
  1791581717953053  2026-10-09T21:35:17+0000  2026-10-10T14:04:13+0000  2026-11-09T14:04:13+0000
  …
  ```

  (Those older entries show a 30-day hard delete: they were soft-deleted
  under an earlier policy. Objects soft-deleted from now on keep 14 days in
  prod, 7 in staging.)

So the window to restore a bad prod publish is **14 days** from the
overwrite. A restore is itself reversible for 14 days: the bad generation it
displaces is soft-deleted in turn.

Permissions: per-object restore needs `storage.objects.restore` (and
`storage.objects.delete` when it overwrites); bulk restore also needs
`storage.buckets.restore`. The CI deploy identity and the project owners
already hold these, and so does the restore identity (below), so no new IAM
is needed.

## What a bad publish can damage

Production is written by one mechanism, `scripts/promote-run-manifest.ts
--execute` (`data-pipeline.yml`, step _Promote run manifest to production_),
which server-side copies the objects in the run manifest
(`gs://toast-stats-data-staging/runs/<run_id>/written.jsonl`) that fall
under the promoted prefixes. Order: dates, then globals, then the v1/ entry
points last (`scripts/lib/manifestPromotion.ts`).

| Layer                 | Paths in `toast-stats-data-ca`                                                                                                         | Written by                                    | Cache-Control                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------- |
| Entry points          | `v1/latest.json`, `v1/dates.json`                                                                                                      | promote (entry phase, last)                   | 300 s / 900 s                |
| Rankings              | `v1/rankings.json`, `v1/rank-history/<id>.json`                                                                                        | promote (globals)                             | 300 s                        |
| Per-date snapshots    | `snapshots/<date>/**` (district files, `analytics/`, `metadata.json`, `all-districts-rankings.json`, `global-totals.json`, …)          | promote (dates)                               | 3600 s, must-revalidate      |
| Reconciliation        | `snapshots/<monthEnd>/revisions/**` + `revisions/index.json`                                                                           | promote (index in entry phase)                | as staged                    |
| Time series           | `time-series/**`                                                                                                                       | promote (globals)                             | as staged (gzip-encoded)     |
| Config / indexes      | `config/**` (`district-snapshot-index.json`, `club-district-history/` shards + `index.json`)                                           | promote (globals; shard index in entry phase) | as staged                    |
| Report sidecars       | `snapshots/<date>/district_<id>_reports.json`, `derived/education-rollup/**`                                                           | `promote-reports` job (`--education-rollup`)  | as staged                    |
| Share cards           | `og/v1/district/<id>.png`                                                                                                              | `og-cards` job (`--og-cards`)                 | 3600 s                       |
| Removals (not copies) | gap-district objects of a promoted date (#2232); prune reconcile deletes whole `snapshots/<date>/`, `raw-csv/<date>/` prefixes (#1767) | promote (after entry points); prune mode      | — (soft-deleted, restorable) |

Never promoted, so not damaged in prod by a publish: `raw-csv/`, `raw-fac/`,
`club-trends/`, `club-race/`, `derived/` (except the education rollup),
`runs/`. `basemap-build.yml` and `videos-publish.yml` write prod separately;
they are out of scope here.

A daily run's manifest is about 1,600 objects; roughly 1,000 sit under
promoted prefixes (run 42469518307: 166 `v1/`, 283 `config/`, 189
`time-series/`, ~400 `snapshots/`).

### Failure shapes

1. **Bad values** in a date or a global (wrong counts, missing districts):
   the objects parse, so only the gates or a person notice.
2. **Broken shape** (unparseable JSON, double gzip as in #1702, schema
   break): consumers fail.
3. **Bad entry point** (`latest.json` names a date prod lacks, or a bad
   date): the whole app is affected.
4. **Wrong removals** (gap-district removal or prune reconcile deleting too
   much).

### Detection

- `scripts/hosting-smoke.ts` probe `cdn-data`: `v1/latest.json` parses with
  a `latestSnapshotDate`. Runs after every Hosting deploy, not after a data
  publish.
- **CDN Schema Canary** (`cdn-schema-canary.yml`, daily 15:30 UTC): the
  mcp-server's read validation against what the prod CDN serves, plus
  `config/district-snapshot-index.json` and time-series decode + freshness.
  Run it on demand: `CDN_BASE_URL=https://cdn.taverns.red npx tsx scripts/check-cdn-schema.ts`.
  `CDN_BASE_URL` is required (or `--base URL`); the script refuses to run
  without one and has no default (#2974).
- **Freshness monitor** (`pipeline-freshness-monitor.yml`, daily 14:00 UTC):
  `generatedAt` older than 26 h.
- The run's own summary (gate verdicts, objects copied) and user reports.

Shapes 2–3 trip the canary or the smoke; shape 1 does not, and needs a
person comparing against TI's dashboard (`validate-vs-ceo-report.yml`).

## Procedure

### 0. Stop the next publish (no write)

A restore is undone by the next promote of the same bad staging state.
Before restoring, make sure no data-pipeline run is in progress and the next
one won't promote the bad state:

```bash
gh run list --workflow data-pipeline.yml --status in_progress
gh run list --workflow data-pipeline.yml --limit 5
```

Hold the 05:00 America/Toronto launchd trigger
([local-daily-pipeline-trigger.md](local-daily-pipeline-trigger.md)) until
the cause is fixed on main, or accept that the next daily re-promotes the
bad state.

### 1. Identify the bad promotion (read)

```bash
RUN=<run id of the bad data-pipeline run>
PROD=gs://toast-stats-data-ca
STAGING=gs://toast-stats-data-staging
WORK=$(mktemp -d)

# The run manifest (kept 90 days in staging; never promoted).
gcloud storage cp "$STAGING/runs/$RUN/written.jsonl" "$WORK/written.jsonl"
# Prod paths the promote could have written: the promoted prefixes
# (scripts/lib/promotionContentGate.ts PROMOTED_PREFIXES), the education
# rollup and share cards.
jq -r '.path' "$WORK/written.jsonl" \
  | grep -E '^(v1|snapshots|time-series|config)/|^derived/education-rollup/|^og/v1/district/' \
  | sort -u > "$WORK/paths.txt"
wc -l "$WORK/paths.txt"
```

The promote time is in the run log (step _Promote run manifest to
production_). Confirm the live generation of an entry point was written by
that run:

```bash
gcloud storage objects describe "$PROD/v1/latest.json" \
  --format="value(generation,creation_time)"
```

If a later run has promoted again since, the generation to restore is the
one live **before** the bad run, not the one immediately before now: walk
back the `soft_delete_time` chain below to the bad run's promote time.

### 2. Plan the restore (read)

For each path: the generation the bad run displaced is the soft-deleted one
whose `softDeleteTime` equals the live object's `timeCreated`.
`scripts/plan-data-restore.ts` (logic and tests in
`scripts/lib/dataRestorePlan.ts`, #2539) applies that rule to two saved
listings and prints a plan. It makes no GCS call itself. Any ambiguity
refuses; a wrong delete is far worse than a refuse. The exact rule, walking
back from the live object (each step matches by exact millisecond, no
tolerance):

- **restore**: the walk reaches a copy created before `--since`.
- **delete**: only if (a) the object has no soft-deleted copies at all, was
  created between `--since` and `--until`, and the soft-deleted listing is
  not empty overall; or (b) every soft-deleted copy of the object was consumed
  by the walk, which ends at the oldest existing copy, itself created after
  `--since`.
- **noop**: live object created before `--since`.
- **refuse**: anything else. In particular any soft-deleted copy the walk did
  not consume (a missing or hard-deleted generation, a timestamp mismatch), two
  copies matching one step, a loop, or a live object created after `--until`.

`--since` and `--until` are when the bad run began and finished promoting
(from `gh run view $RUN`). Both are required and need an explicit `Z` or
offset; a time without one is refused, never read as local time. `--paths` is
required: nothing else limits the deletes.

**Before any production use: the staging drill (#2492) must confirm that a
replaced generation's `softDeleteTime` equals the replacing generation's
`timeCreated` to the millisecond.** Google's documentation does not promise
that. The planner keeps the exact match on purpose and has no tolerance, so if
the equality does not hold, every overwritten object refuses and nothing is
executed. Do not loosen it to make a plan pass.

```bash
SINCE=<ISO time the bad run began, with Z or offset, e.g. 2026-11-08T10:00:00Z>
UNTIL=<ISO time the bad run ended, with Z or offset>
# Reads. One `ls` per object, because `gcloud storage ls -I` stops at the
# first URL that matches nothing and never lists the rest (list_urls() in the
# SDK raises on the first empty URL). An object new in the run has no
# soft-deleted copy, so "matched no objects" is expected for it; the exit
# code is ignored and stderr is what gets checked. Quiet gcloud's update
# notice, which would also land in stderr and be refused.
export CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK=1
sed "s#^#$PROD/#" "$WORK/paths.txt" > "$WORK/urls.txt"
: > "$WORK/live.cat"; : > "$WORK/soft.cat"; : > "$WORK/live.err"; : > "$WORK/soft.err"
while read -r U; do
  gcloud storage ls --json "$U" >> "$WORK/live.cat" 2>> "$WORK/live.err" || true
  gcloud storage ls --soft-deleted --json "$U" >> "$WORK/soft.cat" 2>> "$WORK/soft.err" || true
done < "$WORK/urls.txt"
jq -s 'add // []' "$WORK/live.cat" > "$WORK/live.json"
jq -s 'add // []' "$WORK/soft.cat" > "$WORK/soft.json"
npx tsx scripts/plan-data-restore.ts --live "$WORK/live.json" \
  --soft-deleted "$WORK/soft.json" --live-errors "$WORK/live.err" \
  --soft-errors "$WORK/soft.err" --since "$SINCE" --until "$UNTIL" \
  --paths "$WORK/paths.txt" --out "$WORK/plan.json"
```

**Both `--live-errors` and `--soft-errors` are required.** Every non-blank
line in them must be exactly gcloud's `ERROR: (gcloud.storage.ls) One or more
URLs matched no objects.` (from `list_util.py` in the Cloud SDK; the public docs
do not quote it, so it is matched exactly). Any other line (a transient
error, quota, a notice) refuses the whole plan, because a listing that failed
for one object would make an overwritten object look new, and the planner
would delete it. Re-run the reads and plan again.

**The plan also refuses every restore and delete once more than 13 days have
passed since `--since`.** Soft-deleted copies live 14 days; after that the copy
from before the run may be hard-deleted while later copies remain, which would
make an overwritten object look new. Reason: soft-delete retention. Past the
window, restore by hand from the backup or CDN history.

The listing fields are those of the Cloud Storage JSON API object resource
(`name`, `bucket`, `generation`, `timeCreated`, `softDeleteTime`,
`hardDeleteTime`), nested under `metadata` in each `gcloud storage ls --json`
entry ([Objects](https://docs.cloud.google.com/storage/docs/json_api/v1/objects)).
stdout is the plan as JSON, stderr a count per action; exit 1 means at least
one object was refused. Review `plan.json` by hand: `delete` entries should
be only objects the bad run created (typically one `snapshots/<date>/`
directory), and every `restore` names its generation and why. Copies soft-deleted
under the earlier 30-day policy match like any other. A refused plan cannot
be executed: fix the cause (or restore that object by hand) and re-plan.
For **wrong removals** (shape 4) there is no live object: list them with
`gcloud storage ls "$PROD/snapshots/<date>/**" --soft-deleted` and restore
by generation, or use the bulk restore with the promote's time window.

### 3. Back up the live state (WRITE, backup bucket)

Soft delete already keeps what a restore displaces for 14 days. The backup
is a second, independent copy that survives a mistaken purge and needs no
soft-delete knowledge to read back. Copy the objects about to change into
the dedicated backup bucket `gs://toast-stats-backups-ca` (#2541): same
region as prod, private, 7-day soft delete, and a lifecycle rule that
deletes every object after 90 days
(`infra/gcs-lifecycle/toast-stats-backups-ca.json`). Server-side copy keeps
`Content-Encoding` and `Cache-Control`.

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUPS=gs://toast-stats-backups-ca
BACKUP="$BACKUPS/restore-2492-$STAMP/prod"
# WRITE — needs approval
jq -r '.entries[] | select(.action == "restore" or .action == "delete") | .name' \
  "$WORK/plan.json" > "$WORK/changing.txt"
while read -r P; do gcloud storage cp "$PROD/$P" "$BACKUP/$P"; done < "$WORK/changing.txt"
gcloud storage ls -r "$BACKUP/**" | wc -l   # equals: wc -l < "$WORK/changing.txt"
```

Record `$BACKUP` in the incident issue: `$STAMP` is empty in a new shell,
and the put-back below needs it.

To put the backup back:
`gcloud storage cp "$BACKUPS/restore-2492-$STAMP/prod/<path>" "$PROD/<path>"`
per object (WRITE).

Backups are taken by hand by a project owner, who already has write access
to the bucket. Doing it from CI would need a new IAM grant for the CI
identity, which is Ron's call (see Follow-ups).

### 4. Restore (WRITE, production)

Reverse of the promote's order, so prod never names an object it lacks:
**entry points first** (the frontend goes back to the previous date list),
then globals and dates, then remove what the bad run created.

```bash
# WRITE — needs approval. Applies the reviewed plan: restores (entry points
# first), then deletes. Re-lists, re-plans and refuses unless the fresh plan
# equals plan.json (an object changed since you reviewed it, or a refused
# entry is in it), and then runs nothing.
# Redo the step 2 read loop (same commands, same stderr files), then:
npx tsx scripts/plan-data-restore.ts --execute --plan "$WORK/plan.json" \
  --live "$WORK/live.json" --soft-deleted "$WORK/soft.json" \
  --live-errors "$WORK/live.err" --soft-errors "$WORK/soft.err"
date -u +%FT%TZ   # all restored at
```

Each restore is
`gcloud storage restore --if-generation-match=LIVE_GENERATION gs://…#GENERATION`
(no `--allow-overwrite`: it is a bulk-only flag, and a synchronous restore
rejects it with "Synchronous execution does not support flag:
allow_overwrite", gcloud SDK 588.0.0 `surface/storage/restore.py` L40-41 and
L381) and each delete `gcloud storage rm gs://…#LIVE_GENERATION` (the exact
generation the plan saw). For restore, `--if-generation-match` makes the
call fail if the live object changed since the plan (JSON API
[objects.restore](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/restore):
`ifGenerationMatch` is conditional on a live version with that generation;
`gcloud storage restore` lists the flag at
[its reference](https://docs.cloud.google.com/sdk/gcloud/reference/storage/restore)).
The gcloud page does not show the flag combined with a `#generation` URL, so
the staging drill must also confirm that exact invocation works, including
that `--if-generation-match` without `--allow-overwrite` replaces a live
object.

**Unproven against real GCS (#2977):** a restore of a name the run deleted
(nothing live) uses `--if-generation-match=0`. A unit test checks the command
the plan builds, but no drill has run it. Until one does, treat that path as
unproven and check the first such restore by hand. The bulk-only flag list
(`BULK_ONLY_RESTORE_FLAGS` in `scripts/lib/dataRestorePlan.ts`) was copied from
SDK 588.0.0 by hand: re-check it against `_BULK_RESTORE_FLAGS` in
`surface/storage/restore.py` whenever the CI gcloud pin changes. `dataRestoreBulkFlagsPin.test.ts` fails
until `BULK_FLAGS_CHECKED_SDK` matches the pin in `data-pipeline.yml`.

For delete
the `#LIVE_GENERATION` URL already pins the object. The saved plan file is
schema-checked and refused if malformed. If a command fails partway,
execution stops and stdout gets `{executed, failedAt}` (exit 1); re-plan from
fresh listings before going on. Deleted and displaced generations are
soft-deleted, so both are reversible.

`gcloud storage restore` overwrites the live object and soft-deletes it (see
above). If a date that the plan's `delete` entries empty is still named by **staging's**
`v1/dates.json`, the next promote holds its globals ("no dangling index
entries", `manifestPromotion.ts`) until that date is re-derived or pruned
from staging; plan that fix with the restore.

### 5. Purge the CDN (WRITE)

Same call the pipeline makes after a promote (#1294):

```bash
gcloud compute url-maps invalidate-cdn-cache toast-stats-cdn-url-map \
  --path '/*' --async --project toast-stats-prod-6d64a
```

Without it, the edge keeps the bad objects until their max-age (5 min for
`latest.json`, 15 min for `dates.json`, 1 h for snapshots). The prod backend
bucket (`toast-stats-cdn-backend`) is `CACHE_ALL_STATIC`, default TTL 3600 s,
max TTL 86400 s, `serveWhileStale` 86400 s. Browsers keep their copy for the
max-age either way.

### 6. Verify (read)

```bash
# The edge serves the restored generation.
curl -sI "https://cdn.taverns.red/v1/latest.json?nocache=$RANDOM" \
  | grep -i x-goog-generation
gcloud storage objects describe "$PROD/v1/latest.json" --format="value(generation)"
curl -s https://cdn.taverns.red/v1/latest.json | jq '.latestSnapshotDate, .generatedAt'

# Shape and freshness, as the canaries check them.
CDN_BASE_URL=https://cdn.taverns.red npx tsx scripts/check-cdn-schema.ts
MANIFEST_URL=https://storage.googleapis.com/toast-stats-data-ca/v1/latest.json npx tsx scripts/check-pipeline-freshness.ts   # expected stale if the bad run was the latest

# The Hosting smoke's data probe (and the rest of the core path).
BASE_URL=https://ts.taverns.red CDN_BASE_URL=https://cdn.taverns.red SMOKE_WINDOW_SECONDS=60 SMOKE_RENDER=off npx tsx scripts/hosting-smoke.ts
```

Record: bad promote at → detected at → restore started → entry points
restored → all restored → CDN purge issued → verified healthy.

### Staging after a restore (#2540)

A restore touches prod only. If it removed a whole date from prod (the bad
run's new `snapshots/<date>/`), **staging's `v1/dates.json` and
`v1/latest.json` still name that date**. The next promote then holds every
global (`v1/`, `config/`, `time-series/`) under the "no dangling index
entries" rule in `scripts/lib/manifestPromotion.ts`: promoting that index
would point the frontend at a directory prod no longer has. The hold message
names the date: "date X is in staging dates.json but not in prod".

The rule is not loosened: prod's own gate stays closed, because letting the
index through is exactly the bug it prevents. Fix staging instead, before the
next scheduled daily (otherwise it holds and files a promotion-held issue):

1. Fix the cause of the bad run first, or the same date comes back bad.
2. Pick one:
   - **Re-derive the date** so it promotes through its own gates and prod
     regains it: dispatch `data-pipeline.yml` in `rebuild` mode with
     `dates=<date>` (add `force` only when the raw CSVs are the problem).
   - **Drop the date from staging** (the restore decided it should not exist
     in prod): remove its `snapshots/<date>/` from staging and regenerate the
     index so `dates.json` and `latest.json` stop naming it (the prune
     reconcile does both for retention-expired dates, #1767).
3. Verify: the next promote's plan shows `globals: promote`, not the
   dangling-index hold.

Do this alongside the restore, not after the hold appears.

### Alternative: fix forward

When the cause is a code fix that lands quickly, re-running the daily on the
fixed main (`gh workflow run data-pipeline.yml --ref main -f mode=daily`)
goes through every gate and overwrites the same objects. It is slower (about
25–30 min a run) but needs no restore. Prefer it for shape 1 (bad values)
when the site is still usable; prefer the restore for shapes 2–4.

## Staging drill (design — not yet run)

Goal: break a staging pointer and a staging object, restore both by
generation, and record the timings, with the same commands as above.
Production is not touched. Staging is served at
`https://cdn-staging.taverns.red` (URL map
`toast-stats-cdn-staging-url-map`, backend TTL 300 s), which PR previews
read, so previews see the break for the drill's few minutes.

### Window

The daily pipeline is dispatched at **05:00 America/Toronto** by launchd:
10:00 UTC in winter (EST), 09:00 UTC in summer. Recent runs take 25–30 min,
and the trigger retries for about 15 min. The freshness monitor runs at
14:00 UTC and the schema canary at 15:30 UTC (both read prod only); the
harness staging canary reads staging Mondays at 16:15 UTC.

Proposed window: **12:00–13:30 UTC (07:00–08:30 Toronto), Tuesday to
Friday**, after the daily has finished and before the 14:00 monitor. Do not
run it:

- while any data-pipeline run is in progress or queued (check with
  `gh run list --workflow data-pipeline.yml --status in_progress`), or on a
  day a rebuild/backfill is planned, because a run would overwrite the
  staging objects mid-drill;
- during a live customer event (a Red Vote election or district meeting
  that relies on the dashboards), per the COO guardrails in ADR 0017 in
  `taverns-red/ops`.

### Steps

```bash
STAGING=gs://toast-stats-data-staging
CDN=https://cdn-staging.taverns.red
OBJ=snapshots/$(curl -s "$CDN/v1/latest.json" | jq -r .latestSnapshotDate)/metadata.json
WORK=$(mktemp -d)

# 1. Record the good generations (read).
for P in v1/latest.json "$OBJ"; do
  gcloud storage objects describe "$STAGING/$P" \
    --format="value(name,generation,creation_time,cache_control,content_encoding)"
done | tee "$WORK/good.txt"

# 2. Backup (WRITE) — same method as procedure step 3.
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
for P in v1/latest.json "$OBJ"; do
  gcloud storage cp "$STAGING/$P" "$STAGING/_archive/drill-2492-$STAMP/$P"
done

# 3. Break (WRITE): an unparseable pointer and a garbage object, with the
#    same headers as the real ones.
date -u +%FT%TZ   # broken at
echo 'drill #2492' | gcloud storage cp - "$STAGING/v1/latest.json" \
  --content-type=application/json --cache-control="public, max-age=300"
echo '{}' | gcloud storage cp - "$STAGING/$OBJ" \
  --content-type=application/json --cache-control="public, max-age=3600, must-revalidate"

# 4. Detect (read): expect cdn-data to fail (allow up to 300 s of edge cache,
#    or purge the staging CDN — WRITE — to see it at once).
CDN_BASE_URL=$CDN BASE_URL=https://toast-stats-staging--pr-<N>-<hash>.web.app \
  SMOKE_RENDER=off SMOKE_WINDOW_SECONDS=120 npx tsx scripts/hosting-smoke.ts
date -u +%FT%TZ   # detected at

# 5. Plan (read): procedure step 2 against $STAGING (list both paths with the
#    per-object ls loop, stderr to the two errors files, --since = the break time from step 3, --until = a few minutes
#    after it; both with Z). Both should come out as `restore` with the
#    generations recorded in step 1. This is also where to confirm that
#    softDeleteTime equals the replacing generation's timeCreated exactly
#    (a refuse here means it does not), and that
#    `gcloud storage restore --if-generation-match=<live> ...#<gen>` runs.

# 6. Restore (WRITE), pointer first, then purge the staging CDN (WRITE).
date -u +%FT%TZ   # restore started
gcloud storage restore "$STAGING/v1/latest.json#<good generation>"
gcloud storage restore "$STAGING/$OBJ#<good generation>"
date -u +%FT%TZ   # restored at
gcloud compute url-maps invalidate-cdn-cache toast-stats-cdn-staging-url-map \
  --path '/*' --async --project toast-stats-prod-6d64a

# 7. Verify (read): same name, content type, cache-control and encoding as
#    step 1 (a new generation number is expected); smoke and schema check pass.
for P in v1/latest.json "$OBJ"; do
  gcloud storage objects describe "$STAGING/$P" \
    --format="value(name,generation,creation_time,cache_control,content_encoding)"
done
CDN_BASE_URL=$CDN BASE_URL=https://toast-stats-staging--pr-<N>-<hash>.web.app \
  SMOKE_RENDER=off SMOKE_WINDOW_SECONDS=60 npx tsx scripts/hosting-smoke.ts
CDN_BASE_URL=$CDN npx tsx scripts/check-cdn-schema.ts
date -u +%FT%TZ   # verified healthy at

# 8. The broken generations are now soft-deleted (7 days in staging);
#    the backup expires with _archive/ (30 days). Nothing else to clean.
```

Record in #2492: broken at → detected at → restore started → restored at →
CDN purge issued → verified healthy, the four generation numbers, and
whether the restored objects' headers (`Content-Encoding`, `Cache-Control`)
matched step 1.

### Then production

A prod drill reuses steps 1–8 on `toast-stats-data-ca`, the prod URL map and
`https://cdn.taverns.red`, breaking only one non-entry object of an old
date (not `v1/latest.json`), under a separate approval and in the same
window. Its step 2 copies to the backup bucket instead of staging's
`_archive/`: `gs://toast-stats-backups-ca/drill-2492-$STAMP/$P`. That
backup expires under the backup bucket's 90-day rule; step 8's "expires with
`_archive/` (30 days)" applies to the staging drill only.

## Automatic restore (#2537): built, dry-run by default

Two jobs in `data-pipeline.yml` run when the post-promotion `data-smoke`
reports bad data (the smoke or the CDN schema check). Never on a
`skip_promotion` run.

- `data-auto-restore-decide` never uses a write identity: it authenticates
  only as the read-only reader (#2858). It does hold `id-token: write`, on
  the same workload identity provider as the other pipeline jobs, together
  with `contents: read` and `issues: write`, so what stops it minting the
  promote account's token is that provider's binding for that account, not
  the job. Narrowing that binding is IAM work, tracked separately. It files or refreshes the `data-rollback` issue: run id,
  verdict, reason, mode, the run manifest's path
  (`gs://toast-stats-data-staging/runs/<id>/written.jsonl`), the exact
  command to plan by hand and the enumerated plan (see below). It outputs
  `execute` (true only for an unhealthy run, an eligible verdict and
  `DATA_AUTO_RESTORE=execute`) and the issue number.
- `data-auto-restore-execute` is the only job that signs in as the restore
  identity (repository variable `GCP_RESTORE_SA`, #2964). Its workload identity
  binding admits only the `data-restore` environment. It holds object access
  on the prod data bucket (list, read, create, delete, update and restore),
  read on the staging data bucket, create-only on the backups bucket and the
  CDN cache-invalidation role; no bucket metadata and no IAM. The variable is
  checked before auth so an empty value cannot fall back to direct workload
  identity. It runs only when `execute` is `true`, `restore_eligible`
  is `true`, the ref is `refs/heads/main` and the run promoted, behind the
  `data-restore` environment. It lists prod's live and soft-deleted copies of
  the objects the run wrote, plans with `scripts/plan-data-restore.ts`
  (window: the promote's start to the smoke's end; paths: the run manifest's
  in-scope objects, `scripts/data-auto-restore.ts paths`), restores a clean
  plan, purges the CDN, re-checks, attaches the plan as the
  `data-restore-plan` artifact and comments the enumerated plan and the result
  on the issue.

**The dry-run plan (#2858).** The decide job authenticates as the read-only
data reader (repository variable `GCP_DATA_READER_SA`; role
`roles/storage.objectViewer` on the prod and staging data buckets, nothing
else), runs the same listing and `plan-data-restore.ts` as the execute job
without `--execute`, and puts the plan in the issue: counts, then the refused,
removed and restored objects, capped (the full plan is the
`data-restore-plan-dry-run` artifact). The reader's workload identity binding
admits only `refs/heads/main`, so the auth step runs on main only and the job
must never gain an `environment:` (it would change the OIDC subject). It never
uses the promote service account and writes nothing. If auth or the listing
fails, the issue is still filed with the manual command and a line
`enumeration failed: <class>`; the GCP error text stays in the job log. The
classes: `auth-failed` (auth failed, or `GCP_DATA_READER_SA` is empty: it is
checked before auth so auth cannot fall back to direct workload identity),
`manifest-unreadable` (the run manifest is missing or malformed),
`no-in-scope-objects` (a valid manifest with nothing to restore),
`listing-failed` (the planner could not trust a listing), `plan-refused` (a
plan was built and refuses entries; it is shown in the issue) and
`plan-failed` (anything else). `DATA_AUTO_RESTORE=off` skips it. First
live proof is the staging drill (#2492).

| `DATA_AUTO_RESTORE` (repository variable) | What happens on a failed smoke   |
| ----------------------------------------- | -------------------------------- |
| unset, empty, `dry-run`, or anything else | issue only, no restore (default) |
| `off`                                     | issue only, no restore           |
| `execute`                                 | restore, purge, re-check, issue  |

The value is matched exactly: `execute` and `off` in lower case, nothing
trimmed. `Execute`, `EXECUTE` or `true` only plans. The job reads
`vars.DATA_AUTO_RESTORE` as GitHub resolves it, so an organization-level
variable of the same name is inherited by this repository unless a repository
variable overrides it. Check both levels before assuming it is unset.

`execute` restores only when the failure is a decode or validation failure of
the published data (`restore_eligible`, below) and the plan is clean: any
refused entry, a plan that could not be built, or a plan with nothing to do
aborts it, and the issue is still filed. It re-lists and re-plans first and refuses on any difference, restores
entry points first, removes objects the run created, then purges the CDN
(`toast-stats-cdn-url-map`) and re-checks the schema after two minutes.

**Run modes (#2856).** `execute` applies only to `daily` and `rebuild` runs.
Every other mode (the proof and backfill modes, `rescrape`,
`rescrape-historical`, `prune`) gets a plan and the issue, decision
`mode-refused`. The run mode comes from the pipeline job's `mode` output;
an empty or unrecognised value does not execute.

**Prod removals (#2856).** The plan lists what the run wrote and, from the
run's removal record, what it removed from prod on purpose. The promoter
appends one line per removal to `runs/<id>/prod-removed-a<attempt>.jsonl`
(the promote-reports job: `prod-removed-reports-a<attempt>.jsonl`) before it
removes. The file name carries `GITHUB_RUN_ATTEMPT`, so "Re-run failed jobs"
adds a record instead of replacing the last one (#2903), and
`scripts/pipeline/read-prod-removals.sh` reads every attempt's record. Runs
from before #2903 have `prod-removed.jsonl` and `prod-removed-reports.jsonl`;
the reader matches `prod-removed*.jsonl`, so they still work:

- a #2232 gap-district object is listed as removed on purpose and is not
  restored (0-club junk);
- a prune reconcile's date prefix is listed as not restorable automatically,
  so a person decides;
- a name the run wrote that has no live object in prod, with a copy
  soft-deleted inside the run window, and that is not in the record, is an
  unexplained deletion and is planned as a restore (precondition
  `--if-generation-match=0`: the name must still be empty).

The plan only checks names the run wrote (`written.jsonl`). It does not list a
prod deletion outside that manifest, and that is deliberate (#2903). The
promoter cannot make one: it refuses to remove without a record and writes the
record before every removal. A deletion outside the run's names is not this
run's doing (a person, or another run), and finding it would mean listing every
soft-deleted object in the bucket for the window, then restoring things a
person may have deleted on purpose. If you suspect one, plan it by hand
(step 2).

The two deletion steps in prune mode never reach prod. "Delete pruned dates
from GCS" and "Expire run manifests older than 90 days" (both steps in
`data-pipeline.yml`, each prefixed `[prune]`) act on `gs://${GCS_BUCKET}`, and
`GCS_BUCKET` is set once, at line 166, to `toast-stats-data-staging`. A pruned
date reaches prod only through the promoter's prune reconcile, which writes
its record first and which the plan lists as `manual`, never as a restore.
Run manifests (`runs/<id>/`) are not restore candidates either: the plan's
paths come from `manifestPaths`, which keeps only prod prefixes.

Intent is never inferred from an object's size or content, only from the
record. A run that removed nothing has no record file, and the plan reads
that as empty; a record that exists but cannot be read stops the plan
(`removal-record-unreadable`). The promoter refuses to remove from prod when
`PROD_REMOVALS_FILE` is unset.

Not done by the job: the backup copy (step 3; soft delete is the backup, and
copying into `toast-stats-backups-ca` needs an IAM grant, see Follow-ups),
and fixing staging after a removed date (#2540).

**Which failures may restore (`restore_eligible`, #2500).** `data-smoke`
classifies the failure (`scripts/data-auto-restore.ts verdict`). It is
eligible only when every failure is a decode or validation failure: the
cdn-data probe saying `latest.json is not JSON` or `no YYYY-MM-DD
latestSnapshotDate`, or the schema check failing on nested gzip, bad UTF-8,
bad JSON or a schema mismatch (`restoreEligibleFromCanary`). Not eligible:
Hosting probe failures (home, entry-asset, district), a probe that failed on
an HTTP status, a smoke or schema step that crashed or never ran, freshness,
fetch and shape failures, and any mix of those with a decode failure. The
issue is still filed, with the action `not-eligible` and the reason; nothing
executes.

**Preconditions for turning `execute` on (Ron).** Never turned on yet: it has
not run against real objects.

1. Create the `data-restore` environment (Settings, Environments) with a
   deployment branch policy of `main` only. Until it exists the job's ref
   check is the only lock; the environment is the second. A job that names a
   missing environment is created on first use with no protection, so create
   it first.
2. #2856 has landed.
3. The staging drill is done: it confirms the planner's five assumptions (see
   #2492), and they are recorded here.
4. Only after step 1: the `data-restore` environment must exist, with its
   main-only policy, before `DATA_AUTO_RESTORE` is set to `execute`. The
   environment's branch policy is the one lock a branch cannot edit (a branch
   can change the workflow's `if`). Then set the repository variable `DATA_AUTO_RESTORE` to `execute` (and
   check for an organization-level variable of the same name).

## Open questions

- ~~Is a staging `_archive/` copy enough as the backup, or a dedicated
  bucket?~~ Resolved 2026-11-12 (#2541): dedicated bucket
  `toast-stats-backups-ca` in `NORTHAMERICA-NORTHEAST1`, 90-day retention,
  7-day soft delete. Cost is estimated under CAD 0.05/month for sub-GB
  backups. Ron approved the spend.
- ~~Should the restore plan be a script with tests?~~ Done (#2539):
  `scripts/plan-data-restore.ts`. Not yet run against a real bucket: its
  first use is the staging drill.
- 14 days of prod soft delete is the whole restore window. Enough, given the
  freshness and schema canaries run daily?

## Follow-ups (not in this PR)

- ~~Automate it for #2492's acceptance criterion~~ Built in #2537 (above),
  dry-run by default. Turning on `execute` needs Ron's OK after the staging
  drill.
- The restore identity has create-only access to `toast-stats-backups-ca`,
  but the execute job makes no backup copy today (soft delete is the backup).
  A backup step would use that grant; it can't overwrite or delete there.
- Smoke the data after every promote, not only after a Hosting deploy.
