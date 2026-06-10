---
id: '158'
category: lesson
tags: [data-pipeline, verification, scraping, collector-cli, process]
auto_load: true
date: 2026-06-10
issues: [1128, 1098]
---

# Lesson 158 — When reconstructing an upstream system's calendar, the upstream's own UI affordances are the authority; calibrate the probe on knowns and expect it to falsify your derived records

**Date:** 2026-06-10
**Issue:** #1128 (epic #1098 Sprint 1)
**PR:** _(record on merge)_

## What happened

The closing-date registry needed entries for two collection-outage months
(2026-02, 2022-04) that no raw-csv metadata could prove. The first probe
design reverse-engineered TI's export endpoint (`export.aspx`) — bisecting
asOf dates for the "last date that returns data". It calibrated cleanly on a
past program year, then produced garbage on the current one: **for the
current PY the export ignores the monthEnd segment entirely** (same sha for
different monthEnds), every asOf returns different content, and the CSV
footer that would disambiguate is stripped from HTTP exports.

The actual authority was one GET away the whole time: TI's own dashboard
month view (`district.aspx?id=61&month=N`) renders an **"As of" dropdown
whose newest option IS the month's closing date** — the upstream's own
statement of its archive calendar. Calibrated against six known registry
months: six matches, zero misses. It then answered both unknowns (2026-02 →
2026-03-05; 2022-04 → 2022-04-30, an in-month close because TI never
archived a May-2022 reconciliation) — **and falsified one of our own
committed records**: the registry's `2026-01 → 2026-02-13` (derived from the
stray metadata-less scrape) is wrong. TI's Jan list ends 02-05, and 02-13
appears in TI's **February** list — the "stray Jan closing scrape" the audit
wanted remapped to 2026-01-31 is actually a legitimately-dated February
daily. A downstream sprint's remap premise changed because the probe was
pointed at the source of truth instead of our partial archive.

## The transferable principle

**When you need an upstream system's operational metadata (closing dates,
archive windows, publication calendars), don't reconstruct it by probing
data endpoints from your own partial archive — first look for the upstream's
own UI affordance that displays it (a dropdown, an archive index, a date
picker). The UI is the system's self-description and is queryable with
trivial GETs. Calibrate the method against several values you already know
before trusting it on unknowns — and when the authoritative source
contradicts one of your derived records, the finding is bidirectional:
correct your record and re-examine every decision that was built on it.**

## How to apply

- Before designing an endpoint-bisection probe, fetch the human-facing page
  and grep for `<option>`/date-picker affordances — the metadata is often
  enumerated right there.
- Calibrate on N known values (here: 6 registry months) and demand zero
  misses before applying to unknowns; a probe validated on one PY can be
  structurally wrong on another (current-PY export ignores monthEnd).
- A record derived from your own anomalous capture (the metadata-less stray)
  ranks below the upstream's self-description. When they disagree, the
  upstream wins and the disagreement itself is evidence to surface (here:
  Sprint 2's stray-remap decision).

## Related

- [[154-synthetic-fixtures-validate-the-code-only-a-captured-real-pair-validates-the-policy]]
  — sibling: only real data falsifies assumptions; here the real data also
  falsified an already-committed record.
- [[139-a-year-end-snapshots-source-date-falls-in-july-so-a-program-year-equality-guard-drops-every-year]]
  — same family: verify the data's actual shape, not the shape you inferred.
- ADR-011 (`docs/architecture-decisions/011-closing-date-registry-committed-file-plus-drift-guard.md`)
  — records the full evidence trail.
