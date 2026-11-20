import React from 'react'
import { Link } from 'react-router-dom'
import {
  normalizeClubId,
  type ReinstatableClub,
} from '@taverns-red/shared-contracts'
import { formatDisplayDate } from '../utils/dateFormatting'
import {
  addsToThisYearsBase,
  isOffCycleSuspendDate,
  reinstateDeadline,
} from '../utils/reinstateDeadline'
import { ActionTable, type ActionTableColumn } from './ActionTable'

/* #3007 — "Can reinstate" on the district Club Growth page, after the
   Suspended stage. The pipeline decides who can reinstate and whether it adds
   to the club base (`classifyReinstatement` in analytics-core, R3); this view
   only prints it. Tags are plain text, never colour. Reasons quote
   Toastmasters' Club Reinstatement FAQ, and an unknown reason code (one added
   after this release) falls back to "confirm with World Headquarters".

   #3100 (approved UX review items): the clubs that add come first and the
   rest fold into a closed <details> (S1). #3103: there is no unknown-effect
   group; the pipeline always decides, and `oldestPeriod` (the old
   four-period flag, still set by older files) is ignored. An adding suspension names its deadline (M1), from the snapshot
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

/** M1 — the renewal an adding suspension came from, before its deadline
 *  (both wordings approved by Ron, 2026-11-20). A code not listed keeps its
 *  REASON_TEXT sentence in the Why cell. */
const DEADLINE_LEAD: Record<string, string> = {
  suspended_sept30_october_cycle: 'Suspended at the September 30 renewal.',
  suspended_mar31_before_oct1: 'Suspended at the March 31 renewal.',
}

/** "March 31, 2027" */
const longDate = (iso: string) =>
  formatDisplayDate(iso, { year: 'numeric', month: 'long', day: 'numeric' })

/** Ron, 2026-11-20: from April to June a March 31 suspension only counts
 *  toward next year's base. The page talks about this year's base only. */
const MAR31_NOT_THIS_YEAR =
  'Suspended at the March 31 renewal. Reinstating it doesn’t change this year’s club base.'

/** #3103 — the pipeline's own code for that window. */
const REASON_TEXT_WITH_WINDOW: Record<string, string> = {
  ...REASON_TEXT,
  suspended_mar31_before_july1: MAR31_NOT_THIS_YEAR,
}

interface ReasonContext {
  snapshotDate: string
  /** The row is in the folded group, whose note says the closed reason once. */
  folded: boolean
}

function reasonText(club: ReinstatableClub, ctx: ReasonContext): string {
  // F1 (#3109 review): the suspended_* sentences name a renewal deadline,
  // which is false for a club suspended off the cycle. No wording is
  // approved for those yet, so they get no Why sentence. The check is the
  // date itself, since the pipeline gives such a club an on-cycle code.
  if (
    club.reason.startsWith('suspended_') &&
    isOffCycleSuspendDate(club.suspendDate)
  ) {
    return ''
  }
  const lead = DEADLINE_LEAD[club.reason]
  const adds = addsNow(club, ctx.snapshotDate)
  const deadline =
    adds && lead !== undefined
      ? reinstateDeadline(club.reason, ctx.snapshotDate)
      : null
  const known =
    deadline !== null
      ? `${lead} If it reinstates by ${longDate(deadline)}, it adds to the club base.`
      : club.reason === 'suspended_mar31_before_oct1' && !adds
        ? MAR31_NOT_THIS_YEAR
        : REASON_TEXT_WITH_WINDOW[club.reason]
  // An unknown code (a later release) asks to confirm.
  if (known === undefined) return CONFIRM
  return ctx.folded && known === CLOSED_TEXT ? '' : known
}

/** Ron approved this line on 2026-11-20 (#3103): only for a row the
 *  pipeline puts in inactive period 5, dated from its `lastChanceBy`. A row
 *  placed from `lastSeen` alone has no period and never gets it. */
function lastChanceText(club: ReinstatableClub): string {
  if (club.inactivePeriod !== 5 || !club.lastChanceBy) return ''
  return `Last chance: must reinstate by ${longDate(club.lastChanceBy)}, or charter as a new club.`
}

/** Adds to this year's club base on the snapshot date: the one rule the
 *  groups, the split, the card and the rollups all count with. */
function addsNow(club: ReinstatableClub, snapshotDate: string): boolean {
  return addsToThisYearsBase(club.reason, club.addsToBase, snapshotDate)
}

/** #3088 — how many clubs are tagged "Adds to the club base", and the line
 *  the stage card prints. Same rule as the groups, so they always agree. */
export function reinstateSplit(
  clubs: readonly ReinstatableClub[],
  snapshotDate: string
): { adds: number; card: string } {
  const adds = clubs.filter(c => addsNow(c, snapshotDate)).length
  return {
    adds,
    card: `${adds} ${adds === 1 ? 'adds' : 'add'} to the club base`,
  }
}

/** The stage card's third line, the same at every level (#3094, #3100). */
export function reinstateCard(
  clubs: readonly ReinstatableClub[],
  snapshotDate: string
): string {
  return reinstateSplit(clubs, snapshotDate).card
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
  const why = (c: ReinstatableClub) =>
    [reasonText(c, ctx), lastChanceText(c)].filter(Boolean).join(' ') || null
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
 *  One date only when every adding club shares it. */
function splitLine(
  clubs: readonly ReinstatableClub[],
  snapshotDate: string
): string {
  const adding = clubs.filter(c => addsNow(c, snapshotDate))
  const deadlines = new Set(
    adding.map(c => reinstateDeadline(c.reason, snapshotDate))
  )
  const [only] = deadlines
  const one = adding.length === 1
  const by =
    deadlines.size === 1 && only
      ? ` if ${one ? 'it reinstates' : 'they reinstate'} by ${longDate(only)}`
      : ''
  return (
    `${adding.length} of ${clubs.length} ${one ? 'adds' : 'add'} to ` +
    `the club base${by}.`
  )
}

export interface ReinstatableClubsSectionProps {
  /** `null`: no list for this date. `[]`: a measured zero. */
  clubs: ReinstatableClub[] | null
  /** The displayed snapshot date, ISO (R3, from the page): the deadlines
   *  and which clubs add to this year's club base. */
  snapshotDate: string
  districtId: string
  /** Clubs with a page here (the Suspended list's rule, S4). */
  clubPageIds?: ReadonlySet<string>
}

const NO_PAGES: ReadonlySet<string> = new Set()

export const ReinstatableClubsSection: React.FC<
  ReinstatableClubsSectionProps
> = ({ clubs, snapshotDate, districtId, clubPageIds = NO_PAGES }) => {
  if (clubs === null) return null
  const ctx: GroupContext = {
    snapshotDate,
    folded: false,
    districtId,
    clubPageIds,
  }
  const adds = clubs.filter(c => addsNow(c, snapshotDate))
  const rest = clubs.filter(c => !addsNow(c, snapshotDate))
  const addsLabel = `Adds to the club base (${adds.length})`
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
        A suspended or closed club can reinstate until the end of its fifth
        renewal period, counting the period it was suspended in. Toastmasters
        International makes the final call.
      </p>
      {clubs.length > 0 && (
        <p className="growth-stage__note" data-testid="growth-reinstate-split">
          {splitLine(clubs, snapshotDate)}
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
