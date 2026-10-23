/**
 * WorldPulse (#2249) — the landing's world and region section for
 * international leaders and observers, from files the site already reads:
 *
 *  - attention figures from `snapshots/{date}/region-rollups.json`
 *    (useRegionRollups, shared with /regions/health);
 *  - a world membership sparkline from `time-series/regions/{PY}.json`
 *    (the /regions sparklines' file, same query key);
 *  - a region table summed from the rankings rows the page already has.
 *
 * Every data-fed slot keeps its box while loading (Lesson 107) and reads
 * "Not available" — never 0 — for an absent file.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorldPulse, type WorldPulseRow } from '../WorldPulse'
import { useRegionRollups } from '../../hooks/useRegionRollups'
import { fetchCdnRegionMembershipSeries } from '../../services/cdn'
import { toSnapshotDate } from '../../types/snapshotDate'

const DATE = toSnapshotDate('2026-10-22')!

vi.mock('../../hooks/useRegionRollups', () => ({
  useRegionRollups: vi.fn(),
}))
vi.mock('../../services/cdn', () => ({
  fetchCdnRegionMembershipSeries: vi.fn(),
}))
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}))

const mockedRollups = vi.mocked(useRegionRollups)
const mockedSeries = vi.mocked(fetchCdnRegionMembershipSeries)

const ROWS: WorldPulseRow[] = [
  { districtId: '61', region: '05', paidClubs: 139, paidClubBase: 158 },
  { districtId: '93', region: '09', paidClubs: 76, paidClubBase: 76 },
  { districtId: '80', region: '09', paidClubs: 200, paidClubBase: 216 },
  { districtId: 'U', region: 'DNAR', paidClubs: 17, paidClubBase: 20 },
]

const rollups = (world: Record<string, unknown>) =>
  ({
    rollups: { world } as never,
    snapshotDate: '2026-10-22',
    isLoading: false,
  }) as never

function renderPulse(reserve = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WorldPulse
          rows={reserve ? [] : ROWS}
          date={DATE}
          programYear="2026-2027"
          reserve={reserve}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('WorldPulse (#2249)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRollups.mockReturnValue(
      rollups({
        health: { thriving: 1, vulnerable: 2, interventionRequired: 1204 },
        growth: { prospective: 10, chartered: 143, suspended: 38 },
      })
    )
    mockedSeries.mockResolvedValue({
      dates: ['2026-07-31', '2026-08-31', '2026-09-30', '2026-10-22'],
      world: { districts: 94, membership: [280000, 281500, null, 283100] },
    } as never)
  })

  it('is a labelled section that leads to /regions', () => {
    renderPulse()
    const section = screen.getByRole('region', { name: /world pulse/i })
    expect(
      within(section).getByRole('link', { name: /all regions/i })
    ).toHaveAttribute('href', '/regions')
  })

  it('shows the attention figures from the rollups, linking to the health page', () => {
    renderPulse()
    expect(screen.getByTestId('pulse-attention')).toHaveTextContent('1,204')
    expect(screen.getByTestId('pulse-chartered')).toHaveTextContent('143')
    expect(screen.getByTestId('pulse-suspended')).toHaveTextContent('38')
    expect(
      screen.getByRole('link', { name: /clubs needing attention/i })
    ).toHaveAttribute('href', '/regions/health')
  })

  it('reads "Not available", never 0, when the rollups file is absent', () => {
    mockedRollups.mockReturnValue({
      rollups: null,
      snapshotDate: '2026-10-22',
      isLoading: false,
    })
    renderPulse()
    expect(screen.getByTestId('pulse-attention')).toHaveTextContent(
      /not available/i
    )
    expect(screen.getByTestId('pulse-attention')).not.toHaveTextContent('0')
  })

  it('draws the world membership sparkline up to the date, skipping gaps', async () => {
    renderPulse()
    const svg = await screen.findByTestId('pulse-sparkline')
    const points = svg.querySelector('polyline')!.getAttribute('points')!
    // Four dates, one null → three points.
    expect(points.trim().split(/\s+/)).toHaveLength(3)
    expect(screen.getByTestId('pulse-sparkline-caption')).toHaveTextContent(
      /280,000.*283,100/
    )
  })

  it('labels the October renewal drop instead of leaving an unexplained cliff (review S3)', async () => {
    // Real shape (time-series/regions/2026-2027.json, prod CDN 2026-10-23):
    // 283,841 on 09-30, 204,639 on 10-11 — unrenewed members drop on Oct 1.
    mockedSeries.mockResolvedValue({
      dates: ['2026-07-26', '2026-09-30', '2026-10-11', '2026-10-19'],
      world: { districts: 94, membership: [263094, 283841, 204639, 210763] },
    } as never)
    renderPulse()
    const note = await screen.findByTestId('pulse-sparkline-note')
    expect(note).toHaveTextContent(/oct 1/i)
    expect(note).toHaveTextContent(/renew/i)
  })

  it('adds no renewal note when the line has no renewal-date drop', async () => {
    renderPulse()
    await screen.findByTestId('pulse-sparkline')
    expect(screen.queryByTestId('pulse-sparkline-note')).toBeNull()
  })

  it('draws no line when the series is not published for the year', async () => {
    mockedSeries.mockResolvedValue(null)
    renderPulse()
    expect(
      await screen.findByText(/no membership series for this year/i)
    ).toBeInTheDocument()
    expect(screen.queryByTestId('pulse-sparkline')).toBeNull()
  })

  it('sums the rankings rows per region, largest first, linking numeric regions', () => {
    renderPulse()
    const table = screen.getByRole('table', { name: /regions/i })
    expect(table).toHaveTextContent(/vs PY start/)
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringMatching(/Region 9.*2.*276.*−16/),
      expect.stringMatching(/Region 5.*1.*139.*−19/),
      expect.stringMatching(/DNAR.*1.*17.*−3/),
    ])
    expect(within(rows[0]!).getByRole('link')).toHaveAttribute(
      'href',
      '/region/09'
    )
    expect(within(rows[2]!).queryByRole('link')).toBeNull()
  })

  // Review S1 — the brief's own 375 wireframe: the five largest regions and
  // a link to the rest, at every width, so the rankings start higher.
  it('shows the five largest regions by paid clubs and links to all of them', () => {
    const many: WorldPulseRow[] = Array.from({ length: 7 }, (_, i) => ({
      districtId: String(i + 1),
      region: String(i + 1).padStart(2, '0'),
      paidClubs: 100 + i * 10,
      paidClubBase: 100,
    }))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <WorldPulse rows={many} date={DATE} programYear="2026-2027" />
        </MemoryRouter>
      </QueryClientProvider>
    )
    const table = screen.getByRole('table', { name: /regions/i })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent(/Region 7/)
    expect(rows[4]).toHaveTextContent(/Region 3/)
    expect(
      screen.getByRole('link', { name: /all 7 regions/i })
    ).toHaveTextContent('All 7 regions →')
  })

  it('keeps every slot in the reserve, with no links and no numbers', () => {
    mockedRollups.mockReturnValue({
      rollups: null,
      snapshotDate: null,
      isLoading: true,
    })
    const { container } = renderPulse(true)
    expect(container.querySelector('.world-pulse')).not.toBeNull()
    expect(screen.getByTestId('pulse-attention')).toHaveTextContent('—')
    expect(container.querySelector('.world-pulse__sparkline')).not.toBeNull()
    expect(container.querySelector('.world-pulse__regions')).not.toBeNull()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
