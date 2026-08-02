# #820 evaluation: shared table primitive vs. TanStack Table

**Date:** 2026-05-27 · read-only spike, no code changed · ref `docs/design/table-ux-review-2026-05-27.md`
**Trigger:** operator leaning toward adopting TanStack Table (option B) for the table program.

---

## The decisive finding: the two tables share ZERO code

#820 was framed as "extract a shared primitive between the district landing table and
the club table." The inventory kills that framing:

|                | Club table (+ infra)                                                                                                               | Landing rankings table                                     | Shared       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------ |
| Implementation | ~1,940 LoC (`ClubsTable.tsx` + `useColumnFilters` + `columnFilterUtils` + `ColumnHeader` + filter components + #834 column-groups) | ~260 LoC bespoke `<th>`/`<td>` JSX in `DistrictsPage.tsx`  | **0 LoC**    |
| Column model   | `COLUMN_CONFIGS` array, 13 cols (`filters/types.ts:146`)                                                                           | hardcoded JSX                                              | none         |
| Sorting        | `SortField`+dir, switch comparator (`ClubsTable.tsx:209`)                                                                          | `sortBy` enum, inline comparator (`DistrictsPage.tsx:250`) | pattern only |
| Filtering      | full pipeline, drawer, 3 filter types (~1,440 LoC)                                                                                 | region select + global search (~60 LoC)                    | none         |
| Sticky         | semantic `STICKY_COLUMN_FIELD='name'`                                                                                              | CSS `left:0 / left:200px`                                  | none         |
| Card view      | `ClubCard` at <640                                                                                                                 | none                                                       | none         |

Epic A rebuilt the two tables **separately**, not onto a common model. So a bespoke
**shared** primitive (#820's original "option A") is **not justified** — R6 (verify real
overlap before abstracting): the overlap is essentially nil, and the two surfaces have
very different jobs (rankings = simple read-only scan; club = filter-heavy, growing
column set). Forcing a shared component would be a textbook premature abstraction.

## TanStack Table fit (option B)

TanStack Table v8: headless, framework-agnostic core + React adapter, **MIT**, maintained
by the same org as the **TanStack Query already in our stack**, ~**9–15 KB gzip**
(`@tanstack/react-table`). Passes the ron-sa dependency gate easily (maintained, MIT,
right-sized, replaces >100 LoC of logic we'd otherwise own forever).

**What it natively provides (and we currently hand-roll on the club table):**

- ✅ Column model (`columnDef` / `createColumnHelper`) — replaces `COLUMN_CONFIGS` plumbing
- ✅ Sorting (state + comparators) — replaces the switch comparator
- ✅ **Column visibility** — this is _exactly_ what the in-flight #834 hand-rolls (a
  `columnVisibility` state + persistence). TanStack gives it for free.
- ✅ Column sizing, **column pinning** (sticky) — replaces ad-hoc CSS sticky
- ✅ Faceted filtering helpers (`getFacetedRowModel` / `getFacetedUniqueValues` /
  `getFacetedMinMaxValues`) — can power our count badges / quick-filter counts
- ✅ Grouping/aggregation (column groups for headers)

**What we still own (headless = no UI):**

- Filter **UI** (the Filters drawer, Text/Numeric/Categorical components, quick-filter
  row) — preserved; only the filter _state shape_ re-points at TanStack's filter state
- Card view (<640), CSV export, search box, row click-through
- The responsive **breakpoint→hide** logic from Epic A (TanStack gives the visibility
  _state_; we still map breakpoints to it)

## The reframed recommendation

**Adopt TanStack Table for the CLUB table only. Do not build a shared primitive. Do not
migrate the rankings table.**

- **Club table:** TanStack removes/absorbs the column-model + sort + sizing + pinning
  plumbing **and the entire #834 visibility/groups mechanism**, and makes #795's delta
  columns trivial (just more `columnDef`s in a "Changes" group). Net ~40–50% reduction of
  the club table's _structural_ (non-filter) code; the filter UI is preserved.
- **Rankings table:** ~260 LoC of simple bespoke JSX, 0 shared surface, read-only, not
  growing. Migrating it is churn with ~0 benefit (and would re-touch Epic A's work for
  nothing). **Leave it bespoke.**

This is the honest reading of #820: the answer is "neither extract a shared primitive nor
keep hand-rolling — adopt a library, scoped to where the complexity actually lives."

## Sequencing consequence (why holding #834 was right)

#834 (C1) is hand-rolling `columnVisibility` + a groups menu + localStorage persistence —
the precise thing TanStack provides. Merging it adds bespoke plumbing we'd immediately
re-point. Recommended Epic C re-sequence:

1. **Adopt TanStack on the club table** (migrate column model + sort + sizing + pinning;
   keep the filter pipeline/drawer; keep card view). _New first sprint._
2. **Column groups on TanStack visibility** — rebuild #834's group toggle on
   `columnVisibility`; the menu UI + persistence survive, the bespoke plumbing is dropped.
3. **#795 delta columns** as a "Changes" column group — now trivial.

#834 disposition: **don't merge as-is.** Re-scope it to step 2 (keep its UI/persistence
commits, drop the bespoke visibility state). Its branch is preserved on origin.

## Migration cost / risk (honest)

- **Re-touches Epic A's club-table column/sort work** (just shipped) — that plumbing gets
  replaced by TanStack. A's _responsive card view_ and the _filter pipeline/drawer_ (Epic
  B) largely survive. So it's a partial redo of A, not B.
- **New dependency** — low risk (MIT, TanStack org, ~9–15 KB, mirrors TanStack Query).
- **Learning/consistency** — one table on TanStack, one bespoke. Acceptable given the
  rankings table is trivial; documented in the ADR so it's a deliberate split, not drift.
- **ADR-006** (column-model standard) should be updated / superseded to record "club table
  = TanStack; rankings = bespoke" as the standard.

## Decisions to confirm

1. Adopt TanStack Table — **club table only** (recommended) vs. both vs. don't adopt.
2. Re-sequence Epic C to **adopt-first → groups on TanStack → delta columns**, and
   **re-scope #834** (don't merge bespoke) vs. merge #834 then adopt later.

## Sources

- [@tanstack/react-table — Bundlephobia](https://bundlephobia.com/package/@tanstack/react-table)
- [TanStack Table v8 — Introduction](https://tanstack.com/table/v8/docs/introduction)
- [TanStack Table V9 roadmap (smaller core)](https://github.com/TanStack/table/discussions/5270)
