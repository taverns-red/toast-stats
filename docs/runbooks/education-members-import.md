# Runbook — Prior-PY education members import from a TI CSV export (operator-run)

**Issue:** #1603 · **Feature:** #1592 (Team Spirit ranking)
**Posture:** one-off, validate-first through staging (ADR-002). The command
writes the **local cache only**; every GCS step below is explicit and
operator-executed.

## What this does

Team Spirit needs distinct members with a counted education award per club.
TI's prior-PY Educational Achievement Archive has no `Member` column, so a
closed program year can't be fetched (see `docs/design/education-awards-plan.md`).
The district instead exports TI's **Education Achievements** report at year end
as CSV (a title row, then `Club, Division, Area, Award, Date, Member, Name,
Location`, one row per award).

`import-education-members` counts that file with the **same rules as the daily
collector** (`countMembersPerClub` → `memberIdentityKey` +
`isCountedEducationAward`: Pathways L1–L5 + DTM) and replaces **only**
`sections.educationMembers` (`{club, membersWithAward}`) in the existing PY-end
dataset `snapshots/<endYear>-06-30/district_<id>_reports.json`. Every other
section (including the Archive-sourced `educationAchievements`) and top-level
field is left as is. Re-running replaces the section (idempotent).

It fails closed when: a required header (`Club`, `Award`, `Member`, `Date`) is
missing; a row's Date is outside the program year; the title row or a
`District` column names another district; `--as-of` predates the latest award;
the reports file is missing (it never creates one), malformed, or for another
PY/district.

`--as-of` is required (not inferred from the file name): it is user-facing
provenance ("as of July 01, 2026"), and file names get renamed and prefixed in
transit. It is rendered in the same `Month DD, YYYY` form as every other
source's `asOf`.

## Privacy (epic #1062) — hard rule

The CSV contains member names. Never copy it into the repo, a bucket, a ticket
or a chat. The command keeps names in memory only; stdout carries counts only,
and error messages name headers, row numbers, dates and districts — never a
member. Delete the local working copy when done.

## Steps

### 0. Build (fresh checkout)

```bash
npm install
npm run build:shared-contracts
npm run build:collector-cli
```

### 1. Sync the target file from STAGING (R2)

```bash
W=/tmp/edu-members && mkdir -p "$W/cache/snapshots/2026-06-30"
gsutil cp gs://toast-stats-data-staging/snapshots/2026-06-30/district_61_reports.json \
  "$W/cache/snapshots/2026-06-30/"
cp "$W/cache/snapshots/2026-06-30/district_61_reports.json" "$W/before.json"   # staging rollback copy
```

### 2. Run (local cache)

```bash
cd packages/collector-cli
node bin/collector-cli.js import-education-members \
  --file /path/to/Education_Achievements_-_District_61_2026-07-01.csv \
  --district 61 --program-year 2025-2026 --as-of 2026-07-01 \
  --cache-dir "$W/cache" | tee "$W/summary.json"
```

Expect `rowsRead` = data rows in the CSV and plausible `clubs` /
`membersWithAward` (D61 2025-26: 1,246 rows → 145 clubs, 745 members).
`rowsCounted` < `rowsRead` is normal (non-counted awards such as the Pathways
Mentor Program are excluded).

### 3. Verify locally

```bash
F="$W/cache/snapshots/2026-06-30/district_61_reports.json"
# everything except the new section is unchanged
diff <(jq -S 'del(.sections.educationMembers)' "$F") <(jq -S . "$W/before.json") && echo UNCHANGED
jq '.sections.educationMembers | {sources, clubs: (.records|length),
    members: ([.records[].membersWithAward]|add)}' "$F"
```

### 4. Upload to STAGING (one file)

```bash
gsutil cp "$F" gs://toast-stats-data-staging/snapshots/2026-06-30/district_61_reports.json
gsutil cat gs://toast-stats-data-staging/snapshots/2026-06-30/district_61_reports.json \
  | jq '.sections | keys'
```

Then open the staging app's D61 Analytics page at the 2026-06-30 date and check
the Team Spirit card is populated.

### 5. PROMOTE to production (operator decision)

Keep a copy of prod's current file (object versioning is **suspended** on
both buckets, so this local copy is the rollback target), then copy staging →
prod:

```bash
gsutil cp gs://toast-stats-data-ca/snapshots/2026-06-30/district_61_reports.json \
  "$W/prod-before.json"
gsutil cp gs://toast-stats-data-staging/snapshots/2026-06-30/district_61_reports.json \
  gs://toast-stats-data-ca/snapshots/2026-06-30/district_61_reports.json
```

Before promoting, confirm prod and staging differ only by the new section
(`diff` the two with `jq -S 'del(.sections.educationMembers)'`); if prod has
changed since the staging sync, re-run steps 1–4 from prod's copy instead.

### 6. Clean up

```bash
rm -rf "$W"   # after the prod check; keep prod-before.json until then. Delete the CSV too.
```

## Rollback

Object versioning is suspended on both buckets (checked 2026-10-03), so there
is no generation to restore. Either re-upload the copy saved before the change:

```bash
gsutil cp "$W/prod-before.json" \
  gs://toast-stats-data-ca/snapshots/2026-06-30/district_61_reports.json
```

or remove just the section and re-upload:

```bash
gsutil cat gs://toast-stats-data-ca/snapshots/2026-06-30/district_61_reports.json \
  | jq 'del(.sections.educationMembers)' > /tmp/rollback.json
gsutil cp /tmp/rollback.json gs://toast-stats-data-ca/snapshots/2026-06-30/district_61_reports.json
```

Same for staging (`toast-stats-data-staging`). Without the section the UI shows
Team Spirit as "not available" for that date — the pre-import state.
