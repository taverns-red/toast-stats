/**
 * useLastVisit (#418, #2254) — the "since your last visit" baseline only
 * moves forward when the user comes back on a LATER rankings as-of date.
 * A reload on the same date keeps the previous baseline, so the movement
 * the user came back to see stays on screen for that whole data day.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEffect } from 'react'
import { useLastVisit } from '../useLastVisit'
import { storageKey } from '../../utils/localStorageStore'

const KEY = storageKey('last-visit-snapshot')

/** The page's wiring: read the diff, then record the visit once data lands. */
function usePageVisit(props: {
  currentAsOfDate: string | null
  currentMyRank: number | null
  currentMyDistrictId: string | null
}) {
  const visit = useLastVisit(props)
  const { commit } = visit
  useEffect(() => {
    if (props.currentAsOfDate) commit()
  }, [props.currentAsOfDate, commit])
  return visit.diff
}

const seed = (value: unknown) =>
  window.localStorage.setItem(KEY, JSON.stringify(value))

const visit = (date: string, rank: number, id = '61') =>
  renderHook(() =>
    usePageVisit({
      currentAsOfDate: date,
      currentMyRank: rank,
      currentMyDistrictId: id,
    })
  )

describe('useLastVisit (#2254)', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('shows no movement on a first-ever visit', () => {
    const { result } = visit('2026-10-20', 7)
    expect(result.current.isNewSnapshot).toBe(false)
    expect(result.current.myRankDelta).toBeNull()
    expect(result.current.previousDate).toBeNull()
  })

  it('keeps the movement on screen after the visit is recorded', () => {
    // A stored visit in the pre-#2254 shape (existing users' storage).
    seed({
      lastSeenDate: '2026-10-20',
      lastSeenMyRank: 10,
      lastSeenMyDistrictId: '61',
    })
    const { result } = visit('2026-10-23', 7)
    expect(result.current).toEqual({
      isNewSnapshot: true,
      previousDate: '2026-10-20',
      myRankDelta: 3,
    })
  })

  it('keeps the previous baseline on a same-day reload', () => {
    seed({
      lastSeenDate: '2026-10-20',
      lastSeenMyRank: 10,
      lastSeenMyDistrictId: '61',
    })
    visit('2026-10-23', 7).unmount()
    const { result } = visit('2026-10-23', 7)
    expect(result.current).toEqual({
      isNewSnapshot: true,
      previousDate: '2026-10-20',
      myRankDelta: 3,
    })
    visit('2026-10-23', 7).unmount()
    expect(visit('2026-10-23', 7).result.current.previousDate).toBe(
      '2026-10-20'
    )
  })

  it('moves the baseline forward on a later snapshot and shows the real movement', () => {
    visit('2026-10-20', 10).unmount() // first visit
    // Same day, nothing to compare yet.
    const same = visit('2026-10-20', 10)
    expect(same.result.current.isNewSnapshot).toBe(false)
    same.unmount()
    // Return on a later snapshot: compared with the 10-20 visit.
    const later = visit('2026-10-23', 6)
    expect(later.result.current).toEqual({
      isNewSnapshot: true,
      previousDate: '2026-10-20',
      myRankDelta: 4,
    })
    later.unmount()
    // And the next snapshot compares with 10-23, not 10-20.
    const next = visit('2026-10-25', 8)
    expect(next.result.current).toEqual({
      isNewSnapshot: true,
      previousDate: '2026-10-23',
      myRankDelta: -2,
    })
  })

  it('never moves the baseline backwards for an older as-of date', () => {
    seed({
      lastSeenDate: '2026-10-23',
      lastSeenMyRank: 7,
      lastSeenMyDistrictId: '61',
    })
    const older = visit('2026-10-20', 10)
    expect(older.result.current.isNewSnapshot).toBe(false)
    older.unmount()
    expect(visit('2026-10-25', 5).result.current).toEqual({
      isNewSnapshot: true,
      previousDate: '2026-10-23',
      myRankDelta: 2,
    })
  })

  it('gives no rank delta when the starred district changed', () => {
    seed({
      lastSeenDate: '2026-10-20',
      lastSeenMyRank: 10,
      lastSeenMyDistrictId: '61',
    })
    const { result } = visit('2026-10-23', 4, '57')
    expect(result.current.isNewSnapshot).toBe(true)
    expect(result.current.myRankDelta).toBeNull()
  })

  it('still works when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = visit('2026-10-23', 7)
    expect(result.current.isNewSnapshot).toBe(false)
    expect(result.current.myRankDelta).toBeNull()
  })
})
