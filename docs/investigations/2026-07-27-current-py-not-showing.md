---
title: 'ts.taverns.red not showing current Program Year — 2026-07-27'
tags: [program-year, cdn, gcs, closing-period, investigation]
status: active
created: 2026-07-27
---

# ts.taverns.red not showing current Program Year — 2026-07-27

**Symptom reported:** site doesn't show PY 2026-2027 as current.
**Type:** research-only investigation, no code changes.

## Verdict

**CDN is fresh and correctly mirrors the GCS bucket. The bucket has no PY
2026-2027 data yet because TM has only just rolled its live dashboard over to
July — this pipeline produces month-end snapshots only, so no 2026-07-31
snapshot can exist until the July close finishes (historically ~12–25 days
into August). The homepage/selector defaulting to PY 2025-2026 is correct,
data-driven, by-design behavior.** However, there IS one real bug: the
`/history` page renders a static "2026-27 · LIVE" chip computed from the
calendar, disconnected from the fact that zero pages have any 2026-2027 data —
this is the most likely source of the "not showing current PY" impression.

## Q1 — Is the CDN fresh vs. the GCS bucket?

Yes, exactly in sync, no CDN staleness:

- `curl https://cdn.taverns.red/v1/latest.json` → `latestSnapshotDate:
"2026-06-30"`, `generatedAt: "2026-07-27T21:29:43.337Z"` (today).
- `gsutil ls gs://toast-stats-data-staging/snapshots/` → newest is
  `2026-06-30/`.
- `gsutil ls gs://toast-stats-data-ca/snapshots/` (= `GCS_BUCKET_PRODUCTION`,
  the bucket the CDN url-map actually serves — see
  `.github/workflows/data-pipeline.yml:88,1632-1661`) → newest is also
  `2026-06-30/`.
- Both buckets agree; the CDN manifest matches both. No promotion lag, no
  CDN cache staleness.

## Q2 — Why does the bucket itself stop at 2026-06-30?

- `raw-csv/` in staging has a row for **every day through 2026-07-26**
  (`gsutil ls gs://toast-stats-data-staging/raw-csv/` → …07-24, 07-25,
  07-26) — the daily crawl is running, not stalled.
- But `raw-csv/2026-07-26/metadata.json` records
  `"programYear": "2025-2026", "isClosingPeriod": true, "dataMonth":
"2026-06", "closingPeriodSource": "csv-footer"` — the collector correctly
  detected, from the CSV footer, that TM's dashboard was **still serving June
  closing data** at crawl time (09:00 UTC) on 07-26.
  `gsutil cat gs://toast-stats-data-staging/raw-csv/2026-07-26/district-61/district-performance.csv
| tail -1` → `"Month of Jun, As of 07/26/2026"`.
- A live fetch of the same TM export **right now** (same day, later) —
  `curl "https://dashboards.toastmasters.org/export.aspx?type=CSV&report=districtperformance~61~~~2026-2027"
| tail -1` → `"Month of Jul, As of 07/26/2026"` — shows TM has since rolled
  over to July, intraday, after our crawl. Same pattern documented in
  [`2026-07-09-district44-stale-vs-live-restatement.md`](./2026-07-09-district44-stale-vs-live-restatement.md):
  TM mutates content during closing without a stable version signal; a crawl
  captures whatever TM happens to be serving at that instant.
- **This pipeline only writes month-end snapshots** (`v1/dates.json` entries
  are all `*-06-30`, `*-07-31`, … — no daily granularity for PY content).
  Even once July data is consistently live on TM's side, there is no
  `2026-07-31` snapshot until the July close **finishes**, which per
  `docs/month-end-closing-dates.json` history has taken 12–25 days into the
  following month for every recorded year. Expect the first PY 2026-2027 data
  point (`2026-07-31`) to land roughly through mid-to-late August, not July.

## Q3 — Is the frontend's "current Program Year" resolution correct?

Traced with an Explore subagent (full paths verified):

