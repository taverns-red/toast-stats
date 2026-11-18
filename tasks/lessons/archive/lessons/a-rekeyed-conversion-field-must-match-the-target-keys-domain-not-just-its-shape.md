---
date: 2026-06-10
tier: lesson
summary: A re-keyed conversion field must match the target key's DOMAIN, not just its shape
tags: [data-pipeline, analytics, monorepo, transformation, verification]
legacy_id: "156"
---

# Lesson 156 — A re-keyed conversion field must match the target key's DOMAIN, not just its shape

**Date:** 2026-06-10
**Issue:** #1120 (epic #1095 Sprint 3 — time-series club health + status corruption)
**PR:** _(record on merge)_

## What happened

`AnalyticsComputeService.convertToDistrictStatisticsInput` rebuilds raw
CSV-shaped records from the transformed `ClubStatistics` model so
`TimeSeriesDataPointBuilder` can consume them. One mapping read:

```ts
'Club Distinguished Status': club.clubStatus ?? '',
```

`clubStatus` is the **operational** status (Active / Suspended / Low /
Ineligible) — a string, so the mapping type-checked and "worked". But the
target key's domain is the distinguished tier (`'' | D | S | P | M`). Every
downstream read of that key got the wrong universe of values: the
letter-code branch of `isDistinguished` was permanently dead and the
heuristic fallback silently decided every club's distinguished flag.

The root enabler: the transformed model **had no field** carrying the true
value. `extractClubStatus()` folds the distinguished column into a mixed
legacy `status` field but only keeps word-form values
(`.includes('distinguished')`), so live letter codes were dropped at
transform time. The conversion author reached for the nearest
similarly-named field — `clubStatus` — because the faithful one didn't
exist.

## The transferable principle

**When a conversion writes a value under a domain-bearing key (a CSV
header, an API field, a schema property), verify the SOURCE field's value
domain matches the TARGET key's contract — name-similarity and
type-compatibility are exactly what make the wrong mapping look right.**
And when the faithful source doesn't exist on the intermediate model, the
fix is to add the verbatim field to the model (transform → interface →
schema → conversion), not to approximate from the nearest lookalike. A
lossy intermediate model turns every downstream consumer into a guesser.

## How to apply

- Audit re-keying conversions (model → raw-shape, DTO → DTO) by listing
  each target key's expected value set next to the source field's actual
  value set; any `?? ''` or `?? default` on a semantically different field
  is corruption, not back-compat.
- When a needed field is "missing" from an intermediate model, check
  whether the transform layer DROPS it (here: `extractClubStatus`'s
  word-form filter) before synthesizing it from a sibling (R7 spirit).
- Carry verbatim source values on the model (`distinguishedStatus`)
  separately from interpreted ones (`status`, `clubStatus`); interpretation
  belongs at the consumer, where the rule lives.

## Related

- [[115-a-fields-name-and-comment-can-lie-about-whether-its-populated]] —
  sibling failure: the name promises a domain the value doesn't deliver.
- [[061-when-fixing-a-formula-audit-every-implementation]] — the same
  epic's classification fix: one shared rule (`classifyClubHealth`) instead
  of three drifting copies.
