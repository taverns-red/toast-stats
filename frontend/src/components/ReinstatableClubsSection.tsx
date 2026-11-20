import React from 'react'
import { Link } from 'react-router-dom'
import {
  normalizeClubId,
  type ReinstatableClub,
} from '@taverns-red/shared-contracts'
import { formatDisplayDate } from '../utils/dateFormatting'
import { reinstateDeadline } from '../utils/reinstateDeadline'
import { ActionTable, type ActionTableColumn } from './ActionTable'

/* #3007 — "Can reinstate" on the district Club Growth page, after the
   Suspended stage. The pipeline decides who can reinstate and whether it adds
   to the club base (`classifyReinstatement` in analytics-core, R3); this view
   only prints it. Tags are plain text, never colour. Reasons quote
   Toastmasters' Club Reinstatement FAQ, and an unknown reason code (one added
   after this release) falls back to "confirm with World Headquarters".

   #3100 (approved UX review items): the clubs that add come first, the
   unknown-effect clubs next, and the rest fold into a closed <details>
   (S1). An adding suspension names its deadline (M1), from the snapshot
   date the page passes in (R3).

   `clubs === null` means the date has no list: render nothing, quietly. */

const REINSTATEMENT_FAQ_URL = 'https://toastmasters.org/footer/faq/Club'

const CONFIRM = 'Confirm with World Headquarters.'
const CLOSED_QUOTE = 'closed clubs “will not increase the club base”'
const CLOSED_TEXT = `Closed. The FAQ says ${CLOSED_QUOTE}.`

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
  closed_does_not_add: CLOSED_TEXT,
}

/** M1 — the renewal an adding suspension came from, before its deadline.
 *  A code not listed keeps its REASON_TEXT sentence in the Why cell.
 *  Pending Ron's OK (#3102): suspended_mar31_before_oct1 → "Suspended at
 *  the March 31 renewal. If it reinstates by September 30, YYYY, it adds to
 *  the club base." Add it here once approved. */
const DEADLINE_LEAD: Record<string, string> = {
  suspended_sept30_october_cycle: 'Suspended at the September 30 renewal.',
}

/** Reasons where the pipeline could not decide the effect on the base. */
const UNDECIDED = new Set([
  'suspend_date_unexpected',
  'suspend_date_after_as_of',
])

/** "March 31, 2027" */
const longDate = (iso: string) =>
  formatDisplayDate(iso, { year: 'numeric', month: 'long', day: 'numeric' })

const baseName = (nextYear: boolean) =>
  nextYear ? 'next year’s club base' : 'the club base'

interface ReasonContext {
  snapshotDate: string
  nextYear: boolean
  /** The row is in the folded group, whose note says the closed reason once. */
  folded: boolean
}

function reasonText(club: ReinstatableClub, ctx: ReasonContext): string {
  const lead = DEADLINE_LEAD[club.reason]
  const deadline =
    club.addsToBase && lead !== undefined
      ? reinstateDeadline(club.reason, ctx.snapshotDate)
      : null
  const known =
    deadline !== null
      ? `${lead} If it reinstates by ${longDate(deadline)}, it adds to ${baseName(ctx.nextYear)}.`
      : REASON_TEXT[club.reason]
  const parts =
    known === undefined || (ctx.folded && known === CLOSED_TEXT) ? [] : [known]
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

const addsNow = (club: ReinstatableClub): boolean =>
  baseKnown(club) && club.addsToBase

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
  const adds = clubs.filter(addsNow).length
  return {
    adds,
    card: `${adds} ${adds === 1 ? 'adds' : 'add'} to ${baseName(nextYear)}`,
  }
}

/** #3094 — how many clubs are tagged "Effect on the club base not known".
 *  Same rule as the tag. */
export function baseUnknownCount(clubs: readonly ReinstatableClub[]): number {
  return clubs.filter(c => !baseKnown(c)).length
}

/** "2 effect on the club base not known", the tag's own wording (#3094). */
export const unknownPhrase = (n: number): string =>
  `${n.toLocaleString('en-US')} effect on the club base not known`

/** The stage card's third line, the same at every level (#3094, #3100 S6):
 *  the split, then the unknown-effect count when there is one. */
