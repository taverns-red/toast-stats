/* useLastVisit (#418, #2254) — track the data the user last saw, and the
   rank of their pinned district at that time. Returns a diff vs the current
   data so the Districts page can surface a "what changed since your last
   visit" strip and the my-district card's movement line.

   Dates are the rankings **as-of** date (`asOfDate`, the advancing
   dashboard sourceCsvDate), not the pinned snapshot date: the strip's
   purpose is "did the underlying data change since you were last here",
   and the as-of date is what moves when it does (#1320).

   We persist two visits under one key:
     - lastSeen*: the latest as-of date the user has seen, with their
       my-district rank on it (the pre-#2254 shape, so existing storage
       keeps working);
     - baseline*: the visit before that — the one on an EARLIER as-of date.

   The baseline only moves forward when the user returns on a LATER as-of
   date (#2254). Then lastSeen becomes the baseline and the current data
   becomes lastSeen. A reload on the same as-of date changes nothing, so
   the movement stays on screen for that whole data day instead of being
   wiped by the visit that just loaded. An older as-of date (never expected
   on the landing page) is ignored rather than moving anything backwards.

   commit() records the current visit; it is safe to call on every load.
   Storage goes through usePersistedState → localStorageStore, which wraps
   every read and write in try/catch. */

import { useCallback, useMemo } from 'react'
import { usePersistedState } from './usePersistedState'

interface VisitSnapshot {
  lastSeenDate: string | null
  lastSeenMyRank: number | null
  lastSeenMyDistrictId: string | null
  /** Absent in storage written before #2254. */
  baselineDate?: string | null
  baselineMyRank?: number | null
  baselineMyDistrictId?: string | null
}

interface VisitDiff {
  /** True if the user has an earlier visit AND the as-of date has changed. */
  isNewSnapshot: boolean
  previousDate: string | null
  /** Change in my-district rank (positive = moved up the leaderboard). */
  myRankDelta: number | null
}

interface Visit {
  date: string | null
  rank: number | null
  districtId: string | null
}

const EMPTY: VisitSnapshot = {
  lastSeenDate: null,
  lastSeenMyRank: null,
  lastSeenMyDistrictId: null,
  baselineDate: null,
  baselineMyRank: null,
  baselineMyDistrictId: null,
}

/** The earlier visit the current data is compared with, or null. */
function referenceVisit(
  snapshot: VisitSnapshot,
  currentAsOfDate: string | null
): Visit | null {
  if (!currentAsOfDate || !snapshot.lastSeenDate) return null
  // Not yet recorded: this load IS the return visit.
  if (currentAsOfDate > snapshot.lastSeenDate) {
    return {
      date: snapshot.lastSeenDate,
      rank: snapshot.lastSeenMyRank,
      districtId: snapshot.lastSeenMyDistrictId,
    }
  }
  // Already recorded (a same-day reload): compare with the visit before.
  if (currentAsOfDate === snapshot.lastSeenDate && snapshot.baselineDate) {
    return {
      date: snapshot.baselineDate,
      rank: snapshot.baselineMyRank ?? null,
      districtId: snapshot.baselineMyDistrictId ?? null,
    }
  }
  return null
}

export function useLastVisit({
  currentAsOfDate,
  currentMyRank,
  currentMyDistrictId,
}: {
  currentAsOfDate: string | null
  currentMyRank: number | null
  currentMyDistrictId: string | null
}): { diff: VisitDiff; commit: () => void; clear: () => void } {
  const [snapshot, setSnapshot] = usePersistedState<VisitSnapshot>(
    'last-visit-snapshot',
    EMPTY
  )

  const diff = useMemo<VisitDiff>(() => {
    const ref = referenceVisit(snapshot, currentAsOfDate)
    if (!ref) {
      return { isNewSnapshot: false, previousDate: null, myRankDelta: null }
    }

    let myRankDelta: number | null = null
    // Only compute a meaningful rank delta when the same district is the
    // user's pinned one across both visits and we have ranks for both.
    if (
      ref.districtId !== null &&
      currentMyDistrictId !== null &&
      ref.districtId === currentMyDistrictId &&
      typeof ref.rank === 'number' &&
      typeof currentMyRank === 'number'
    ) {
      // Lower rank number = better; positive delta = moved up.
      myRankDelta = ref.rank - currentMyRank
    }

    return { isNewSnapshot: true, previousDate: ref.date, myRankDelta }
  }, [snapshot, currentAsOfDate, currentMyRank, currentMyDistrictId])

  const commit = useCallback(() => {
    if (!currentAsOfDate) return
    setSnapshot(prev => {
      const current = {
        lastSeenDate: currentAsOfDate,
        lastSeenMyRank: currentMyRank,
        lastSeenMyDistrictId: currentMyDistrictId,
      }
      // First visit ever.
      if (!prev.lastSeenDate) return { ...EMPTY, ...current }
      // A return on a later as-of date: the old visit becomes the baseline.
      if (currentAsOfDate > prev.lastSeenDate) {
        return {
          ...current,
          baselineDate: prev.lastSeenDate,
          baselineMyRank: prev.lastSeenMyRank,
          baselineMyDistrictId: prev.lastSeenMyDistrictId,
        }
      }
      // Same as-of date: keep the baseline; refresh the rank only if the
      // star moved or the rank arrived late. Older date: ignore.
      if (
        currentAsOfDate === prev.lastSeenDate &&
        (prev.lastSeenMyRank !== currentMyRank ||
          prev.lastSeenMyDistrictId !== currentMyDistrictId)
      ) {
        return { ...prev, ...current }
      }
      return prev
    })
  }, [setSnapshot, currentAsOfDate, currentMyRank, currentMyDistrictId])

  const clear = useCallback(() => {
    setSnapshot(EMPTY)
  }, [setSnapshot])

  return { diff, commit, clear }
}
