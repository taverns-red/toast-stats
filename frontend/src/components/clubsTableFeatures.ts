/**
 * The TanStack Table **v9 feature set** for the club table (#1530).
 *
 * v8 bundled every feature into `useReactTable`; v9 is modular — a feature's
 * state slice and its APIs only exist if that feature is registered here. A
 * missing feature is not a type error at the call site, it is a table that
 * silently ignores the state you hand it, so this file is the single place
 * that declares what the club table actually uses:
 *
 *   - `rowSortingFeature` + `sortedRowModel` — the controlled `sorting` slice
 *     and `getSortedRowModel()` row order (v8's `getSortedRowModel()` option).
 *   - `columnPinningFeature` — the controlled `columnPinning` slice that makes
 *     the sticky key column the model of record (ADR-006 §3).
 *   - `columnVisibilityFeature` — the controlled `columnVisibility` slice the
 *     Columns menu drives (#819, ADR-006 §4).
 *   - `columnSizingFeature` — `size` per column, `getSize()` for the colgroup
 *     and `getTotalSize()` for the table's min-width and the overflow test
 *     (#2676, spec §5.3). The widths live in `clubsColumnMeta.ts`.
 *
 * The core row model is automatic in v9; `getCoreRowModel()` is gone.
 *
 * `sortFns` registers only `basic` (v8's `sortingFn: 'basic'`, now `sortFn`).
 * Registering the whole built-in `sortFns` object would pull every comparator
 * into the bundle; every club column sorts with `basic` over a pre-normalised
 * accessor value, so one entry is the whole requirement. v9's `sortFn_basic`
 * (`a === b ? 0 : a > b ? 1 : -1`) is the same total order v8's `basic`
 * produced, and `sortUndefined` still defaults to 1 (undefined last).
 *
 * `tableMeta` is v9's per-table meta slot. It replaces the global
 * `declare module '@tanstack/react-table' { interface TableMeta ... }`
 * augmentation the v8 code used — which typed `meta` for EVERY table in the
 * app, not just this one.
 */

import {
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
} from '@tanstack/react-table'
import type { ProcessedClubTrend } from './filters/types'

/** Table-level context the column model reads via `table.options.meta`.
 *  CC-7 (#872): lets the sticky `name` cell render a real <Link> to the club
 *  detail route without turning the static `clubsColumns` array into a factory.
 *  When `clubLinkTo` is absent the cell falls back to plain text. */
export interface ClubsTableMeta {
  /** Build the club-detail href for a row (e.g. `/district/61/club/123`). */
  clubLinkTo?: (club: ProcessedClubTrend) => string
  /** Router location state to carry to the destination (e.g. fromClubsSearch). */
  clubLinkState?: unknown
}

/** Declared at module scope, never inside a component — the features object is
 *  a model input and must keep a stable identity across renders. */
export const clubsTableFeatures = tableFeatures({
  rowSortingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic },
  tableMeta: {} as ClubsTableMeta,
})

export type ClubsTableFeatures = typeof clubsTableFeatures

/**
 * The one column helper for this table. v9's `createColumnHelper` takes the
 * feature set as its first generic, so the helper has to live where the
 * features do; `clubsColumns` and `clubsDeltaColumns` share this instance.
 *
 * Always build column arrays with `clubsColumnHelper.columns([...])` rather
 * than a bare array literal. v9 pins `TValue` per column, and a plain
 * heterogeneous array (string / number / display columns side by side) widens
 * to a union that no longer satisfies the `columns` option. `columns()` is a
 * type-level identity at runtime — it returns the same array back.
 */
export const clubsColumnHelper = createColumnHelper<
  ClubsTableFeatures,
  ProcessedClubTrend
>()
