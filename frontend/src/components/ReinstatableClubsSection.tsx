import React from 'react'
import type { ReinstatableClub } from '@taverns-red/shared-contracts'
import { formatDisplayDate } from '../utils/dateFormatting'
import { ActionTable, type ActionTableColumn } from './ActionTable'

/* #3007 — "Can reinstate" on the district Club Growth page, after the
   Suspended stage. The pipeline decides who can reinstate and whether it adds
   to the club base (`classifyReinstatement` in analytics-core, R3); this view
   only prints it. Tags are plain text, never colour. Reasons quote
   Toastmasters' Club Reinstatement FAQ, and an unknown reason code (one added
   after this release) falls back to "confirm with World Headquarters".

   `clubs === null` means the date has no list: render nothing, quietly. */

const REINSTATEMENT_FAQ_URL = 'https://toastmasters.org/footer/faq/Club'

const CONFIRM = 'Confirm with World Headquarters.'
const CLOSED_QUOTE = 'closed clubs “will not increase the club base”'

/** One line per reason code, from the FAQ's club base answer and table. */
const REASON_TEXT: Record<string, string> = {
  suspended_sept30_october_cycle:
    'Suspended at the September 30 renewal. The FAQ says: “Reinstatement during the October renewal cycle will increase the club base.”',
  suspended_mar31_before_oct1:
    'Suspended at the March 31 renewal. The FAQ says reinstating before October 1 increases the club base.',
  suspended_mar31_after_oct1:
    'Suspended at the March 31 renewal. The FAQ says the club closes on October 1, and a reinstatement after that “will not increase the club base.”',
  suspended_sept30_past_october_cycle: `Suspended at the September 30 renewal, and the October renewal cycle after it has ended. The club has likely closed by now, so reinstating won’t add to the club base. ${CONFIRM}`,
  suspend_date_unexpected: `The suspension date isn’t at the end of a renewal period, so we can’t tell. ${CONFIRM}`,
  suspend_date_after_as_of: `The suspension date is after this snapshot’s date, so we can’t tell. ${CONFIRM}`,
  closed_does_not_add: `Closed. The FAQ says ${CLOSED_QUOTE}.`,
}

/** Reasons where the pipeline could not decide the effect on the base. */
const UNDECIDED = new Set([
  'suspend_date_unexpected',
  'suspend_date_after_as_of',
])

function reasonText(club: ReinstatableClub): string {
  const known = REASON_TEXT[club.reason]
  const parts = known === undefined ? [] : [known]
  if (club.oldestPeriod) {
    parts.push('Closed in the oldest of the four renewal periods.')
  }
  // An unknown code or the oldest period asks to confirm; say it once.
  const needsConfirm = known === undefined || club.oldestPeriod
  if (needsConfirm && !parts.some(p => p.endsWith(CONFIRM))) {
    parts.push(CONFIRM)
  }
  return parts.join(' ')
}

const baseKnown = (club: ReinstatableClub): boolean =>
  !UNDECIDED.has(club.reason) && club.reason in REASON_TEXT

function baseTag(club: ReinstatableClub, nextYear: boolean): string {
  if (!baseKnown(club)) return 'Effect on the club base not known'
  if (!club.addsToBase) return 'Doesn’t add to the club base'
  return nextYear ? 'Adds to next year’s club base' : 'Adds to the club base'
}

/** Whether a reinstatement on this date counts toward the next program
 *  year's base (April 1 to June 30), from the file's `baseProgramYear`. */
export function addsToNextYear(
  baseProgramYear: string | null,
  programYearStart: number
): boolean {
  return (
    baseProgramYear !== null &&
    Number(baseProgramYear.slice(0, 4)) > programYearStart
  )
}

/** #3088 — how many clubs are tagged "Adds to the club base", and the line
 *  the stage card prints. Same rule as the tag, so they always agree. */
export function reinstateSplit(
  clubs: readonly ReinstatableClub[],
  nextYear: boolean
): { adds: number; card: string } {
  const adds = clubs.filter(c => baseKnown(c) && c.addsToBase).length
  const base = nextYear ? 'next year’s club base' : 'the club base'
  return { adds, card: `${adds} ${adds === 1 ? 'adds' : 'add'} to ${base}` }
}

