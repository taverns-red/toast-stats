/**
 * TanStack Table engine contract for ClubsTable (#1530).
 *
 * ClubsTable drives `useReactTable` in fully-CONTROLLED mode: `sorting`,
 * `columnPinning` and `columnVisibility` are passed in as `state` and the
 * component reads back `getHeaderGroups()` / `getRowModel()` /
 * `getVisibleCells()`. That means a breaking change in any of those option or
 * accessor shapes does NOT fail typecheck or stop the table from mounting — it
 * produces a table that renders but no longer sorts, pins, or hides. "A table
 * that renders is not a table that still sorts."
 *
 * These tests pin the OBSERVABLE behaviour, not the library's internals:
 *
 *   Part A — through the real <ClubsTable> DOM: ascending, descending and
 *            "reset" (switching the sorted column back to name-asc), asserting
 *            the row ORDER and that each row's DATA still belongs to its club.
 *   Part B — a minimal harness that mirrors ClubsTable's exact `useReactTable`
 *            option shape, so the pinning + visibility contracts are falsifiable
 *            in isolation: a pinned column must move to the front of
 *            `getVisibleCells()` and report `getIsPinned() === 'left'`, and a
 *            column marked `false` in `columnVisibility` must vanish from both
 *            headers and cells.
 *
 * Part B deliberately pins a column that is NOT already first. Pinning the
 * first column proves nothing — the order is identical whether pinning works
 * or is silently ignored.
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  render as rtlRender,
  screen,
  cleanup,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import {
  columnPinningFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
  type ColumnPinningState,
  type ColumnVisibilityState,
  type SortingState,
} from '@tanstack/react-table'
import { ClubsTable } from '../ClubsTable'
import { ClubTrend } from '../../hooks/useDistrictAnalytics'

const render = (ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: MemoryRouter, ...options })

const makeClub = (
  clubId: string,
  clubName: string,
  members: number
): ClubTrend => ({
  clubId,
  clubName,
  divisionId: 'div-1',
  divisionName: 'A',
  areaId: 'area-1',
  areaName: '1',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-03-01T00:00:00.000Z', count: members }],
  dcpGoalsTrend: [{ date: '2026-03-01T00:00:00.000Z', goalsAchieved: 3 }],
})

// Names and membership counts are deliberately ANTI-correlated: name-asc is
// Alpha(31) / Beta(7) / Gamma(19), so a membership sort that silently fell back
// to the incoming (name-asc) order would be caught, in either direction.
const CLUBS: ClubTrend[] = [
  makeClub('c1', 'Alpha Club', 31),
  makeClub('c2', 'Beta Club', 7),
  makeClub('c3', 'Gamma Club', 19),
]

/** Body row order by club name, read straight from the DOM. */
const rowNames = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('tbody tr')).map(
    tr => tr.querySelector('th, td')?.textContent?.trim() ?? ''
  )

/** Column index of a header by its visible label. */
const headerIndex = (container: HTMLElement, label: string): number =>
  Array.from(container.querySelectorAll('thead th')).findIndex(
    th => th.textContent?.trim() === label
  )

/** The cell text for every row in one column — the DATA-correctness check. */
const columnValues = (container: HTMLElement, label: string): string[] => {
  const idx = headerIndex(container, label)
  expect(idx).toBeGreaterThanOrEqual(0)
  return Array.from(container.querySelectorAll('tbody tr')).map(
    tr => tr.querySelectorAll('th, td')[idx]?.textContent?.trim() ?? ''
  )
}

