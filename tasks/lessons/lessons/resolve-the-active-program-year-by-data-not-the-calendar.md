---
date: 2026-07-02
tier: principle
summary: Resolve the active Toastmasters program year by probing data, not the calendar — TM's rollover lags July 1
tags: [data-pipeline, collector, program-year, closing-period, rollover, resilience]
---

# Principle — Resolve the active program year by data, not the calendar

**Date:** 2026-07-02
**Issue:** #1284 (daily pipeline failure at the July rollover)

## The failure

On 2026-07-02 the daily pipeline died at `[daily] Discover districts` with
`TypeError: Cannot read properties of undefined (reading 'replace')`. Target
date 2026-07-01 is day 1 of PY 2026-2027, which **Toastmasters had not published
yet** — its dashboard URL 302-redirects to `/error.aspx`. `curl`/`fetch` follow
the redirect to a 200 HTML page, so the fetch *succeeds* with HTML; the
discovery parser then did `headers.indexOf('DISTRICT')` → `-1` →
`line.split(',')[-1].replace(...)` → throw.

## The transferable insight

**TM's data rollover lags the calendar.** June's month-end close keeps updating
under the *prior* program year (2025-2026, footer `Month of Jun, As of
07/01/2026`) well into July; the new year has no data until TM publishes it.
`calculateProgramYear(date)` is purely calendar-based (July → new PY), so every
consumer that trusts it fetches an empty dashboard at the boundary. June→July is
the *only* month-close that also crosses a program-year boundary, which is why
the within-year closing-period system (#278/#309) never had to handle it.

Two rules fall out:

1. **A successful HTTP fetch is not proof of valid data.** When an upstream
   redirects errors to a 200 page, validate the *content* (here: the CSV header
   must contain the `DISTRICT` column), don't just check the status code or
   catch a throw.
2. **Resolve the active period by probing which one actually has data**, then
   fall back to the prior period. `resolveActiveProgramYear` tries the calendar
   PY, validates, and falls back to `getPriorProgramYear(...)`. It is
   self-healing: the day TM publishes the new year, the calendar probe validates
   and the fallback stops — no dated flag day, no manual switch. The existing
   footer-driven closing remap then dates the snapshot to the June close, so no
   duplicate/mislabelled data point is created.

## How to apply

- Keep `calculateProgramYear` calendar-pure — cache paths and history depend on
  the calendar label. Localize rollover logic to the *fetch/discovery* path
  (`resolveActiveProgramYear`, `CollectorOrchestrator.scrape`,
  `collector-cli discover-districts`).
- Resolve the active PY **once per run** and thread it through every fetch site;
  don't recompute `calculateProgramYear(date)` per site or they'll disagree.
- Validate real behaviour against a captured real pair (the HTML error body +
  the prior-year CSV), not just synthetic fixtures — see
  [[synthetic-fixtures-validate-the-code-only-a-captured-real-pair-validates-the-policy]].
