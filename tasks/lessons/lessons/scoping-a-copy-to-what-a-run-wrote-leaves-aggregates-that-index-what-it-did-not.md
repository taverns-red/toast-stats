---
date: 2026-10-12
tier: lesson
summary: Scoping a copy to what a run wrote is not enough — aggregate objects index state the run did not write, so they hold with any held part and must not reference anything the destination lacks
tags: [gcs, data-pipeline, promotion, gates, indexes]
---

# Scoping a copy to what a run wrote leaves aggregates that index what it did not

**Date:** 2026-10-12
**Issue:** #1763 (ADR-015 step 5, scoped promotion)

## What happened

Scoped promotion replaces the whole-prefix rsync with "copy the run
manifest's objects for the dates the gates passed". The issue's acceptance
test read "one date held ⇒ only the other date reaches prod; `v1/` and
`config/` are copied". Designing it showed the second half is unsafe:
`v1/dates.json`, `v1/rankings.json`, `config/district-snapshot-index.json` and
`time-series/` are computed over **every staged date**, the held one
included. Copying them ships the held date's values (time-series points,
rankings) and, for a date prod never had, an index entry pointing at a
directory that is not there.

The same hole opens with no hold at all: a date an earlier run left held is
still in staging's index, so today's clean run would promote an index that
names it. Whole-prefix rsync hid this by copying the referents too — which
is exactly the unread-data problem (D-11) scoping exists to fix.

## The transferable principle

When you narrow a copy from "everything" to "what this run touched", split
the touched objects into **leaf** objects (scoped to one key, safe to copy
alone) and **aggregates** (computed over the whole source). Aggregates are
all-or-nothing with respect to every held key, and must be checked for
references the destination cannot satisfy before they are copied — then
copied last, after their referents (R15).

## How it is enforced here

`scripts/lib/manifestPromotion.ts`: globals hold when any date is held, and
when staging's `v1/dates.json`/`latest.json` names a date prod lacks and the
run does not promote; the entry points go in the final `cp`. Pinned by
`manifestPromotion.test.ts` and the two-bucket shim test
`promoteRunManifest.test.ts`.