export function reinstateCard(
  clubs: readonly ReinstatableClub[],
  nextYear: boolean
): string {
  const { card } = reinstateSplit(clubs, nextYear)
  const unknown = baseUnknownCount(clubs)
  return unknown > 0 ? `${card} · ${unknownPhrase(unknown)}` : card
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

/** M2 (#3100) — what to collect and where to send it, with the cited
 *  source. Shared by the district, region and world sections. */
export function ReinstatementRequirements() {
  return (
    <div
      className="growth-stage__note"
      data-testid="growth-reinstate-requirements"
    >
      <h4 className="growth-stage__subtitle">What it takes</h4>
      <ul className="growth-reinstate__list">
        <li>
          Membership applications for 12 members. 3 of them must have been
          members in the renewal period before the suspension.
        </li>
        <li>
          A president, a secretary and one vice president (education, membership
          or public relations). Three different people.
        </li>
        <li>
          Dues for each member: the rest of this renewal period, plus the next
          full one.
        </li>
      </ul>
      <p>
        Reinstatement can’t be done online. Email everything to{' '}
        <a
          href="mailto:renewals@toastmasters.org"
          className="growth-reinstate__link"
        >
          renewals@toastmasters.org
        </a>{' '}
        and pay World Headquarters by phone at{' '}
        <a href="tel:+17204395050" className="growth-reinstate__link">
          +1 720-439-5050
        </a>
        .
      </p>
      <ReinstatementFaqSource />
    </div>
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

const hasDivisionArea = (club: ReinstatableClub): boolean =>
  Boolean(club.division || club.area)

/** S3 — a row with no division or area prints nothing, never "Not known". */
function divisionArea(club: ReinstatableClub): string | null {
  if (!hasDivisionArea(club)) return null
  return `${club.division || '—'} / ${club.area || '—'}`
}

interface GroupContext extends ReasonContext {
  districtId: string
  clubPageIds: ReadonlySet<string>
}

/* One group's columns. The group heading already says the effect on the
   club base, so there is no per-row tag. Division / Area and Why appear only
   when a row in the group has one; an empty cell renders nothing, and
   growth.css hides it on the phone card rows. */
function groupColumns(
  rows: readonly ReinstatableClub[],
  ctx: GroupContext
): ActionTableColumn<ReinstatableClub>[] {
  const why = (c: ReinstatableClub) => reasonText(c, ctx) || null
  const cols: ActionTableColumn<ReinstatableClub>[] = [
    {
      key: 'club',
      header: 'Club',
      className: 'action-table__subject growth-table__club',
      cell: c => {
        // S4 — as the Suspended list decides: a page here, a link to it.
        const id = normalizeClubId(c.clubNumber)
        return (
          <>
            {ctx.clubPageIds.has(id) ? (
              <Link
                to={`/district/${ctx.districtId}/club/${id}`}
                className="growth-table__link"
              >
                {c.clubName}
              </Link>
            ) : (
              <span className="growth-reinstate__name">{c.clubName}</span>
            )}
            <span className="growth-reinstate__number">
              Club {c.clubNumber}
            </span>
          </>
        )
      },
    },
  ]
  if (rows.some(hasDivisionArea)) {
    cols.push({
      key: 'where',
      header: 'Division / Area',
      className: 'growth-reinstate__optional',
      cell: divisionArea,
    })
  }
  cols.push({ key: 'status', header: 'Status', cell: statusText })
  if (rows.some(c => why(c) !== null)) {
    cols.push({
      key: 'why',
      header: 'Why',
      className: 'growth-reinstate__why growth-reinstate__optional',
      cell: why,
    })
  }
  return cols
}

function GroupTable({
  rows,
  caption,
  testId,
  ctx,
}: {
  rows: readonly ReinstatableClub[]
  caption: string
  testId: string
  ctx: GroupContext
}) {
  return (
    <ActionTable
      caption={caption}
      columns={groupColumns(rows, ctx)}
      rows={rows}
      rowKey={c => c.clubNumber}
      testId={testId}
    />
  )
}

/** M1 — "3 of 22 add to the club base if they reinstate by March 31, 2027."
 *  One date only when every adding club shares it. S6 — then the
 *  unknown-effect count, when there is one. */
function splitLine(
  clubs: readonly ReinstatableClub[],
  snapshotDate: string,
  nextYear: boolean
): string {
  const adding = clubs.filter(addsNow)
  const deadlines = new Set(
    adding.map(c => reinstateDeadline(c.reason, snapshotDate))
  )
  const [only] = deadlines
  const one = adding.length === 1
  const by =
    deadlines.size === 1 && only
      ? ` if ${one ? 'it reinstates' : 'they reinstate'} by ${longDate(only)}`
      : ''
  const unknown = baseUnknownCount(clubs)
  return (
    `${adding.length} of ${clubs.length} ${one ? 'adds' : 'add'} to ` +
    `${baseName(nextYear)}${by}.` +
    (unknown > 0 ? ` ${unknownPhrase(unknown)}.` : '')
  )
}

export interface ReinstatableClubsSectionProps {
  /** `null`: no list for this date. `[]`: a measured zero. */
  clubs: ReinstatableClub[] | null
  /** The file's `baseProgramYear`, `YYYY-YYYY`. */
  baseProgramYear: string | null
  /** Start year of the displayed program year (R3, from the page). */
  programYearStart: number
  /** The displayed snapshot date, ISO (R3, from the page): the deadlines. */
  snapshotDate: string
  districtId: string
  /** Clubs with a page here (the Suspended list's rule, S4). */
  clubPageIds?: ReadonlySet<string>
}

const NO_PAGES: ReadonlySet<string> = new Set()

export const ReinstatableClubsSection: React.FC<
  ReinstatableClubsSectionProps
> = ({
  clubs,
  baseProgramYear,
  programYearStart,
  snapshotDate,
  districtId,
  clubPageIds = NO_PAGES,
}) => {
  if (clubs === null) return null
  // Between April 1 and June 30 a reinstatement counts toward the next
  // program year's base; the pipeline says which year in `baseProgramYear`.
  const nextYear = addsToNextYear(baseProgramYear, programYearStart)
  const ctx: GroupContext = {
    snapshotDate,
    nextYear,
    folded: false,
    districtId,
    clubPageIds,
  }
  const adds = clubs.filter(addsNow)
  const unknown = clubs.filter(c => !baseKnown(c))
  const rest = clubs.filter(c => baseKnown(c) && !c.addsToBase)
  const addsLabel = `Adds to ${baseName(nextYear)} (${adds.length})`
  const unknownLabel = `Effect on the club base not known (${unknown.length})`
  const restLabel = `Doesn’t add to the club base (${rest.length})`

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
          {splitLine(clubs, snapshotDate, nextYear)}
        </p>
      )}
      {clubs.length === 0 && (
        <p className="growth-stage__note">
          No suspended or recently closed clubs can reinstate right now.
        </p>
      )}
      {adds.length > 0 && (
        <div data-testid="growth-reinstate-adds">
          <h4 className="growth-stage__subtitle">{addsLabel}</h4>
          <GroupTable
            rows={adds}
            caption={addsLabel}
            testId="growth-reinstate-table-adds"
            ctx={ctx}
          />
        </div>
      )}
      {unknown.length > 0 && (
        <div data-testid="growth-reinstate-unknown">
          <h4 className="growth-stage__subtitle">{unknownLabel}</h4>
          <GroupTable
            rows={unknown}
            caption={unknownLabel}
            testId="growth-reinstate-table-unknown"
            ctx={ctx}
          />
        </div>
      )}
      {rest.length > 0 && (
        <details
          className="growth-reinstate__fold"
          data-testid="growth-reinstate-rest"
        >
          {/* The label is a heading too, so heading navigation reaches the
              folded group; the summary stays the toggle. */}
          <summary className="growth-reinstate__summary">
            <h4 className="growth-reinstate__summary-title">{restLabel}</h4>
          </summary>
          {rest.some(c => c.reason === 'closed_does_not_add') && (
            <p className="growth-stage__note">{CLOSED_TEXT}</p>
          )}
          <GroupTable
            rows={rest}
            caption={restLabel}
            testId="growth-reinstate-table-rest"
            ctx={{ ...ctx, folded: true }}
          />
        </details>
      )}
      <ReinstatementRequirements />
    </section>
  )
}

export default ReinstatableClubsSection
