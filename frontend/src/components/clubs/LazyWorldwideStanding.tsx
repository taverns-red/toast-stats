import React, { useState } from 'react'
import { normalizeClubId } from '@taverns-red/shared-contracts'
import { useGlobalClubRace } from '../../hooks/useGlobalClubRace'
import { useNearViewport } from '../../hooks/useNearViewport'
import type { SnapshotDate } from '../../types/snapshotDate'
import { WorldwideStandingCard } from './WorldwideStandingCard'

/* #2759 — the club page's "Worldwide standing" card closes the page, below
   the DCP goals grid, so its `global-club-race.json` read (~9 KB on the wire)
   is not part of the first load: it starts once this slot comes within a
   screen of the viewport (`useNearViewport`). The slot is an empty block
   until then (the card is absent when the artifact is, so it adds no height
   or margin). The read lives here, not in the page, so the observer's state
   changes re-render only this slot and never the page's other hooks. */

export interface LazyWorldwideStandingProps {
  /** The page's pinned snapshot date (R3, Lesson 59). */
  date: SnapshotDate | undefined
  /** The page's hero-first gate (#1843): the read never starts before it. */
  enabled: boolean
  clubId: string
  goalsMet: number
  members: number
}

export const LazyWorldwideStanding: React.FC<LazyWorldwideStandingProps> = ({
  date,
  enabled,
  clubId,
  goalsMet,
  members,
}) => {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const isNear = useNearViewport(slot)
  const { race, reachedById } = useGlobalClubRace(date, {
    enabled: enabled && !!date && isNear,
  })
  const id = normalizeClubId(clubId)

  return (
    <div ref={setSlot} data-lazy="worldwide-standing">
      <WorldwideStandingCard
        race={race}
        clubId={id}
        goalsMet={goalsMet}
        members={members}
        reached={reachedById.get(id) ?? null}
      />
    </div>
  )
}

export default LazyWorldwideStanding
