# Sprint 4 (#1323) — Branded `SnapshotDate` at the service layer

Epic #1319. Predecessor #1322 (Sprint 3) shipped divergence-by-default fixtures.
Sprint 1 already killed the ambiguous `date` field on the rankings fetch
(`asOfDate` + `snapshotDate?` now exist separately), so the brand lands on a
service layer that already names the two dates apart.

## Hypothesis

If `SnapshotDate` is nominal and minted **only** from validated snapshot
sources, then every current path that launders an _as-of_ / _synthesized_ /
_wall-clock_ date into a `snapshots/{date}/…` fetch stops compiling. The
compiler — not a reviewer, not a test — becomes the guard. Recurrence #5 of the
#1289/#1292/#1296/#1315 class becomes unrepresentable.

## Blast-radius survey (Explore agent, full map in session)

**Good news:** all five `snapshots/{date}/…` URL builders already live in
`services/cdn.ts`. The URL surface is fully centralized — nothing to corral.

Three mint sources feed the 7 entry points through exactly two hub shapes:
`effectiveDate` / `effectiveEndDate` (PY-control hooks) and `latestSnapshotDate`
(manifest, resolved inline in ~10 fetch hooks).

### Mints (the only places the brand is created)

| Mint                          | Source                                                                                          | Validates                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------- |
| `snapshotDatesFrom(index)`    | `fetchCdnDates()` → `{ dates: string[] }`, and the per-district `fetchCdnSnapshotIndex()` lists | format, per element        |
| `snapshotDateFromManifest(m)` | `v1/latest.json` → `latestSnapshotDate`                                                         | format                     |
| `toSnapshotDate(raw)`         | URL `?date=` / `?from=` / `?to=`, export API params                                             | format, real calendar date |

`asOfDate` stays plain `string` — passing one no longer compiles. That is the
whole point.

### Three call sites the brand rejects (the payoff)

- **F1 — `usePaymentsTrend.ts:248` (live latent bug).**
  `const queryEndDate = endDate ?? new Date().toISOString().split('T')[0]`
  → `useDistrictAnalytics` → `cdnAnalyticsUrl`. Today's wall-clock date is
  **never** a snapshot date, so this branch always 404s. Masked only because the
  sole caller (`DistrictTrendsPage:136`) always passes `effectiveEndDate` behind
  a `hasValidDates` gate. Same family as the epic's named `todayIso()` fallback.
  **Fix: delete the fallback, require the date.** Not a cast.

- **F2 — `csvExport.ts:511` / `useDistrictExport.ts:45`.**
  `const date = startDate || (await fetchCdnManifest()).latestSnapshotDate`.
  Manifest branch is a legitimate mint; `startDate` is a free `string` from a
  public export API with no validation. **Fix: brand the param.** (Both then read
  `snapshot.metadata?.sourceCsvDate || date` for display — correct, stays
  `string`.)

- **F3 — `useDistrictProgramYearControls.ts:140-143` — provably dead laundering.**

  ```ts
  return (
    getMostRecentDateInProgramYear(allCachedDates, effectiveProgramYear) ||
    effectiveProgramYear.endDate // ← synthesized `${year+1}-06-30`, not a snapshot
  )
  ```

  `effectiveProgramYear` is only ever an element of `availableProgramYears`, and
  `getAvailableProgramYears(dates)` derives a PY from a date iff
  `filterDatesByProgramYear` would keep that date (both use the identical
  July-boundary predicate — verified against `programYear.ts:68-97`). So when
  `effectiveProgramYear !== null`, `getMostRecentDateInProgramYear` **cannot**
  return null: the `||` branch is unreachable.
  **Fix: delete the dead fallback.** Zero behavior change.

  Deliberately NOT changed to "return null when the PY is empty" — that would be
  a real regression: a null end date makes the fetch hooks fall back to the
  manifest's latest snapshot, silently rendering the _wrong_ PY's data for a PY
  the user explicitly selected. The unreachability argument is what makes this
  safe. Same dead fallback duplicated at `DistrictTrendsPage.tsx:107`.

### Brand-preserving generics (`utils/programYear.ts`)

`filterDatesByProgramYear` and `getMostRecentDateInProgramYear` become
`<T extends string>(dates: T[], py) => T[] | T | null` so a branded array stays
branded through them. Zero-runtime. `getAvailableProgramYears`,
`isDateInProgramYear`, `getProgramYearForDate` need no change (they return
`ProgramYear` / `boolean`).

`ProgramYear.startDate` / `.endDate` stay plain `string` — they are synthesized
calendar bounds, deliberately **not** snapshot dates (that's what makes F3 fail
to compile).

## Guard mechanism — why not the obvious ones

Two obvious guards are **inert here**, both instances of Lesson 82
("present-but-inert; assert behavior, not declaration"):

1. **`@ts-expect-error` type-tests are never checked.** `tsconfig.json:43-49`
   excludes `src/**/__tests__/**/*` and `src/**/*.test.ts*` from the program, so
   `npm run typecheck` never reads a type-test file. A `@ts-expect-error` there
   asserts nothing.
2. **`*.test-d.ts` + vitest typecheck falls outside both projects.** The `unit`
   project inherits vitest's default include (`**/*.{test,spec}.?(c|m)[jt]s?(x)`),
   which does not match `.test-d.ts` — the file would silently run in no project
   (the exact R20/#482 partition hazard).

**Chosen: a type sentinel that compiles a known-bad snippet through the real
`tsconfig.json` via the TypeScript compiler API**, asserting the specific
diagnostic fires — the direct analogue of the repo's existing ESLint sentinel
(`src/__tests__/lint/set-state-in-effect.test.ts`), which lints a known-bad
snippet at a virtual `src/__sentinel__/…` path. Same virtual-path trick, same
"assert behavior" discipline, no CI wiring, no new vitest project.

Each sentinel carries a **positive control** (a minted date compiles clean), so
it cannot false-pass on an unrelated compile error — the type-level twin of
L166's value-honesty point.

## ESLint `no-restricted-syntax`

Bans `as SnapshotDate` / `<SnapshotDate>` outside `types/snapshotDate.ts`.
Note `eslint.config.js:17-20` runs `tsparser` with **no** `project`/
`projectService`, so this must be syntactic (AST selector on the type-annotation
name), not type-aware. Guarded by a `lintText` sentinel per L82 — plus a negative
control proving the mint module itself is exempt.

## TDD

1. **Red** — `snapshotDate.test.ts` (runtime mint behavior), the type sentinel
   (brand rejects `asOfDate` / raw string), the lint sentinel (cast ban fires).
2. **Green** — brand + mints; cdn.ts signatures; programYear generics; thread
   through hooks/pages; delete F1/F3 fallbacks; brand F2's param.
3. **Refactor** — `/simplify` + fresh-context `review`.

## Acceptance criteria (#1323)

- [ ] All seven `cdn.ts` per-snapshot entry points require `SnapshotDate`.
- [ ] `grep -rn "as SnapshotDate" frontend/src --include="*.ts*" | grep -v types/snapshotDate` → 0, lint-enforced.
- [ ] Type-tests + full suite + `npm run quality:check` green.
