---
date: 2026-05-22
tier: lesson
summary: Presentational extraction: override classes, don't invent variants
tags: [frontend, react, css]
legacy_id: "077"
---

# Lesson 77 — Presentational extraction: override classes, don't invent variants

**Date:** 2026-05-22
**Issue:** #522 (extract `<DistrictChipAndName>` reusable component)

## What happened

#520 fixed a bug where `DistrictsPage` rendered `D86` followed by a
bare `86` (TI CSVs set `districtName === districtId` for many
districts; the chip already conveys the number). #522 was the
follow-up to remove the same latent bug from two more places:

- `RegionPage` district table
- `DistrictsPage` search-suggestion dropdown
- `CommandPalette` results

All three render `D{id}` + name, but each surface styles its chip
differently:

| Site                       | Chip CSS class                              | Visual                             |
| -------------------------- | ------------------------------------------- | ---------------------------------- |
| Rankings table row         | `.districts-rankings-table__district-chip`  | Full pill with border + background |
| Search suggestion dropdown | `.districts-toolbar__search-suggestion-num` | Bold colored text only             |
| Command palette result     | `.command-palette__result-num`              | Bold colored text only             |

The temptation was to introduce a `variant: 'pill' | 'inline'` prop
and let the component pick the right CSS internally. **That's a
design decision dressed up as a refactor.** A `variant` taxonomy
freezes a vocabulary you don't yet know is right — "pill" vs
"inline" might not survive the next surface (e.g. an upcoming
sidebar widget might want neither). It also _hides_ the per-site
CSS, so future readers can't tell what styles each surface uses
without diving into the component.

The simpler shape: `chipClassName?: string` and
`nameClassName?: string` props, with sensible defaults for the
canonical (rankings-table) usage. Each call site passes its existing
class string. Visuals stay byte-identical, and the visible diff at
each call site is a 1:1 replacement.

## How to apply

**Rule:** when a presentational component lives in N visually-distinct
surfaces, accept className overrides as props, not a variant enum:

```tsx
<DistrictChipAndName
  districtId={s.districtId}
  name={s.districtName}
  chipClassName="districts-toolbar__search-suggestion-num" // ← site's own class
  nameClassName="districts-toolbar__search-suggestion-name"
/>
```

Reach for `variant` only when:

1. There are ≥3 surfaces, AND
2. The visual treatments fall into a small fixed taxonomy already
   named elsewhere in the codebase (e.g. button variants), AND
3. The taxonomy is unlikely to grow.

Until then, the className-prop shape keeps the refactor's blast
radius small. The next refactor PR can introduce a `variant` enum
once the right groupings are obvious from repeated patterns — not
guessed in advance.

## Why

- **Refactor PRs should not change visuals.** A variant enum forces
  a design decision (which sites are "pill"? which are "inline"?
  what about hybrids?). className overrides preserve the existing
  visual exactly.
- **Visibility.** With class overrides, every call site shows its
  own class in the JSX. With a variant prop, you have to jump into
  the component to learn what `variant="inline"` means.
- **Reversibility.** Adding a `variant` later is easy when the
  surfaces are already known. Removing it after callers depend on
  it is harder.

## Telltale signs the variant taxonomy is the wrong shape

- The variant names ("pill" / "inline" / "compact") describe visuals,
  not roles. Role-shaped names ("primary" / "secondary" / "destructive")
  are usually fine; visual-shaped names usually fight reality.
- You're adding a variant in the same PR that introduces the
  component. Wait for the second consumer to ask for the variant
  before defining it.
- The component file grows a `switch (variant)` for class selection.
  That's the smell — the component now owns design decisions.

## What "default class" means here

`DistrictChipAndName` defaults to:

- `chipClassName ?? 'districts-rankings-table__district-chip'`
- `nameClassName ?? 'ml-3 text-sm font-medium text-gray-900'`

These defaults are the **canonical** use (the rankings table — the
most common, most chrome-heavy site). New consumers that fit the
canonical shape can omit both props. Consumers with their own
treatment pass both. There is no "no chip class" fallback because
every consumer wants _some_ class on the chip.

## Related

- `frontend/src/components/DistrictChipAndName.tsx` — the component.
- `frontend/src/utils/districtName.ts` — the `hasDescriptiveName`
  helper, extracted at the same time so the suppression rule has
  a single home.
- #520 — the original bug fix (DistrictsPage main table only).
- Lesson 71 — "right-sized audit scope" sibling pattern. Same
  discipline applied to a contrast audit.
