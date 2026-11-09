/**
 * useEducationTimeline (#2592): the page passes its own selected program
 * year (R3). The rollup index lists a timeline row per PY (#2593): no row
 * means no fetch (`listed: false`); a row with an absent file is
 * `timeline: null`, not an error.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { EducationRollupIndex } from '@taverns-red/shared-contracts'
import { DISTRICT_61_TIMELINE as EDUCATION_TIMELINE_ENTITY } from '../../__tests__/fixtures/educationTimelineFixtures'
import { useEducationTimeline } from '../useEducationTimeline'
import * as cdn from '../../services/cdn'

vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  fetchCdnEducationTimeline: vi.fn(),
  fetchCdnEducationRollupIndex: vi.fn(),
}))

const fetchTimeline = vi.mocked(cdn.fetchCdnEducationTimeline)
const fetchIndex = vi.mocked(cdn.fetchCdnEducationRollupIndex)

const row = (programYear: string) => ({
  programYear,
  prefix: `derived/education-timeline/${programYear}`,
  asOf: '2026-11-08',
  dates: 8,
  priorGrain: 'day' as const,
})
const indexWith = (...pys: string[]): EducationRollupIndex =>
  ({ timelines: pys.map(row) }) as unknown as EducationRollupIndex

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  fetchTimeline.mockReset()
  fetchIndex.mockReset()
  fetchIndex.mockResolvedValue(indexWith('2026-2027', '2025-2026'))
})

describe('useEducationTimeline', () => {
  it('reads the entity file for the PY the page passes', async () => {
    fetchTimeline.mockResolvedValue(EDUCATION_TIMELINE_ENTITY)
    const { result } = renderHook(
      () => useEducationTimeline('2026-2027', 'district', '61'),
      { wrapper: wrapper() }
    )
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchTimeline).toHaveBeenCalledWith('2026-2027', 'district', '61')
    expect(result.current.listed).toBe(true)
    expect(result.current.timeline?.asOf).toBe('2026-10-11')
  })

  it('is null, not an error, when a listed file is not there', async () => {
    fetchTimeline.mockResolvedValue(null)
    const { result } = renderHook(
      () => useEducationTimeline('2026-2027', 'world', null),
      { wrapper: wrapper() }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.listed).toBe(true)
    expect(result.current.timeline).toBeNull()
  })

  it('does not fetch a PY the index has no timeline row for', async () => {
    const { result } = renderHook(
      () => useEducationTimeline('2024-2025', 'district', '61'),
      { wrapper: wrapper() }
    )
    await waitFor(() => expect(fetchIndex).toHaveBeenCalled())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.listed).toBe(false)
    expect(result.current.timeline).toBeNull()
    expect(fetchTimeline).not.toHaveBeenCalled()
  })

  it('treats an index with no timelines (older release) as unlisted', async () => {
    fetchIndex.mockResolvedValue({} as unknown as EducationRollupIndex)
    const { result } = renderHook(
      () => useEducationTimeline('2026-2027', 'district', '61'),
      { wrapper: wrapper() }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.listed).toBe(false)
    expect(fetchTimeline).not.toHaveBeenCalled()
  })

  it('treats a missing index as unlisted', async () => {
    fetchIndex.mockResolvedValue(null)
    const { result } = renderHook(
      () => useEducationTimeline('2026-2027', 'district', '61'),
      { wrapper: wrapper() }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.listed).toBe(false)
  })

  it('keeps one cache entry per entity and PY', async () => {
    fetchTimeline.mockResolvedValue(null)
    const w = wrapper()
    const a = renderHook(
      () => useEducationTimeline('2026-2027', 'region', '09'),
      { wrapper: w }
    )
    await waitFor(() => expect(a.result.current.isLoading).toBe(false))
    const b = renderHook(
      () => useEducationTimeline('2025-2026', 'region', '09'),
      { wrapper: w }
    )
    await waitFor(() => expect(b.result.current.isLoading).toBe(false))
    expect(fetchTimeline).toHaveBeenCalledTimes(2)
  })
})
