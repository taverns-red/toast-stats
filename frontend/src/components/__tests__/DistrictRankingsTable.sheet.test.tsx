import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/useTierColumnVisibility', () => ({
  useTierColumnVisibility: vi.fn(() => ({
    visibility: {},
    shownCount: 0,
    totalCount: 0,
  })),
}))

import { DistrictRankingsTable } from '../DistrictRankingsTable'
import { useTierColumnVisibility } from '../../hooks/useTierColumnVisibility'

/* The phone's full-table sheet shows every column and has no Columns menu, so
   it has no column choice to track: it must not run the visibility hook (a
   localStorage read and a breakpoint subscription per open) or build the
   "N of M shown" hint it never renders. */

const props = {
  rows: [],
  sort: { field: null, direction: 'asc' as const },
  onSort: () => {},
  emptyState: <p>No districts</p>,
  isMyDistrict: () => false,
  setMyDistrict: () => {},
  competitiveAwards: null,
  clubGrowthHeld: new Map(),
}

const renderTable = (variant: 'page' | 'sheet') =>
  render(
    <MemoryRouter>
      <DistrictRankingsTable {...props} variant={variant} />
    </MemoryRouter>
  )

describe('DistrictRankingsTable sheet variant (#2694)', () => {
  beforeEach(() => {
    vi.mocked(useTierColumnVisibility).mockClear()
  })

  it('does not track column visibility in the sheet', () => {
    renderTable('sheet')
    expect(useTierColumnVisibility).not.toHaveBeenCalled()
    expect(screen.getByText('No districts')).toBeInTheDocument()
  })

  it('still tracks it on the page', () => {
    renderTable('page')
    expect(useTierColumnVisibility).toHaveBeenCalled()
  })
})
