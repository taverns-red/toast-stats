/* ClubMiniList (#871, epic #873 Sprint 1 — CC-4).
 *
 * Mobile (<768px) replacement for the Division / Area club mini-tables. The
 * 4-column table (Club | Status | Members | Distinguished) is wider than a
 * 375px phone, so the Status column scrolls off the right edge and the chip
 * clips to "✗ Intervention R…". Per the audit ("let it be a chip, don't try to
 * table it") and Lesson 105 (browse-one-row lists card-collapse on mobile),
 * each club becomes a stacked card: name + a fully-visible StatusChip, with
 * Members / Distinguished as a muted meta line so no column data is lost.
 *
 * Reuses the themed `.clubs-card` chrome (--surface / --line / --ink) so dark
 * mode just works (R10). CC-7 (#872, epic #873 Sprint 2): each card is now a
 * real `<Link>` (was a JS-navigating `<button>` via onSelect), so long-press /
 * open-in-new-tab work on mobile — the surface this list serves — and the
 * destination is announced to assistive tech. The caller supplies `clubTo` to
 * build the href (the pages own the districtId). */

import React from 'react'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import {
  getClubHealthStatusLabel,
  getClubHealthStatusShortLabel,
} from '../utils/clubHealthStatus'
import { StatusChip } from './StatusChip'
import { MobileRowList } from './MobileRowList'

interface ClubMiniListProps {
  clubs: ClubTrend[]
  /** Build the club-detail href for a club (e.g. `/district/61/club/123`). */
  clubTo: (club: ClubTrend) => string
}

/* #1833: the stacked cards (~125 px each) became MobileRowList compact rows —
   name on line 1; glyph + one-word status chip, members and tier on line 2;
   the whole row links to the club page. */
export const ClubMiniList: React.FC<ClubMiniListProps> = ({
  clubs,
  clubTo,
}) => (
  <MobileRowList
    label="Clubs"
    noun="clubs"
    chipPlacement="meta"
    rows={clubs.map(c => {
      const members = c.membershipTrend[c.membershipTrend.length - 1]?.count
      const memberText = `${members ?? '\u2014'} member${members === 1 ? '' : 's'}`
      const distinguished =
        c.distinguishedLevel === 'NotDistinguished'
          ? null
          : c.distinguishedLevel
      return {
        id: c.clubId,
        to: clubTo(c),
        title: c.clubName,
        chip: (
          <StatusChip
            status={c.currentStatus}
            label={getClubHealthStatusShortLabel(c.currentStatus)}
          />
        ),
        meta: distinguished
          ? `${memberText} \u00b7 ${distinguished}`
          : memberText,
        ariaLabel: `${c.clubName} \u2014 ${getClubHealthStatusLabel(
          c.currentStatus
        )}, ${members ?? 0} members${distinguished ? `, ${distinguished}` : ''}`,
      }
    })}
  />
)

export default ClubMiniList
