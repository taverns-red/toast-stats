---
date: 2026-08-22
tier: lesson
summary: Read-time normalization only ever widens what matches, but write-time canonicalization changes the bytes every derived index is keyed on — so the write half of an identity fix needs a census of everything derived from that field, and the read half needs none
tags:
  [
    identity,
    normalization,
    snapshots,
    pipeline,
    monorepo,
    shared-contracts,
    silent-failure,
  ]
---

# Read-time normalization is free; write-time canonicalization reshapes every derived key

**Date:** 2026-08-22
**Issue:** #1440 (three club-id conventions across eight call sites, no shared normalizer)
**Related:** Lesson 47 — a lookup that degrades to nothing renders identically to no-data

## What happened

Club numbers arrive from Toastmasters in two lexical forms — `00009905` from
one export, `9905` from another, sometimes inside a single snapshot. Eight call
sites each decided privately what "the same club" meant: the transformer stored
the raw form, the FAC merger zero-padded to 8 characters, two frontend pages
used `===`, two more used exact object-key lookups. Every mismatch degraded to
an empty state — "Club Not Found", "not in the club index", "no completed
program years" — never to an error.

The fix reads as symmetric: promote one normalizer, apply it at write time and
at read time. It is not symmetric, and the asymmetry is the lesson.

## The two halves have very different blast radii

**Read time is free.** Every read-side change only ever *widens* what matches:
a padded URL now resolves a bare stored id and vice versa. Nothing that
previously resolved stops resolving, so a read-side normalizer can be applied
site by site with no coordination and no migration.

**Write time changes bytes other things are keyed on.** The moment the
transformer canonicalizes `clubId` before it lands in a snapshot, everything
*derived* from that field inherits the new form. In this repo that meant
`config/club-index.json` — whose keys are literally `snapshot.clubs[].clubId`,
copied by an inline `node -e` script inside a GitHub Actions workflow that
cannot import the shared helper at all. Fixing only the TypeScript call sites
leaves that index keyed on the old form, generated fresh every pipeline run,
looking entirely correct.

Read-time normalization hides this: with both ends normalized, a
differently-keyed index still resolves, so no test and no user ever reports it.
The index quietly mixes key forms until something downstream keys on it exactly.

## What to do

When you canonicalize a field at write time, census every artifact **derived**
from that field before you call the fix complete — indexes, filenames, cache
keys, join keys in other services, anything that copies the value as a key.
`grep` for the field name outside the source tree too: workflows, inline
scripts, and generators are exactly where a derived key hides from the type
system.

And pin the sites together. Seven files agreeing today is not a property the
compiler enforces; the eighth site added next month gets to invent its own
convention and fail silently again. A source-scanning agreement test — one that
reads each site's real source and fails on a bare `===`, a raw `record[id]`
lookup, or a second local normalizer — is the part of this fix that survives.