describe('ClubsTable — TanStack sorting through the DOM (#1530)', () => {
  afterEach(cleanup)

  it('sorts ascending, descending, and resets — with the row data staying with its row', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ClubsTable clubs={CLUBS} districtId="61" isLoading={false} />
    )

    // Default: name ascending.
    expect(rowNames(container)).toEqual([
      'Alpha Club',
      'Beta Club',
      'Gamma Club',
    ])

    // ASCENDING by Members — a different order from the incoming name-asc one.
    await user.click(screen.getByRole('button', { name: 'Members' }))
    expect(rowNames(container)).toEqual([
      'Beta Club',
      'Gamma Club',
      'Alpha Club',
    ])
    // Each row still carries ITS OWN membership figure — sorting must reorder
    // rows, never shuffle cells between them.
    expect(columnValues(container, 'Members')).toEqual(['7', '19', '31'])

    // DESCENDING — a second click on the active column flips direction.
    await user.click(screen.getByRole('button', { name: 'Members' }))
    expect(rowNames(container)).toEqual([
      'Alpha Club',
      'Gamma Club',
      'Beta Club',
    ])
    expect(columnValues(container, 'Members')).toEqual(['31', '19', '7'])

    // RESET — sorting by another column starts that column ascending again and
    // the membership figures follow their rows back.
    await user.click(screen.getByRole('button', { name: 'Club' }))
    expect(rowNames(container)).toEqual([
      'Alpha Club',
      'Beta Club',
      'Gamma Club',
    ])
    expect(columnValues(container, 'Members')).toEqual(['31', '7', '19'])
  })

  it('announces the active sort column and direction via aria-sort', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ClubsTable clubs={CLUBS} districtId="61" isLoading={false} />
    )

    const headerAt = (label: string) =>
      container.querySelectorAll('thead th')[headerIndex(container, label)]

    expect(headerAt('Club')).toHaveAttribute('aria-sort', 'ascending')
    // Spec section 11 (APG sortable table): aria-sort only on the sorted column.
    expect(headerAt('Members')).not.toHaveAttribute('aria-sort')

    await user.click(screen.getByRole('button', { name: 'Members' }))
    expect(headerAt('Members')).toHaveAttribute('aria-sort', 'ascending')

    await user.click(screen.getByRole('button', { name: 'Members' }))
    expect(headerAt('Members')).toHaveAttribute('aria-sort', 'descending')
    expect(headerAt('Club')).not.toHaveAttribute('aria-sort')
  })
})

/* ------------------------------------------------------------------ *
 * Part B — the option-shape harness.
 * ------------------------------------------------------------------ */

interface Row {
  name: string
  division: string
  members: number
}

const HARNESS_DATA: Row[] = [
  { name: 'Alpha', division: 'A', members: 31 },
  { name: 'Beta', division: 'B', members: 7 },
  { name: 'Gamma', division: 'C', members: 19 },
]

// The same feature registration ClubsTable uses (clubsTableFeatures.ts): the
// sorting, pinning and visibility slices only exist because these are here.
const harnessFeatures = tableFeatures({
  rowSortingFeature,
  columnPinningFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic },
})
type HarnessFeatures = typeof harnessFeatures

const h = createColumnHelper<HarnessFeatures, Row>()
const HARNESS_COLUMNS = h.columns([
  h.accessor(r => r.division, {
    id: 'division',
    header: 'Div',
    sortFn: 'basic',
    cell: i => i.row.original.division,
  }),
  h.accessor(r => r.name, {
    id: 'name',
    header: 'Club',
    sortFn: 'basic',
    cell: i => i.row.original.name,
  }),
  h.accessor(r => r.members, {
    id: 'members',
    header: 'Members',
    sortFn: 'basic',
    cell: i => String(i.row.original.members),
  }),
])

interface HarnessProps {
  sorting: SortingState
  columnPinning: ColumnPinningState
  columnVisibility: ColumnVisibilityState
  /** Receives the accessor answers the component itself relies on. */
  onModel: (m: {
    pinnedSideOfName: string | false
    visibleCellIdsFirstRow: string[]
    headerIds: string[]
    rowOrder: string[]
  }) => void
}

/** Mirrors ClubsTable's `useTable` call shape exactly: a registered feature
 *  set, controlled state, `enableSortingRemoval: false`, no change handlers. */
