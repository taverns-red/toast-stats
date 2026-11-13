/**
 * RollupBreakdownTable (#1815) — one row per child block (a region's
 * districts, or the world's regions), each linking down a level.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RegionRollupsSchema } from '@taverns-red/shared-contracts'
import recorded from '../../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'
import {
  regionBreakdown,
  worldBreakdown,
} from '../../../utils/regionRollupView'
import { RollupBreakdownTable } from '../RollupBreakdownTable'

const isMobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../../hooks/useIsMobile', () => ({
  useIsMobile: () => isMobile.value,
}))

const rollups = RegionRollupsSchema.parse(recorded)

afterEach(() => {
  cleanup()
  isMobile.value = false
})

const renderTable = (rows = worldBreakdown(rollups), url = '/regions/health') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <RollupBreakdownTable
        rows={rows}
        label="Regions"
        identityHeader="Region"
      />
    </MemoryRouter>
  )

describe('RollupBreakdownTable', () => {
  it('lists every child with a link down a level', () => {
    renderTable()
    const table = screen.getByRole('table', { name: 'Regions' })
    expect(within(table).getAllByRole('row')).toHaveLength(14 + 1)
    expect(
      within(table).getByRole('link', { name: 'Region 03' })
    ).toHaveAttribute('href', '/region/03/health')
  })

  it('links districts to their district page', () => {
    renderTable(regionBreakdown(rollups, '07'), '/region/07/health')
    expect(screen.getByRole('link', { name: 'District 47' })).toHaveAttribute(
      'href',
      '/district/47'
    )
  })

  it('sorts by intervention share through the URL', () => {
    renderTable(
      worldBreakdown(rollups),
      '/regions/health?sort=intervention&dir=desc'
    )
    const links = within(screen.getByRole('table', { name: 'Regions' }))
      .getAllByRole('link')
      .map(a => a.textContent)
    expect(links.slice(0, 3)).toEqual(['Region 03', 'Region 01', 'Region 02'])
  })

  it('shows a null figure as not available, never 0', () => {
    const rows = worldBreakdown(rollups).map(r =>
      r.id === '01'
        ? {
            ...r,
            figures: {
              ...r.figures,
              compliance: { ...r.figures.compliance, cspSubmitted: null },
            },
          }
        : r
    )
    renderTable(rows)
    const cell = screen.getByTestId('breakdown-01-csp')
    expect(cell).toHaveTextContent('Not available')
  })

  describe('Dist. column on the confirmed basis (#2580)', () => {
    const tiers = {
      distinguished: { confirmed: 90, provisional: 5 },
      select: { confirmed: 10, provisional: 2 },
      presidents: { confirmed: 4, provisional: 0 },
      smedley: { confirmed: 0, provisional: 0 },
    }
    // Region 01 has 1,040 clubs; the snapshot's tier count there is 13.
    const withCounts = (counts: object | undefined) =>
      worldBreakdown(rollups).map(r =>
        r.id === '01'
          ? {
              ...r,
              figures: {
                ...r.figures,
                distinguishedCounts: counts as never,
              },
            }
          : r
      )

    it('shows the confirmed count and share, with the extra after', () => {
      renderTable(withCounts({ confirmed: 104, provisional: 7, byTier: tiers }))
      const cell = screen.getByTestId('breakdown-01-distinguished')
      expect(cell).toHaveTextContent('10%')
      expect(
        within(cell).getByTestId('distinguished-confirmed')
      ).toHaveTextContent('104')
      expect(cell).toHaveTextContent('+7 qualifying today')
    })

    it('sorts by the confirmed share', () => {
      renderTable(
        withCounts({ confirmed: 104, provisional: 7, byTier: tiers }),
        '/regions/health?sort=distinguished&dir=desc'
      )
      const links = within(screen.getByRole('table', { name: 'Regions' }))
        .getAllByRole('link')
        .map(a => a.textContent)
      expect(links[0]).toBe('Region 01')
    })

    it('labels the snapshot count when nothing is published', () => {
      renderTable(withCounts(undefined))
      const cell = screen.getByTestId('breakdown-01-distinguished')
      expect(cell).toHaveTextContent('13')
      expect(cell).toHaveTextContent('qualifying today')
    })
  })

  it('renders priority columns on a phone, with no wide table', () => {
    isMobile.value = true
    renderTable()
    expect(screen.getByTestId('breakdown-row-03')).toBeInTheDocument()
  })
})
