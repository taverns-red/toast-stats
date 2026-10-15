import type { ClubDistrictHistoryClub } from '@taverns-red/shared-contracts'

/** #1843 — one row of the club page's Lifecycle timeline. */
export interface ClubLifecycleEvent {
  key: string
  kind: 'charter' | 'first' | 'move' | 'last' | 'suspended'
  title: string
  when: string
  /** The club's current district (an open-ended span). */
  current: boolean
}

export interface ClubLifecycle {
  events: ClubLifecycleEvent[]
  formerNames: string[]
  /** False when the club-district history shard had no entry. */
  historyAvailable: boolean
}

// Red-phase stub (#1843): the tests define the behaviour.
export function buildClubLifecycle(_input: {
  charterDate?: string | undefined
  history: ClubDistrictHistoryClub | null
  suspendDate?: string | null | undefined
}): ClubLifecycle {
  return { events: [], formerNames: [], historyAvailable: false }
}