/** The cited source, shared with the region and world sections (#3094). */
export function ReinstatementFaqSource() {
  return (
    <p className="growth-reinstate__source">
      Source:{' '}
      <a
        href={REINSTATEMENT_FAQ_URL}
        className="growth-reinstate__link"
        target="_blank"
        rel="noopener noreferrer"
      >
        Toastmasters’ Club Reinstatement FAQ
        <span className="sr-only"> (opens toastmasters.org)</span>
      </a>
    </p>
  )
}

function statusText(club: ReinstatableClub): string {
  if (club.status === 'suspended' && club.suspendDate) {
    return `Suspended ${formatDisplayDate(club.suspendDate)}`
  }
  if (club.status === 'closed' && club.lastSeen) {
    return `Closed, last seen ${formatDisplayDate(club.lastSeen)}`
  }
  return club.status === 'suspended' ? 'Suspended' : 'Closed'
}

function divisionArea(club: ReinstatableClub): string {
  if (!club.division && !club.area) return 'Not known'
  return `${club.division || '—'} / ${club.area || '—'}`
}

const columns = (nextYear: boolean): ActionTableColumn<ReinstatableClub>[] => [
  {
    key: 'club',
    header: 'Club',
    className: 'action-table__subject growth-table__club',
    cell: c => (
      <>
        <span className="growth-reinstate__name">{c.clubName}</span>
        <span className="growth-reinstate__number">Club {c.clubNumber}</span>
      </>
    ),
  },
  { key: 'where', header: 'Division / Area', cell: divisionArea },
  { key: 'status', header: 'Status', cell: statusText },
  { key: 'base', header: 'Club base', cell: c => baseTag(c, nextYear) },
  {
    key: 'why',
    header: 'Why',
    className: 'growth-reinstate__why',
    cell: reasonText,
  },
]

export interface ReinstatableClubsSectionProps {
  /** `null`: no list for this date. `[]`: a measured zero. */
  clubs: ReinstatableClub[] | null
  /** The file's `baseProgramYear`, `YYYY-YYYY`. */
  baseProgramYear: string | null
  /** Start year of the displayed program year (R3, from the page). */
  programYearStart: number
}

export const ReinstatableClubsSection: React.FC<
  ReinstatableClubsSectionProps
> = ({ clubs, baseProgramYear, programYearStart }) => {
  if (clubs === null) return null
  // Between April 1 and June 30 a reinstatement counts toward the next
  // program year's base; the pipeline says which year in `baseProgramYear`.
  const nextYear = addsToNextYear(baseProgramYear, programYearStart)
  const split = reinstateSplit(clubs, nextYear)

  return (
    <section
      id="growth-reinstate"
      className="growth-stage"
      aria-labelledby="growth-reinstate-heading"
      data-testid="growth-reinstate"
    >
      <h3 id="growth-reinstate-heading" className="growth-stage__title">
        Can reinstate ({clubs.length})
      </h3>
      <p className="growth-stage__note">
        Suspended clubs, and clubs closed in the past four renewal periods, can
        reinstate. Toastmasters International makes the final call.
      </p>
      {clubs.length > 0 && (
        <p className="growth-stage__note" data-testid="growth-reinstate-split">
          {split.adds} of {clubs.length} {split.adds === 1 ? 'adds' : 'add'} to{' '}
          {nextYear ? 'next year’s club base' : 'the club base'}.
        </p>
      )}
      <div
        className="growth-stage__note"
        data-testid="growth-reinstate-requirements"
      >
        <h4 className="growth-stage__subtitle">What it takes</h4>
        <p>
          Membership applications for 12 members, 3 of whom were active in the
          renewal period before the suspension. An active president, vice
          president and secretary, held by three different people. Prorated dues
          for the current period plus one full future period, paid through World
          Headquarters.
        </p>
        <ReinstatementFaqSource />
      </div>
      {clubs.length === 0 ? (
        <p className="growth-stage__note">
          No suspended or recently closed clubs can reinstate right now.
        </p>
      ) : (
        <ActionTable
          caption="Clubs that can reinstate"
          columns={columns(nextYear)}
          rows={clubs}
          rowKey={c => c.clubNumber}
          testId="growth-reinstate-table"
        />
      )}
    </section>
  )
}

export default ReinstatableClubsSection
