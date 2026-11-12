/**
 * #2640 (WCAG 2.4.2): the two redirect pages are not instant. Both wait for
 * data and can stop on a state of their own (a lookup, "Club Not Found",
 * "Could not load area"), so each titles those states instead of leaving the
 * generic document title in the tab.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import ClubRedirectPage from '../ClubRedirectPage'
import AreaRedirectPage from '../AreaRedirectPage'
import { fetchCdnClubIndex } from '../../services/cdn'
import { fetchClubDistrictHistoryShard } from '../../services/cdnClubDistrictHistory'
import { useDistrictStatistics } from '../../hooks/useMembershipData'

vi.mock('../../services/cdn', () => ({ fetchCdnClubIndex: vi.fn() }))
vi.mock('../../services/cdnClubDistrictHistory', () => ({
  fetchClubDistrictHistoryShard: vi.fn(),
}))
vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(),
}))

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
            path="/district/:districtId/area/:areaId"
            element={<AreaRedirectPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.mocked(fetchClubDistrictHistoryShard).mockResolvedValue(null)
  vi.mocked(fetchCdnClubIndex).mockResolvedValue({ clubs: {} })
})
afterEach(() => cleanup())

describe('redirect pages title their own states (#2640)', () => {
  it('ClubRedirectPage titles the lookup', () => {
    renderAt('/club/5577')
    expect(document.title).toBe('Looking up club 5577 — Toast Stats')
  })

  it('ClubRedirectPage titles "Club Not Found"', async () => {
    renderAt('/club/5577')
    await screen.findByText('Club Not Found')
    expect(document.title).toBe('Club not found — Toast Stats')
  })

  it('AreaRedirectPage titles the lookup', () => {
    vi.mocked(useDistrictStatistics).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useDistrictStatistics>)
    renderAt('/district/61/area/10')
    expect(document.title).toBe('Area 10 — District 61 — Toast Stats')
  })

  it('AreaRedirectPage titles "Could not load area"', () => {
    vi.mocked(useDistrictStatistics).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('down'),
    } as unknown as ReturnType<typeof useDistrictStatistics>)
    renderAt('/district/61/area/10')
    expect(screen.getByText('Could not load area')).toBeInTheDocument()
    expect(document.title).toBe('Could not load area — Toast Stats')
  })
})
