# Sprint #1230 — At-a-glance club grid (Chiclet / LEO board)

Epic #1228 Sprint 2. New deep-linkable `/district/:id/grid`: one color-coded tile per
club, grouped Division→Area. Default color = club health; URL-synced toggle to color by
Distinguished tier (`?color=health|tier`).

## Reuse (no new deps, no new computation — R7)

- Data: `useDistrictAnalytics(id, start, end).allClubs: ClubTrend[]` (same scaffold as
  DistrictDivisionsPage — program year/date via `useUrlProgramYear`).
- Health: `currentStatus: ClubHealthStatus` + `utils/clubHealthStatus.ts`
  (`getClubHealthStatusLabel/PillModifier/Icon`).
- Tier: `distinguishedLevel` on ClubTrend (already the per-club source — L123, NOT
  `totals.distinguished*`). Mirror `clubsColumns` TIER_DISPLAY/TIER_MODIFIER.
- DCP: `getLatestDcpGoals(club)` from `columnFilterUtils.ts` → `{n}/10`.
- Suspended: `clubStatus` ('Suspended'/'Low'/...).
- Link: `/district/${id}/club/${clubId}`. Legend: mirror existing chip patterns.

## Files (additive)

1. `utils/clubGridColor.ts` — PURE `getTileVisual(club, mode)` → `{ modifierClass,
signalText, signalGlyph, statusLabel }`. The unit-testable core (both modes,
   suspended, NotDistinguished). Also `parseColorMode(raw)` clamping unknown→'health'.
2. `components/ClubGridTile.tsx` — `<Link>` tile, color modifier, club name (truncated),
   secondary signal line (`{n}/10` + glyph/letter), full `aria-label` (color never sole
   signal — text+glyph+aria).
3. `pages/DistrictGridPage.tsx` — scaffold + group Division→Area, legend, `aria-pressed`
   color-mode toggle (NOT tabs — L128), URL `?color`, loading/empty.
4. `styles/components/club-grid.css` — tile + responsive grid, dark-mode; wired into
   `index.css` (L142 — no orphan stylesheet).
5. `config/districtSections.ts` — add `{ label: 'Grid', segment: 'grid' }`.
6. `App.tsx` — lazy route `district/:districtId/grid`.

## Tests (TDD, Red first)

- `utils/__tests__/clubGridColor.test.ts` — both modes × all health/tier states +
  suspended + NotDistinguished + `parseColorMode` clamps garbage→health (L124/144).
- `components/__tests__/ClubGridTile.test.tsx` — href, accessible label, non-color
  signal present, modifier class.
- `pages/__tests__/DistrictGridPage.test.tsx` (page mount → pages/**tests**, R22) —
  grouping Division→Area, `?color=tier` toggles, `?color=garbage` clamps to health,
  suspended handled.

## Verify

Dual-engine Playwright smoke on PR preview (chromium+webkit), `:visible` + route-keyed
locators (L149/152); 375/768/1280 + dark mode screenshots.
