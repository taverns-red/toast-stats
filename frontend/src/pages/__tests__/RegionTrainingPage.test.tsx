/**
 * /region/:n/training (#2296) — the region's districts compared on club
 * officer training, from the date's one region-rollups.json. The envelope is
 * the recorded 2026-10-15 rollup; it predates the officer-training field,
 * so the per-district distributions are injected here.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionTrainingPage from '../RegionTrainingPage'
import { fetchCdnRegionRollups } from '../../services/cdn'
import recorded from '../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'
import {
  RegionRollupsSchema,
  type RegionRollups,
} from '@taverns-red/shared-contracts'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: ['2026-10-15'], count: 1 }),
  fetchCdnRegionRollups: vi.fn(),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-10-15'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-15', generatedAt: 'x' }),
}))

const mocked = vi.mocked(fetchCdnRegionRollups)
const recordedRollups = RegionRollupsSchema.parse(recorded)

/** Round 1 % at 4+ per Region 05 district (10 clubs each, for round numbers). */
const ROUND1_AT_FOUR: Record<string, number> = {
  '123': 4,
  '216': 9,
  '31': 6,
  '53': 2,
  '60': 7,
  '61': 8,
  '86': 5,
}

function withTraining(): RegionRollups {
  const r = structuredClone(recordedRollups)
  for (const [id, atFour] of Object.entries(ROUND1_AT_FOUR)) {
    // atFour clubs at 4 officers (one of them at 7 when atFour > 5), the
    // rest at 0; Round 2 has not opened, so all 10 at 0.
    const allSeven = atFour > 5 ? 1 : 0
    r.districts[id]!.officerTraining = {
      round1: [10 - atFour, 0, 0, 0, atFour - allSeven, 0, 0, allSeven],
      round2: [10, 0, 0, 0, 0, 0, 0, 0],
    }
  }
  return r
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderAt = (url: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route
              path="/region/:n/training"
              element={<RegionTrainingPage />}
            />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

const districtOrder = () =>
  within(screen.getByTestId('region-training-table'))
    .getAllByRole('rowheader')
    .map(th => th.textContent)

describe('RegionTrainingPage (#2296)', () => {
  it('compares the region’s districts, best Round 1 share at 4+ first (no round open on Oct 15)', async () => {
    mocked.mockResolvedValue(withTraining())
    renderAt('/region/05/training')
    await screen.findByTestId('region-training-table')
    expect(districtOrder()).toEqual([
      'District 216',
      'District 61',
      'District 60',
      'District 31',
      'District 86',
      'District 123',
      'District 53',
    ])
    expect(mocked).toHaveBeenCalledWith('2026-10-15')
  })

  it('links each district to its Training page at the same threshold', async () => {
    mocked.mockResolvedValue(withTraining())
    renderAt('/region/05/training?threshold=7')
    await screen.findByTestId('region-training-table')
    expect(screen.getByRole('link', { name: 'District 61' })).toHaveAttribute(
      'href',
      '/district/61/training?threshold=7'
    )
  })

  it('adds a column for a threshold other than 4 or 7', async () => {
    mocked.mockResolvedValue(withTraining())
    renderAt('/region/05/training?threshold=5')
    const table = await screen.findByTestId('region-training-table')
    expect(
      within(table).getAllByRole('button', { name: /Sort by 5\+/ })
    ).toHaveLength(2)
  })

  it('sorts by a column on click', async () => {
    mocked.mockResolvedValue(withTraining())
    renderAt('/region/05/training')
    const table = await screen.findByTestId('region-training-table')
    fireEvent.click(
      within(table).getAllByRole('button', { name: /Sort by All 7/ })[0]!
    )
    // Districts with one club at all seven (10%) lead, ties by district id.
    expect(districtOrder().slice(0, 4)).toEqual([
      'District 31',
      'District 60',
      'District 61',
      'District 216',
    ])
  })

  it('says so when the date’s rollup predates the officer-training figure', async () => {
    mocked.mockResolvedValue(recordedRollups)
    renderAt('/region/05/training')
    expect(
      await screen.findByTestId('training-unavailable')
    ).toBeInTheDocument()
    expect(screen.queryByTestId('region-training-table')).toBeNull()
  })

  it('a round that has not opened shows its opening date, not 0%', async () => {
    mocked.mockResolvedValue(withTraining())
    renderAt('/region/05/training')
    const table = await screen.findByTestId('region-training-table')
    expect(
      within(table).getByRole('columnheader', { name: /Round 2.*opens Nov 1/ })
    ).toBeInTheDocument()
    const row = within(table).getByRole('row', { name: /District 61/ })
    expect(row).not.toHaveTextContent(/\b0%/)
    expect(within(row).getAllByText('—')).toHaveLength(2)
  })

  it('appears in the region’s section nav', async () => {
    mocked.mockResolvedValue(withTraining())
    renderAt('/region/05/training')
    const nav = await screen.findByRole('navigation', {
      name: 'Region 05 sections',
    })
    expect(
      within(nav).getByRole('link', { name: 'Officer training' })
    ).toHaveAttribute('href', '/region/05/training')
  })
})
