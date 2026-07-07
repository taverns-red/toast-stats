/* useLastVisit (#418) — track the data the user last saw, and the rank of
   their pinned district at that time. Returns a diff vs the current data so the
   Districts page can surface a "what changed since your last visit" strip.

   We persist three things:
     - lastSeenDate: the rankings **as-of** date (`asOfDate`, the advancing
       dashboard sourceCsvDate) the user saw last. This is deliberately the
       as-of date, not the pinned snapshot date: the strip's purpose is "did the
       underlying data change since you were last here", and the as-of date is
       what moves when it does (#1320).
     - lastSeenMyRank: their my-district's rank at that time

   On every render we compare current → stored and return a diff. The
   commit() function is called after the strip has been read and stamps
   the current values forward. */

import { useCallback, useMemo } from 'react'
import { usePersistedState } from './usePersistedState'

interface VisitSnapshot {
  lastSeenDate: string | null
  lastSeenMyRank: number | null
  lastSeenMyDistrictId: string | null
}

interface VisitDiff {
  /** True if the user has visited before AND the snapshot date has changed. */
  isNewSnapshot: boolean
  previousDate: string | null
  /** Change in my-district rank (positive = moved up the leaderboard). */
  myRankDelta: number | null
}

const EMPTY: VisitSnapshot = {
  lastSeenDate: null,
  lastSeenMyRank: null,
  lastSeenMyDistrictId: null,
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
    const isNewSnapshot =
      !!snapshot.lastSeenDate &&
      !!currentAsOfDate &&
      snapshot.lastSeenDate !== currentAsOfDate

    let myRankDelta: number | null = null
    // Only compute a meaningful rank delta when the same district is the
    // user's pinned one across both visits and we have ranks for both.
    if (
      snapshot.lastSeenMyDistrictId !== null &&
      currentMyDistrictId !== null &&
      snapshot.lastSeenMyDistrictId === currentMyDistrictId &&
      typeof snapshot.lastSeenMyRank === 'number' &&
      typeof currentMyRank === 'number'
    ) {
      // Lower rank number = better; positive delta = moved up.
      myRankDelta = snapshot.lastSeenMyRank - currentMyRank
    }

    return {
      isNewSnapshot,
      previousDate: snapshot.lastSeenDate,
      myRankDelta,
    }
  }, [
    snapshot.lastSeenDate,
    snapshot.lastSeenMyRank,
    snapshot.lastSeenMyDistrictId,
    currentAsOfDate,
    currentMyRank,
    currentMyDistrictId,
  ])

  const commit = useCallback(() => {
    setSnapshot({
      lastSeenDate: currentAsOfDate,
      lastSeenMyRank: currentMyRank,
      lastSeenMyDistrictId: currentMyDistrictId,
    })
  }, [setSnapshot, currentAsOfDate, currentMyRank, currentMyDistrictId])

  const clear = useCallback(() => {
    setSnapshot(EMPTY)
  }, [setSnapshot])

  return { diff, commit, clear }
}
