---
date: 2026-10-12
tier: lesson
category: lesson
summary: A TI export that passes the header check can still have zero rows (e.g. a past PY's districtsummary with the as-of slot filled), so a list resolver must require at least one row, and an empty body only means "no data" when it is truly empty
tags: [collector-cli, data-pipeline, silent-failure, ti-endpoints, validation]
---

# A valid header is not data: require a row before trusting a TI export

**Date:** 2026-10-12
**Issue:** #1802 (education ledger history backfill)

## What happened

To find each past program year's districts, I probed the year-end
districtsummary. With the as-of slot set to the PY end
(`districtsummary~6/30/2009~6/30/2009~2008-2009`), TI returned HTTP 200 and a
body that `isValidDistrictSummaryCsv` accepts: the `DISTRICT` header plus a
footer, and zero rows. With the as-of slot left empty
(`districtsummary~6/30/2009~~2008-2009`), the same request returned all 82
districts. A resolver that checked only the header would have backfilled
2008-09 for no districts, and the run would have been green.

The ledger has the opposite case. A 0-byte body is TI's real answer for "this
district did not exist that year", while a non-empty body with no table
(an error page) is not.

## The takeaway

Every TI export has three different "nothing" shapes, and only one of them is
data:

- **Truly empty body:** an answer ("did not exist"). Record it explicitly.
- **Header and no rows:** usually the wrong URL form for that endpoint. Fail
  closed.
- **Non-empty body that isn't the expected table or CSV:** an error page or
  layout drift. Fail closed.

A header check proves the endpoint answered in the right format. It does not
prove the answer has content. Require at least one row wherever an empty list
would be published as fact.

## How to apply

- When you resolve a list from a TI export (districts, clubs), treat
  `ids.length === 0` as an error. See `districtsFromSummary` in
  `EducationLedgerHistory.ts`.
- When you parse a report, separate `html.trim() === ''` (empty) from "no
  table" (throw). See `parseEducationLedgerByMonth`.
- When you add a new URL form, probe it once and count the rows. Do not stop
  at the status code or the header.

Related: #1669 (rescrape `accept` hook: a body for the wrong as-of with zero
rows), #1284 (a 200 error page is not valid data).