- `frontend/src/hooks/useDefaultProgramYear.ts:28-43` derives the default PY
  from `getAvailableProgramYears(data.dates)[0]` — the newest PY with a real
  snapshot — not the calendar. With the dates index maxing out at
  `2026-06-30`, this correctly resolves to **2025-2026**.
- `frontend/src/hooks/useProgramYearControls.ts:79-99` and
  `frontend/src/pages/DistrictTrendsPage.tsx:64-93` self-heal any stale
  `?py=` URL param back to `availableProgramYears[0]`.
- `frontend/src/components/ProgramYearSelector.tsx:156-164` only renders
  `<option>`s for years with data — **2026-2027 does not appear in the
  dropdown at all**, by design.
- This all matches the intentional fix documented in
  [`resolve-the-active-program-year-by-data-not-the-calendar.md`](../../tasks/lessons/lessons/resolve-the-active-program-year-by-data-not-the-calendar.md).
  **No bug here** — this is the collector-side lesson's frontend sibling,
  already applied correctly.

## Q4 — The one real bug found

`frontend/src/pages/HistoryPage.tsx:6-8,21,45-47`:

```ts
import { getCurrentProgramYear, formatProgramYearShort } from '../utils/programYear'
...
const currentPY = getCurrentProgramYear()   // calendar-based, NOT data-driven
...
{formatProgramYearShort(currentPY.year)}
<span className="history-page-year-chip__live">· LIVE</span>
```

`getCurrentProgramYear()` (`frontend/src/utils/programYear.ts:36-51`) is
pure `new Date()` arithmetic (month ≥ 7 → PY started this calendar year) —
the exact calendar-vs-data antipattern the collector-side lesson and the
snapshot-date-guard epic (`tasks/epic-snapshot-date-guard.md`) already
catalogued and fixed everywhere else. It renders a **"2026-27 · LIVE"**
chip on `/history` right now, even though:

- No page anywhere on the site has any 2026-2027 data.
- The PY selector dropdown doesn't even list 2026-2027 as an option.
- The chip is a `<span>`, not a link — clicking it does nothing.

This predates the PY-selector epic (introduced in `dbf6b0c0`, well before the
data-driven-default work in `e42675be`/`089c2f0a`/`cc6a19eb`) and was never
swept up by it. It's the one surface on the site that visually "announces" PY
2026-2027 while every other page silently and correctly stays on 2025-2026 —
plausibly the exact thing a user notices and reads as "not showing the
current Program Year."

## Recommendation

Not a data-freshness bug, not a CDN bug. One small frontend fix warranted:
`HistoryPage.tsx`'s "current/LIVE" chip should source its year from the same
data-driven default (`useDefaultProgramYear`) as the rest of the site, or be
relabeled to something like "2026-27 (starts here once data lands)" so it
doesn't imply live content that doesn't exist. Small, single-file,
`useDefaultProgramYear` already exists — Lightweight DoD scope.

## Evidence trail

- `curl --compressed https://cdn.taverns.red/v1/latest.json`
- `gsutil ls gs://toast-stats-data-staging/{raw-csv,snapshots}/`
- `gsutil ls gs://toast-stats-data-ca/{raw-csv,snapshots}/`
- `gsutil cat gs://toast-stats-data-staging/raw-csv/2026-07-26/metadata.json`
- `gsutil cat gs://toast-stats-data-staging/raw-csv/2026-07-26/district-61/district-performance.csv`
- `curl "https://dashboards.toastmasters.org/export.aspx?type=CSV&report=districtperformance~61~~~2026-2027"`
- `.github/workflows/data-pipeline.yml:88,1632-1661` (bucket roles, promotion, CDN invalidation)
- `frontend/src/hooks/useDefaultProgramYear.ts`, `useProgramYearControls.ts`,
  `components/ProgramYearSelector.tsx`, `pages/HistoryPage.tsx`,
  `utils/programYear.ts`
- Related lessons: `tasks/lessons/lessons/resolve-the-active-program-year-by-data-not-the-calendar.md`,
  `tasks/epic-snapshot-date-guard.md`,
  `docs/investigations/2026-07-09-district44-stale-vs-live-restatement.md`
