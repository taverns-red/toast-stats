/**
 * Tests for useDefaultProgramYear (#1300, epic #1298)
 *
 * The default program year must be DATA-DRIVEN — the latest program year that
 * actually has snapshots — not the calendar year. At the July rollover the
 * calendar flips to a PY that has no data yet (TM's data rollover lags Jul 1,
 * cf. #1284); the app must stay on the newest PY-with-data until the new year
 * publishes, then advance automatically (self-healing).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn(),
}))

import { fetchCdnDates } from '../../services/cdn'
import { useDefaultProgramYear } from '../useDefaultProgramYear'
import { getCurrentProgramYear } from '../../utils/programYear'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useDefaultProgramYear (#1300)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the latest program year that has snapshot data', async () => {
    // Dates span PY 2024-2025 and 2025-2026; newest snapshot is Jun 2026,
    // which belongs to PY 2025-2026. The calendar (Jul 2026) would say
    // 2026-2027 — but that PY has no data here.
    vi.mocked(fetchCdnDates).mockResolvedValue({
      dates: ['2025-01-15', '2025-09-30', '2026-06-30'],
      count: 3,
      generatedAt: '2026-06-30T00:00:00Z',
    })

    const { result } = renderHook(() => useDefaultProgramYear(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.year).toBe(2025))
    expect(result.current.label).toBe('2025-2026')
  })

  it('falls back to the calendar current program year when there is no data', async () => {
    vi.mocked(fetchCdnDates).mockResolvedValue({
      dates: [],
      count: 0,
      generatedAt: '2026-06-30T00:00:00Z',
    })

    const { result } = renderHook(() => useDefaultProgramYear(), {
      wrapper: createWrapper(),
    })

    // Loading/empty → calendar fallback (never an empty/undefined PY).
    await waitFor(() =>
      expect(result.current.year).toBe(getCurrentProgramYear().year)
    )
  })

  it('falls back to the calendar current program year on fetch error', async () => {
    vi.mocked(fetchCdnDates).mockRejectedValue(new Error('CDN down'))

    const { result } = renderHook(() => useDefaultProgramYear(), {
      wrapper: createWrapper(),
    })

    await waitFor(() =>
      expect(result.current.year).toBe(getCurrentProgramYear().year)
    )
  })
})
