import { useState } from 'react'
import { ClubRecentChangesPanel } from './ClubRecentChangesPanel'
import { useClubChangeFeed } from '../../hooks/useClubChangeFeed'
import { useNearViewport } from '../../hooks/useNearViewport'
import type { SnapshotDate } from '../../types/snapshotDate'

/**
 * #2430 — the club page's Recent changes card, with its own read gate: about
 * one dated snapshot a week over the last 90 days before the page's date
 * (R3), read only once the hero has painted and the card nears the viewport.
 * The gate's state lives here, so the page itself does not re-render for it.
 */
export function ClubRecentChanges({
  districtId,
  clubId,
  asOfDate,
  heroPainted,
}: {
  districtId: string | undefined
  clubId: string | undefined
  asOfDate: SnapshotDate | null | undefined
  heroPainted: boolean
}) {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const near = useNearViewport(el)
  const { feed, isLoading } = useClubChangeFeed(
    districtId,
    clubId,
    asOfDate,
    heroPainted && near
  )
  return (
    <div ref={setEl}>
      <ClubRecentChangesPanel
        feed={feed}
        isLoading={isLoading}
        districtId={districtId}
      />
    </div>
  )
}