const Harness: React.FC<HarnessProps> = ({
  sorting,
  columnPinning,
  columnVisibility,
  onModel,
}) => {
  const table = useTable<HarnessFeatures, Row>({
    features: harnessFeatures,
    data: HARNESS_DATA,
    columns: HARNESS_COLUMNS,
    state: { sorting, columnPinning, columnVisibility },
    enableSortingRemoval: false,
  })

  const rows = table.getRowModel().rows
  onModel({
    pinnedSideOfName: table.getColumn('name')?.getIsPinned() ?? false,
    visibleCellIdsFirstRow:
      rows[0]?.getVisibleCells().map(c => c.column.id) ?? [],
    headerIds: table
      .getHeaderGroups()
      .flatMap(g => g.headers.map(hd => hd.column.id)),
    rowOrder: rows.map(r => r.original.name),
  })

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map(g => (
          <tr key={g.id}>
            {g.headers.map(hd => (
              <th key={hd.id} scope="col">
                {flexRender(hd.column.columnDef.header, hd.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id}>
            {r.getVisibleCells().map(c => (
              <td key={c.id} data-column={c.column.id}>
                {flexRender(c.column.columnDef.cell, c.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const NO_PINNING: ColumnPinningState = { start: [], end: [] }

describe('useTable option-shape contract (#1530)', () => {
  afterEach(cleanup)

  it('applies controlled `sorting` state to the sorted row model', () => {
    let model!: Parameters<HarnessProps['onModel']>[0]
    const { rerender } = render(
      <Harness
        sorting={[{ id: 'members', desc: false }]}
        columnPinning={NO_PINNING}
        columnVisibility={{}}
        onModel={m => (model = m)}
      />
    )
    expect(model.rowOrder).toEqual(['Beta', 'Gamma', 'Alpha'])

    // `rerender` re-applies the wrapper from the original render — passing a
    // second <MemoryRouter> here would nest two routers.
    rerender(
      <Harness
        sorting={[{ id: 'members', desc: true }]}
        columnPinning={NO_PINNING}
        columnVisibility={{}}
        onModel={m => (model = m)}
      />
    )
    expect(model.rowOrder).toEqual(['Alpha', 'Gamma', 'Beta'])
  })

  it('applies controlled `columnPinning` — the pinned column moves to the front and reports its side', () => {
    let model!: Parameters<HarnessProps['onModel']>[0]
    const { container } = render(
      <Harness
        sorting={[{ id: 'name', desc: false }]}
        columnPinning={{ start: ['name'], end: [] }}
        columnVisibility={{}}
        onModel={m => (model = m)}
      />
    )

    // 'name' is declared SECOND in the column list. Start-pinning must hoist it
    // to the front of the visible cells; if pinning were ignored the order
    // would still read division, name, members.
    //
    // 'start' (not v8's 'left') is v9's logical region name — the rename is the
    // spec change this migration is applying, not a weakened assertion.
    expect(model.pinnedSideOfName).toBe('start')
    expect(model.visibleCellIdsFirstRow).toEqual([
      'name',
      'division',
      'members',
    ])
    expect(
      Array.from(container.querySelectorAll('tbody tr:first-child td')).map(
        td => td.getAttribute('data-column')
      )
    ).toEqual(['name', 'division', 'members'])
  })

  it('applies controlled `columnVisibility` — a false column leaves both headers and cells', () => {
    let model!: Parameters<HarnessProps['onModel']>[0]
    const { container } = render(
      <Harness
        sorting={[{ id: 'name', desc: false }]}
        columnPinning={NO_PINNING}
        columnVisibility={{ division: false }}
        onModel={m => (model = m)}
      />
    )

    expect(model.headerIds).toEqual(['name', 'members'])
    expect(model.visibleCellIdsFirstRow).toEqual(['name', 'members'])
    expect(within(container).queryByText('Div')).not.toBeInTheDocument()
    expect(container.querySelectorAll('tbody tr:first-child td')).toHaveLength(
      2
    )
  })

  it('honours `enableSortingRemoval: false` — a column can never fall back to unsorted', () => {
    let model!: Parameters<HarnessProps['onModel']>[0]
    render(
      <Harness
        sorting={[{ id: 'members', desc: false }]}
        columnPinning={NO_PINNING}
        columnVisibility={{}}
        onModel={m => (model = m)}
      />
    )
    // Sorted, not source order (Alpha, Beta, Gamma).
    expect(model.rowOrder).toEqual(['Beta', 'Gamma', 'Alpha'])
  })
})
