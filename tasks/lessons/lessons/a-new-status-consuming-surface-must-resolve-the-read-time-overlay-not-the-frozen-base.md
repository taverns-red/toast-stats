---
date: 2026-06-21
tier: lesson
summary: A new status-consuming surface must resolve the read-time overlay, not the frozen base
tags: [frontend, react, data-pipeline, scope, verification, accessibility]
legacy_id: "172"
---

# Lesson 172 — A new status-consuming surface must resolve the read-time overlay, not the frozen base

**Date:** 2026-06-21
**Issue:** #1230 (epic #1228 Sprint 2 — at-a-glance club grid)
**PR:** [#1237](https://github.com/taverns-red/toast-stats/pull/1237)

## What happened

The new club grid colours a tile "Suspended" (muted + struck) when the club's
operational status is suspended. The first cut keyed straight off the frozen
base field:

```ts
function isSuspended(club: ClubTrend): boolean {
  return club.clubStatus?.toLowerCase() === 'suspended' // ❌ ignores the overlay
}
```

That looked right against the type — `clubStatus` is the operational status.
But it is the **frozen base** snapshot value. Epic #1062 (#1069) added a
read-time **Dues-Renewal overlay** (`statusOverlay`) that PROMOTES a frozen
`Suspended`/`Low` club to `Active` when the daily renewal report verifies it —
and that promotion is applied **at the render site** (`ClubStatusCell` honours
`statusOverlay` before falling back to `clubStatus`), never baked into the data.

So a club the renewal report had verified would render struck-through
"Suspended" on the new grid while the **Clubs table next to it showed it
Active** — two surfaces disagreeing on the same club. A fresh-context `/review`
caught it; the unit tests (which never set `statusOverlay`) were green. The fix
honours the overlay's promote-only rule:

```ts
function isSuspended(club: ClubTrend): boolean {
  if (club.statusOverlay) return false // overlay only ever promotes to Active
  return club.clubStatus?.toLowerCase() === 'suspended'
}
```

## The transferable principle

**When a datum's _effective_ value is computed at READ time by an overlay/
resolver (not stored on the record), the set of consumers that must apply it is
OPEN — every new surface that reads the raw field silently reverts to the
pre-overlay truth.** There is no single chokepoint to protect you: the overlay
lives at the render site by design (it must not mutate the frozen base —
`#1069`/L154), so a second, third, fourth consumer each has to _remember_ to
resolve it. The raw field name reads as authoritative (L123's "a field's name
can lie" cousin), and isolated unit tests that never populate the overlay stay
green, so the divergence only shows on the live surface beside its sibling.

## How to apply

- Before reading an operational/status field on a NEW surface, grep how the
  **existing** surfaces render it (`grep -rn clubStatus src/components`). If a
  sibling pipes it through a resolver (`statusOverlay`, `resolve*Overlay`,
  `effective*`), call the same resolver — don't read the raw field.
- Better: when an overlay's consumer set is growing, extract a single
  `resolveEffectiveStatus(club)` helper and route every surface through it, so
  "apply the overlay" stops being a per-site obligation.
- Add a test that populates the overlay and asserts the new surface matches the
  sibling — the all-green isolated test is exactly the blind spot.
- This is a verification trigger: a cross-surface consistency bug is invisible
  to a single-component test and a single-component eye; fresh-context review
  (or a live side-by-side) is what catches it.

## Related

- [[154-a-never-demote-overlay-invariant-is-structural]] — the overlay this
  lesson's new consumer forgot: promote-only, never mutates the frozen base.
- [[123-totals-distinguished-counts-are-unpopulated-mid-year-count-from-clubperformance]]
  — same family: the field that reads authoritative but isn't the value you want.
- [[052-close-to-distinguished-dual-metric]] — one definition across surfaces;
  here the definition is "the overlay-resolved status," and the grid initially
  forked it.
- `frontend/src/utils/clubGridColor.ts` (`isSuspended`),
  `frontend/src/components/ClubStatusCell.tsx`,
  `frontend/src/utils/clubStatusOverlay.ts`.
