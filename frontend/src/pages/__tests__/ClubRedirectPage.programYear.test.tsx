/**
 * `/club/:cid?py=` resolves THAT program year's district (#1804, epic #1781).
 *
 * `ClubHistoryTable` year links go through `/club/:cid?py=<startYear>`. The
 * redirect used `config/club-index.json`, a CURRENT mapping (~975 KB), so a
 * moved club's pre-move years landed in its new district: "Club Not Found".
 * The club's one club-district history shard (~12 KB, #1782) knows the
 * district per PY; the index is only the fallback when the shard does not
 * list the club or is unavailable.
 *
 * Fixture: the recorded prod shard 77 (club 977: D01 until 2026-06-30, then
 * D201).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import type { ClubDistrictHistoryShard } from '@taverns-red/shared-contracts'
import ClubRedirectPage from '../ClubRedirectPage'
import { fetchCdnClubIndex } from '../../services/cdn'
import { fetchClubDistrictHistoryShard } from '../../services/cdnClubDistrictHistory'
import shard77 from '../../__tests__/fixtures/club-district-history-77-2026-10-14.recorded.json'

vi.mock('../../services/cdn', () => ({
  fetchCdnClubIndex: vi.fn(),
}))
vi.mock('../../services/cdnClubDistrictHistory', () => ({
  fetchClubDistrictHistoryShard: vi.fn(),
}))

const mockedIndex = vi.mocked(fetchCdnClubIndex)
const mockedShard = vi.mocked(fetchClubDistrictHistoryShard)

function Landed() {
  const loc = useLocation()
  return <div data-testid="landed">{loc.pathname + loc.search}</div>
}

function renderAt(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/club/:clubId" element={<ClubRedirectPage />} />
          <Route
            path="/district/:districtId/club/:clubId"
            element={<Landed />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  mockedShard.mockResolvedValue(shard77 as ClubDistrictHistoryShard)
  mockedIndex.mockResolvedValue({
    clubs: { '977': { districtId: '201', clubName: 'Professional Women' } },
  })
})

describe('ClubRedirectPage — the district for the requested PY (#1804)', () => {
  it("sends a pre-move year to the club's district that year", async () => {
    renderAt('/club/977?py=2024')
    expect(await screen.findByTestId('landed')).toHaveTextContent(
      '/district/01/club/977?py=2024'
    )
    expect(mockedShard).toHaveBeenCalledWith('77')
    expect(mockedIndex).not.toHaveBeenCalled()
  })

  it('sends a bare club link to its current district', async () => {
    renderAt('/club/977')
    expect(await screen.findByTestId('landed')).toHaveTextContent(
      '/district/201/club/977'
    )
    expect(mockedIndex).not.toHaveBeenCalled()
  })

  it('falls back to the current district for a PY the history does not list', async () => {
    renderAt('/club/977?py=2010')
    expect(await screen.findByTestId('landed')).toHaveTextContent(
      '/district/201/club/977?py=2010'
    )
  })

  it('falls back to the club index when the history is unavailable', async () => {
    mockedShard.mockResolvedValue(null)
    renderAt('/club/977?py=2024')
    expect(await screen.findByTestId('landed')).toHaveTextContent(
      '/district/201/club/977?py=2024'
    )
    expect(mockedIndex).toHaveBeenCalled()
  })

  it('says no club with the number has been seen when neither source knows it', async () => {
    mockedIndex.mockResolvedValue({ clubs: {} })
    renderAt('/club/5577?py=2024')
    expect(
      await screen.findByText(
        /No club with number 5577 has been seen since 2017/
      )
    ).toBeInTheDocument()
  })
})
