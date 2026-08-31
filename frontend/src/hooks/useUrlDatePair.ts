import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { previousRecordedDate } from './useSnapshotDiff'

/**
 * useUrlDatePair — URL-synced arbitrary date pair for the "What Changed" digest
 * (#794, epic #797 Sprint 2).
 *
 * Reads `?from=YYYY-MM-DD&to=YYYY-MM-DD` from the URL. A param is honoured only
 * when its value is one of the district's recorded snapshot `dates` (so a stale
 * or hand-edited URL can't select a date the district never had). When a param
 * is absent or invalid, that side falls back to the Phase-1 default — `from` =
 * previous recorded date (`[-2]`), `to` = latest (`[-1]`) — so an empty URL
 * reproduces the default digest exactly.
 *
 * The page owns this pair and passes `from`/`to` down as props (R3); the diff
 * hook never re-derives them from response data.
 *
 * Setters mirror `useUrlProgramYear`: a selection equal to the default deletes
 * its param (keeps shared URLs clean), any other value writes it, and a no-op
 * write bails early so it can't clobber a same-batch URL update (Lesson 070).
 *
 * @param dates Ascending list of the district's recorded snapshot dates.
 * @see docs/design/what-changed-feature.md §5, §4
 */
export function useUrlDatePair<T extends string>(
  dates: readonly T[]
): {
  from: T | undefined
  to: T | undefined
  setFrom: (date: T) => void
  setTo: (date: T) => void
  setPair: (from: T, to: T) => void
} {
  const [searchParams, setSearchParams] = useSearchParams()

  const defaultPair = useMemo(() => previousRecordedDate(dates), [dates])

  const urlFrom = searchParams.get('from')
  const urlTo = searchParams.get('to')

  // A URL value wins only if it's a date this district actually recorded;
  // otherwise fall back to the Phase-1 default for that side.
  const from = dates.find(d => d === urlFrom) ?? defaultPair?.from
  const to = dates.find(d => d === urlTo) ?? defaultPair?.to

  // One key's worth of the write policy, applied to a params object the caller
  // owns — so a single navigation can apply it to BOTH keys (see setPair).
  const applyKey = useCallback(
    (params: URLSearchParams, key: 'from' | 'to', date: T) => {
      const isDefault = defaultPair
        ? date === (key === 'from' ? defaultPair.from : defaultPair.to)
        : false
      if (isDefault) params.delete(key)
      else params.set(key, date)
    },
    [defaultPair]
  )

  const setParam = useCallback(
    (key: 'from' | 'to', date: T, current: T | undefined) => {
      if (date === current) return // no-op — don't churn history (Lesson 070)
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          applyKey(next, key, date)
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams, applyKey]
  )

  const setFrom = useCallback(
    (date: T) => setParam('from', date, from),
    [setParam, from]
  )
  const setTo = useCallback(
    (date: T) => setParam('to', date, to),
    [setParam, to]
  )

  /**
   * Set BOTH ends of the pair in a single navigation (#1462).
   *
   * The time-window preset chips move both dates at once, and that cannot be
   * composed out of `setFrom` + `setTo`: react-router hands a functional
   * updater the `searchParams` of the CURRENT render, not a queued previous
   * update, so two calls in one handler are both computed from the same
   * pre-click base and the second navigation discards the first key. The hook's
   * return value still looks right (it reflects the new location) while the URL
   * — the thing users share — is missing a key.
   *
   * @see tasks/lessons/lessons/coupled-url-params-need-one-setter-not-two-calls.md
   * @see tasks/lessons/lessons/two-url-state-hooks-in-one-handler-lose-a-facet.md
   */
  const setPair = useCallback(
    (nextFrom: T, nextTo: T) => {
      if (nextFrom === from && nextTo === to) return // no-op (Lesson 070)
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          applyKey(next, 'from', nextFrom)
          applyKey(next, 'to', nextTo)
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams, applyKey, from, to]
  )

  return { from, to, setFrom, setTo, setPair }
}
