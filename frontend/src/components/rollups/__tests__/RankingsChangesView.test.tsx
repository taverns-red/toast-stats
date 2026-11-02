/**
 * RankingsChangesView (#2476, phase 1) — the body of the region and world
 * What Changed subpages: tiles summed over the scope, then a per-district
 * table and notable events (region) or a per-region breakdown and biggest
 * movers (world). The page owns the dates and the scope (R3).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { RankingsChangesView } from '../RankingsChangesView'
import type { RankingsDiffRow } from '../../../utils/rankingsDiff'

const exportSpy = vi.hoisted(() => vi.fn())
vi.mock('../../../utils/csvExport', async importOriginal => ({
  ...(await importOriginal<object>()),
  exportRankingsDiff: exportSpy,
}))

afterEach(() => {
  cleanup()
  exportSpy.mockReset()
})

function row(
  districtId: string,
  region: string,
  over: Partial<RankingsDiffRow> = {}
): RankingsDiffRow {
  return {
    districtId,
    districtName: `District ${districtId}`,
    region,
    paidClubs: 100,
    totalPayments: 1000,
    distinguishedClubs: 10,
    aggregateScore: 50,
    overallRank: 10,
    newCharteredClubs: 1,
    suspendedClubs: 1,
    ...over,
  }
}

const FROM = [
  row('61', '05', { aggregateScore: 90, overallRank: 3 }),
  row('62', '05', { aggregateScore: 80, overallRank: 6 }),
  row('9', '07', { totalPayments: 500 }),
]
const TO = [
  row('61', '05', {
    paidClubs: 104,
    totalPayments: 1300,
    aggregateScore: 70,
    overallRank: 8,
    suspendedClubs: 3,
  }),
  row('62', '05', { aggregateScore: 85, overallRank: 4 }),
  row('9', '07', { totalPayments: 450 }),
]
const byRow = (r: { region: string }) => r.region

/** The KPI tile whose heading is `title`. */
const tile = (title: string) =>
  screen
    .getAllByTestId('kpi-delta-card')
    .find(c => within(c).queryByRole('heading', { name: title }))!

function renderView(region?: string) {
  render(
    <MemoryRouter>
      <RankingsChangesView
        scopeLabel={region ? `Region ${region}` : 'All regions'}
        region={region}
        from="2026-10-01"
        to="2026-10-31"
        fromRows={FROM}
        toRows={TO}
        regionOfFrom={byRow}
        regionOfTo={byRow}
      />
    </MemoryRouter>
  )
}

describe('RankingsChangesView — region', () => {
  it('sums the tiles over the region, before → after', () => {
    renderView('05')
    expect(screen.getByTestId('changes-headline')).toHaveTextContent(
      'Changes for Region 05 from Oct 1, 2026 to Oct 31, 2026 · 30 days'
    )
    const paid = tile('Paid clubs')
    expect(paid).toHaveTextContent('+4')
    expect(paid).toHaveTextContent('200 → 204')
    const payments = tile('Payments')
    expect(payments).toHaveTextContent('2,000 → 2,300')
    expect(tile('Distinguished clubs')).toHaveTextContent('20 → 20')
  })

  it('lists each district with its deltas and rank move within the region', () => {
    renderView('05')
    const table = screen.getByRole('table', { name: 'Region 05 districts' })
    const d61 = within(table).getByRole('row', { name: /District 61/ })
    expect(d61).toHaveTextContent('104 (+4)')
    expect(d61).toHaveTextContent('1 → 2')
    expect(
      within(d61).getByRole('link', { name: 'District 61' })
    ).toHaveAttribute(
      'href',
      '/district/61/changes?from=2026-10-01&to=2026-10-31'
    )
    // Only the region's districts.
    expect(within(table).queryByText('District 9')).toBeNull()
  })

  it('names the districts whose suspended or new-charter count changed', () => {
    renderView('05')
    const events = screen.getByRole('list', { name: 'Notable events' })
    expect(events).toHaveTextContent('District 61: suspended clubs 1 → 3 (+2)')
  })

  it('exports the pair on screen', async () => {
    renderView('05')
    await userEvent.click(screen.getByRole('button', { name: /Export CSV/ }))
    expect(exportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeLabel: 'Region 05',
        from: '2026-10-01',
        to: '2026-10-31',
      })
    )
  })
})

describe('RankingsChangesView — world', () => {
  it('sums worldwide, breaks down by region and lists the biggest movers', () => {
    renderView()
    expect(tile('Payments')).toHaveTextContent('2,500 → 2,750')
    const regions = screen.getByRole('table', { name: 'Changes by region' })
    const r05 = within(regions).getByRole('row', { name: /Region 05/ })
    expect(
      within(r05).getByRole('link', { name: 'Region 05' })
    ).toHaveAttribute(
      'href',
      '/region/05/changes?from=2026-10-01&to=2026-10-31'
    )
    expect(
      screen.getByRole('list', { name: 'Biggest moves in overall rank' })
    ).toHaveTextContent('District 61')
    expect(
      screen.getByRole('list', { name: 'Biggest payment changes' })
    ).toHaveTextContent('District 61')
    expect(screen.queryByRole('list', { name: 'Notable events' })).toBeNull()
  })
})
