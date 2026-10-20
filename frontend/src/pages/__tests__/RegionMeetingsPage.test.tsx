/**
 * /region/:n/meetings and /regions/meetings (#1814) — the region and world
 * meeting-time heatmaps over `snapshots/{date}/meeting-times.json`. Fixture:
 * the pipeline builder's output over recorded prod 2026-10-19 district
 * files. The query is pinned to the page's own snapshot date (R3); until a
 * date has the artifact the pages say "not available yet", never zeros.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionMeetingsPage from '../RegionMeetingsPage'
import WorldMeetingsPage from '../WorldMeetingsPage'
import { fetchCdnMeetingTimes } from '../../services/cdn'
import { parseMeetingTimes } from '../../utils/meetingTimesRollup'
import recorded from '../../__tests__/fixtures/meeting-times-2026-10-19.recorded.json'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: ['2026-10-19'], count: 1 }),
  fetchCdnMeetingTimes: vi.fn(),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-10-19'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-19', generatedAt: 'x' }),
}))

const mocked = vi.mocked(fetchCdnMeetingTimes)
const view = parseMeetingTimes(recorded)!

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
              path="/region/:n/meetings"
              element={<RegionMeetingsPage />}
            />
            <Route path="/regions/meetings" element={<WorldMeetingsPage />} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

const grid = () =>
  screen.findByRole('group', { name: /clubs by weekday and start hour/i })

describe('RegionMeetingsPage', () => {
  it('shows the region’s grid for the page’s own date (R3)', async () => {
    mocked.mockResolvedValue(view)
    renderAt('/region/05/meetings')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Region 05/ })
    ).toBeInTheDocument()
    await grid()
    expect(mocked).toHaveBeenCalledWith('2026-10-19')
    expect(
      screen.getByRole('list', { name: /meetings at a glance/i })
    ).toHaveTextContent('936 of 972')
    expect(document.title).toMatch(/Region 05 Meeting Times/)
  })

  it('narrows to a district from the URL (?district=)', async () => {
    mocked.mockResolvedValue(view)
    renderAt('/region/05/meetings?district=61&mode=online&slot=wed-19')
    await grid()
    expect(
      screen.getByRole('list', { name: /meetings at a glance/i })
    ).toHaveTextContent('158 of 161')
    const panel = screen.getByRole('region', { name: /wednesday 19:00/i })
    expect(
      within(panel).getByRole('link', { name: /District 61/ })
    ).toBeVisible()
  })

  it('says "not available yet" when the date has no meeting-times.json — never zeros', async () => {
    mocked.mockResolvedValue(null)
    renderAt('/region/05/meetings')
    expect(await screen.findByTestId('meetings-unavailable')).toHaveTextContent(
      /not available yet/i
    )
    expect(
      screen.queryByRole('group', { name: /clubs by weekday/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('0 of 0')).not.toBeInTheDocument()
  })

  it('a region not in the file says so', async () => {
    mocked.mockResolvedValue(view)
    renderAt('/region/09/meetings')
    expect(await screen.findByTestId('meetings-unavailable')).toHaveTextContent(
      /Region 09 is not in the meeting times/i
    )
  })

  it('reads an unpadded region id as its padded key (#2130)', async () => {
    mocked.mockResolvedValue(view)
    renderAt('/region/5/meetings')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Region 05/ })
    ).toBeInTheDocument()
    await grid()
  })
})

describe('WorldMeetingsPage', () => {
  it('sums every district and breaks down by region', async () => {
    mocked.mockResolvedValue(view)
    renderAt('/regions/meetings?date=2026-10-19')
    await grid()
    expect(
      screen.getByRole('list', { name: /meetings at a glance/i })
    ).toHaveTextContent('1,087 of 1,129')
    const table = screen.getByRole('table', { name: /by region/i })
    expect(
      within(table).getByRole('link', { name: 'Region 05' })
    ).toHaveAttribute('href', '/region/05/meetings?date=2026-10-19')
  })

  it('narrows to a region from the URL (?region=)', async () => {
    mocked.mockResolvedValue(view)
    renderAt('/regions/meetings?region=12')
    await grid()
    expect(
      screen.getByRole('list', { name: /meetings at a glance/i })
    ).toHaveTextContent('62 of 63')
  })

  it('says "not available yet" when the date has no meeting-times.json', async () => {
    mocked.mockResolvedValue(null)
    renderAt('/regions/meetings')
    expect(await screen.findByTestId('meetings-unavailable')).toHaveTextContent(
      /not available yet/i
    )
  })
})
