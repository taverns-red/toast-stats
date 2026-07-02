# Diagnosis: Daily pipeline fails at the July program-year rollover

**Run:** [28578664669](https://github.com/taverns-red/toast-stats/actions/runs/28578664669/job/84781082984) (workflow_dispatch, 2026-07-02, target date 2026-07-01)
**Symptom:** `[daily] Discover districts` → `TypeError: Cannot read properties of undefined (reading 'replace')`, exit 1.

## Root cause

`2026-07-01` is day 1 of program year **2026-2027**. Toastmasters has **not published the 2026-2027 dashboard yet** — that path 302-redirects to `/error.aspx`.

Everything downstream assumes the calendar program year is the one with live data. It isn't. TM's data rollover lags the calendar:

- `https://.../2026-2027/export.aspx?...districtsummary~7/1/2026~~2026-2027` → **302 → error page (HTML)**
- `https://.../2025-2026/export.aspx?...districtsummary~7/1/2026~~2025-2026` → **valid CSV**, footer: `Month of Jun, As of 07/01/2026`

**Domain rule (from Ron):** June's month-end closing keeps updating into late July and belongs to PY 2025-2026. Stay on 2025-2026 until the close completes and TM publishes real July data, then switch to 2026-2027. The June→July boundary is the _only_ month-close that also crosses a program-year boundary, so the existing within-year closing-period system (#278/#309) never had to handle it.

## Two defects

### 1. Program-year selection is calendar-based, not data-based

`calculateProgramYear(date)` (`packages/collector-cli/src/utils/CachePaths.ts:34`) returns `2026-2027` for any July date. Every fetch site trusts it:

- `CollectorOrchestrator.ts:309` — all-districts scrape
- `CollectorOrchestrator.ts:415` — per-district scrape
- `CollectorOrchestrator.ts:760` — (report build)
- `.github/workflows/data-pipeline.yml:187` — daily district discovery (inline node)
- `.github/workflows/data-pipeline.yml:797` — rescrape district discovery (inline node, duplicate)

Because `fetch()`/curl follow the 302 to a 200 HTML error page, the download **succeeds with HTML content** — it does not throw. So a fallback must **validate that the content is a real districtsummary CSV**, not merely catch an error.

### 2. The discovery node one-liner crashes cryptically on non-CSV input

`.github/workflows/data-pipeline.yml:196-206` (and 806-816): when the body is HTML, `headers.indexOf('DISTRICT')` returns `-1`, so `line.split(',')[-1]` is `undefined` and `.replace()` throws — bypassing the intended `if [ -z "$DISTRICTS" ]` guard. It should validate `col !== -1` and fail with the clear message.

## Fix (aligns with existing closing-period architecture)

**Resolve the _active_ program year by probing, then let the existing footer remap date the snapshot.** When we fetch PY 2025-2026 during the window, the footer already says `Month of Jun`, so the #278/#309 closing-period remap dates the snapshot as the June close — no duplicate, no mislabel. Self-healing: the day TM publishes 2026-2027 (footer flips to `Month of Jul`), the calendar-PY fetch validates and the pipeline switches automatically.

### Plan

1. **Add `resolveActiveProgramYear` / content validation helper** (collector-cli `utils`): given a date + a fetch function, try `calculateProgramYear(date)`; if the returned body isn't a valid districtsummary CSV, fall back to `getPriorProgramYear(...)`; if neither validates, throw a clear error. Pure-ish, unit-testable with fixtures (valid CSV, HTML error page, empty).
   - **TDD:** fixture of the real 302/HTML error body + the real prior-PY CSV → assert it resolves to the prior PY and returns its content.
2. **Wire it into `scrapeAllDistricts`** (the real data path) so the resolved PY is used for the all-districts fetch and threaded to per-district fetches (L415) and report build (L760) — resolve once per run, don't recompute per site.
3. **Harden + fix the workflow discovery blocks** (L187–212, L797–822): validate `col !== -1` in the node parser (clean failure, not TypeError) **and** add the same prior-PY fallback so discovery finds districts during the window. Prefer factoring the two duplicated blocks.
4. **Verify** against captured real CSV pairs (synthetic fixtures validate code; a captured real pair validates the policy — see lesson `synthetic-fixtures-validate-...`). Confirm the snapshot dates as June close, not July 1.

### Notes / risks

- Don't change `calculateProgramYear`'s global semantics — it's used for cache paths and historical logic where the calendar label is correct. The fix is localized to the _fetch/discovery_ path.
- Confirm the closing-period footer parser flags `isClosingPeriod` for the prior-PY July fetch so the snapshot-date remap actually fires (the whole correctness of the fallback rests on this).
- The freshness monitor may legitimately show "stale" during the gap (no new data exists) — expected, not a regression.
