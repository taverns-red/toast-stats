/**
 * dateNoticeStore (#2635) — the one-line "No snapshot for <date>" notice.
 *
 * The controls hooks resolve a `?date=` that names no snapshot and then drop
 * it from the URL, so the explanation cannot live in the URL. A tiny external
 * store (not React context) lets any controls hook raise the notice and the
 * single <DateNotice /> in the app shell show it, with no provider to mock in
 * the dozens of tests that render those hooks.
 */

import { useSyncExternalStore } from 'react'

export interface DateNoticeValue {
  /** The raw `?date=` the visitor asked for. */
  requested: string
  /** The snapshot date being shown instead. */
  shown: string
}

let current: DateNoticeValue | null = null
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach(l => l())
}

export function setDateNotice(next: DateNoticeValue | null): void {
  if (
    next === current ||
    (next &&
      current &&
      next.requested === current.requested &&
      next.shown === current.shown)
  ) {
    return
  }
  current = next
  emit()
}

export function getDateNotice(): DateNoticeValue | null {
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useDateNotice(): DateNoticeValue | null {
  return useSyncExternalStore(subscribe, getDateNotice, getDateNotice)
}
