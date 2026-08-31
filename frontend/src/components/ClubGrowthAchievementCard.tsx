/**
 * ClubGrowthAchievementCard (#1476, epic #1473) — the District Club Growth
 * Achievement on the District Overview.
 *
 * Toastmasters International introduced this recognition for PY 2026-2027:
 * charter 3 or 5 new clubs by September 30, and 3, 5 or 10 by March 31. That
 * sentence is the entire published spec; the cumulative-from-July-1 reading
 * and the "highest tier reached" reading are operator rulings recorded on
 * #1473, and the copy below labels them as ours rather than TI's.
 *
 * ## What this component is responsible for
 *
 * Rendering four distinguishable answers per checkpoint, and never blurring
 * them into each other:
 *
 *  - **loading** — a structural skeleton holding the slot. The checkpoint
 *    reads resolve from a *separate, slower* query than the one that paints
 *    the page, so a null-until-data render pops the panel in from 0px and
 *    shoves the page down (#1105 / Lessons 107, 125, 158).
 *  - **pending** — the live race, and today the most valuable view: the
 *    running total, the next tier, a CLAMPED "N more" gap (never a signed
 *    delta — Lesson 102), and the deadline.
 *  - **settled** — the tier earned, or an explicit "no milestone reached",
 *    which is a different statement from "we could not tell".
 *  - **unavailable** — an explicit "not available", with the reason. This is
 *    the one that matters most: a missing checkpoint rendered as `0` or as an
 *    unreached tier is a plausible wrong number, and a plausible wrong number
 *    beats no number in visibility while losing badly on truth.
 *
 * ## What it deliberately does NOT do
 *
 * It does not fetch, and it does not decide which snapshot a checkpoint is
 * read from — `useClubGrowthMilestones` (#1475) owns that, including the rule
 * that a settled checkpoint is read from its OWN dated file rather than
 * recomputed from today's rankings. And it does not re-derive the milestone
 * thresholds, the checkpoint dates, or the countdown: all three come out of
 * `resolveClubGrowthAchievement` (#1474), so the "N more" gap and the tier
 * that decides "earned" can never drift apart (Lesson 103).
 *
 * R3: `programYear` and `asOfDate` are passed by the parent, never re-derived
 * from response data.
 */
import React from 'react'

import {
  resolveClubGrowthAchievement,
  type ClubGrowthCheckpointId as PredicateCheckpointId,
  type ClubGrowthCheckpointState,
} from '../utils/clubGrowthAchievement'
import type { ClubGrowthCheckpoint as ClubGrowthCheckpointRead } from '../hooks/useClubGrowthMilestones'

/** The rule-change log entry that documents this achievement (#1400 / #1474). */
const METHODOLOGY_HREF =
  '/methodology#py-2026-2027-district-club-growth-achievement'

export interface ClubGrowthAchievementCardProps {
  /** Program year, `"YYYY-YYYY"`, from the parent (R3). Gates the whole card. */
  programYear: string
  /**
   * The pinned snapshot date the page is displaying, from the parent (R3).
   * Decides which checkpoints have passed — the data's clock, not the wall's.
   */
  asOfDate: string | undefined
  /** Per-checkpoint reads from `useClubGrowthMilestones` (#1475). */
  checkpointReads: readonly ClubGrowthCheckpointRead[]
  /** True while those reads are still resolving. */
  isLoading?: boolean
  /**
   * The running charter total at `asOfDate`, from the rankings row the page
   * already holds (`newCharteredClubs`). Decides PENDING checkpoints only —
   * a settled one is read from its own dated file, never from today's number.
   * `null`/`undefined` means "not available", never "chartered nothing".
   */
  toDateCount?: number | null
}

/* ── Small pure helpers ──────────────────────────────────────────────────── */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/**
 * `2026-09-30` → `September 30, 2026`. Parsed from the string's own parts;
 * `new Date('YYYY-MM-DD')` is UTC-midnight but reads back in local time, which
 * rolls a month-end date back a day west of Greenwich.
 */
const formatFullDate = (iso: string): string => {
  const month = MONTHS[Number.parseInt(iso.slice(5, 7), 10) - 1]
  if (!month) return iso
  return `${month} ${Number.parseInt(iso.slice(8, 10), 10)}, ${iso.slice(0, 4)}`
}

/** `2026-09-30` → `September 30` — the deadline as the copy says it aloud. */
const formatMonthDay = (iso: string): string => {
  const month = MONTHS[Number.parseInt(iso.slice(5, 7), 10) - 1]
  if (!month) return iso
  return `${month} ${Number.parseInt(iso.slice(8, 10), 10)}`
}

const clubWord = (n: number): string => (n === 1 ? 'club' : 'clubs')

/** The hook's checkpoint id for a predicate checkpoint id. */
const READ_ID: Record<PredicateCheckpointId, ClubGrowthCheckpointRead['id']> = {
  september30: 'september',
  march31: 'march',
}

/**
 * Why a checkpoint has no count, in a sentence. Each hook reason keeps its own
 * wording so the reader can tell a missing file from a missing district from a
 * file too old to carry the field — three different things to go fix.
 */
const unavailableDetail = (
  read: ClubGrowthCheckpointRead | undefined
): string => {
  if (read?.status === 'unavailable') {
    switch (read.unavailableReason) {
      case 'snapshot-missing':
        return 'no snapshot was archived for this checkpoint.'
      case 'district-absent':
        return 'this district does not appear in the checkpoint’s data.'
      case 'count-absent':
        return 'the checkpoint’s data predates new-club charter counts.'
      default:
        break
    }
  }
  return 'the charter count for this district could not be read.'
}

/**
 * Provenance for a read whose date is not the checkpoint's own date.
 *
 * Two independent ways that happens, and both are legitimate: no run landed on
 * the checkpoint so a nearest-prior snapshot answered it (`isFallbackDate`),
 * and/or the checkpoint file's dashboard `sourceCsvDate` is later than the
 * pinned date because of month-end reconciliation. Say which, rather than
 * quietly presenting the number as if it were stamped on the deadline.
 */
const provenanceText = (
  read: ClubGrowthCheckpointRead | undefined,
  checkpointDate: string
): string | null => {
  if (!read) return null
  const parts: string[] = []
  if (read.isFallbackDate && read.resolvedFromDate) {
    parts.push(`read from the ${read.resolvedFromDate} snapshot`)
  }
  const asOf = read.asOfDate?.slice(0, 10)
  if (asOf && asOf !== checkpointDate) {
    parts.push(`dashboard as of ${asOf}`)
  }
  if (parts.length === 0) return null
  const sentence = parts.join(' · ')
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`
}

/* ── Chip styling ────────────────────────────────────────────────────────────
   Every utility used here already has a symmetric `[data-theme='dark']`
   override in `styles/dark-mode.css` — background AND foreground remap
   together, which is the failure mode Lesson 094 is about. No `dark:` variant,
   no opacity-variant utility (those bake hardcoded rgba, R10 tripwire). */

const STATUS_CHIP: Record<string, string> = {
  earned: 'bg-tm-true-maroon text-white border-tm-true-maroon',
  pending: 'bg-tm-loyal-blue-10 text-tm-loyal-blue border-tm-loyal-blue',
  none: 'bg-gray-100 text-gray-700 border-gray-300',
  unknown: 'bg-gray-50 text-gray-600 border-gray-300 border-dashed',
}

type MilestoneState = 'reached' | 'unreached' | 'unavailable'

const MILESTONE_CHIP: Record<MilestoneState, string> = {
  reached: 'bg-tm-true-maroon text-white border-tm-true-maroon font-semibold',
  unreached: 'bg-gray-100 text-gray-700 border-gray-300',
  unavailable: 'bg-gray-50 text-gray-600 border-gray-300 border-dashed',
}

const MILESTONE_STATE_LABEL: Record<MilestoneState, string> = {
  reached: 'reached',
  unreached: 'not reached',
  unavailable: 'not available',
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

const MilestoneChips: React.FC<{
  baseId: PredicateCheckpointId
  milestones: readonly number[]
  /** `undefined` = unknowable; do NOT compare a missing count against a tier. */
  count: number | undefined
}> = ({ baseId, milestones, count }) => (
  <ul
    data-testid={`club-growth-milestones-${baseId}`}
    className="mt-3 flex flex-wrap items-center gap-1.5"
  >
    {milestones.map(milestone => {
      const state: MilestoneState =
        count === undefined
          ? 'unavailable'
          : count >= milestone
            ? 'reached'
            : 'unreached'
      return (
        <li
          key={milestone}
          data-testid={`club-growth-milestone-${baseId}-${milestone}`}
          data-state={state}
          className={`inline-flex min-w-8 items-center justify-center rounded-full border px-2.5 py-1 text-xs tabular-nums font-tm-body ${MILESTONE_CHIP[state]}`}
        >
          <span aria-hidden="true">{milestone}</span>
          <span className="sr-only">
            {milestone} {clubWord(milestone)} — {MILESTONE_STATE_LABEL[state]}
          </span>
        </li>
      )
    })}
  </ul>
)

const CheckpointBlock: React.FC<{
  state: ClubGrowthCheckpointState
  read: ClubGrowthCheckpointRead | undefined
}> = ({ state, read }) => {
  const base = `club-growth-checkpoint-${state.id}`
  const provenance = provenanceText(read, state.date)

  const statusKey =
    state.status === 'unknown'
      ? 'unknown'
      : state.status === 'pending'
        ? 'pending'
        : state.milestoneReached !== null
          ? 'earned'
          : 'none'

  const statusLabel = {
    unknown: 'Not available',
    pending: 'In progress',
    earned: 'Milestone earned',
    none: 'No milestone',
  }[statusKey]

  return (
    <li
      data-testid={base}
      data-status={state.status}
      className="rounded-md border border-gray-200 px-3 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 font-tm-body">
          By {formatFullDate(state.date)}
        </h3>
        <span
          data-testid={`${base}-status`}
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold font-tm-body ${STATUS_CHIP[statusKey]}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* The data row. `min-h-11` is the 44px floor the rest of the app sizes
          interactive rows on; the block's height otherwise emerges from the
          same CSS in every state, so the loading → loaded → unavailable swaps
          don't move the page (Lessons 125, 158). */}
      <div className="mt-2 min-h-11">
        {state.status === 'unknown' ? (
          <p
            data-testid={`${base}-unavailable`}
            className="text-sm text-gray-700 font-tm-body"
          >
            Not available — {unavailableDetail(read)}
          </p>
        ) : (
          <>
            <p className="flex items-baseline gap-1.5">
              <span
                data-testid={`${base}-count`}
                className="text-2xl font-bold text-gray-900 font-tm-headline tabular-nums"
              >
                {state.count}
              </span>
              <span className="text-xs text-gray-600 font-tm-body">
                new {clubWord(state.count)} chartered
                {state.status === 'pending' ? ' so far' : ''}
              </span>
            </p>
            {state.status === 'pending' ? (
              state.nextMilestone !== null ? (
                <p
                  data-testid={`${base}-remaining`}
                  className="mt-1 text-sm text-gray-700 font-tm-body"
                >
                  {state.remaining} more by {formatMonthDay(state.date)} to
                  reach the {state.nextMilestone}-club milestone
                </p>
              ) : (
                <p
                  data-testid={`${base}-remaining`}
                  className="mt-1 text-sm text-gray-700 font-tm-body"
                >
                  Every milestone for this checkpoint is reached — confirmed
                  after {formatMonthDay(state.date)}
                </p>
              )
            ) : state.milestoneReached !== null ? (
              <p
                data-testid={`${base}-earned`}
                className="mt-1 text-sm font-semibold text-tm-true-maroon font-tm-body"
              >
                Milestone earned: {state.milestoneReached} new{' '}
                {clubWord(state.milestoneReached)}
              </p>
            ) : (
              <p
                data-testid={`${base}-none`}
                className="mt-1 text-sm text-gray-700 font-tm-body"
              >
                No milestone reached by {formatMonthDay(state.date)}
              </p>
            )}
          </>
        )}
      </div>

      <MilestoneChips
        baseId={state.id}
        milestones={state.milestones}
        count={state.status === 'unknown' ? undefined : state.count}
      />

      {provenance && (
        <p
          data-testid={`${base}-provenance`}
          className="mt-2 text-[11px] text-gray-500 font-tm-body"
        >
          {provenance}
        </p>
      )}
    </li>
  )
}

const SkeletonBar: React.FC<{ className: string }> = ({ className }) => (
  <span
    className={`block animate-pulse rounded bg-gray-200 theme-dark:bg-gray-700 ${className}`}
  />
)

/**
 * Structural skeleton (Lesson 158): reuse the real chrome — the
 * `redesign-panel` wrapper, the static title + caption, the two-up checkpoint
 * grid and each block's border/padding — and pin only the widths of the data
 * rows. Total height is never stated, so it emerges from the same CSS that
 * sizes the loaded card at every breakpoint and in dark mode.
 */
const ClubGrowthAchievementCardSkeleton: React.FC = () => (
  <div
    className="redesign-panel"
    aria-hidden="true"
    data-testid="club-growth-achievement-skeleton"
  >
    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
      <div>
        <h2 className="text-lg font-bold text-gray-900 font-tm-headline">
          Club Growth Achievement
        </h2>
        <p className="mt-0.5 text-xs uppercase tracking-wide text-gray-500 font-tm-body">
          New clubs chartered
        </p>
      </div>
    </div>
    <SkeletonBar className="h-3 w-full max-w-xl" />
    <SkeletonBar className="mt-1.5 h-3 w-3/4 max-w-md" />
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      {[0, 1].map(i => (
        <div
          key={i}
          data-testid="club-growth-skeleton-checkpoint"
          className="rounded-md border border-gray-200 px-3 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SkeletonBar className="h-4 w-36" />
            <SkeletonBar className="h-6 w-24 rounded-full" />
          </div>
          <div className="mt-2 min-h-11">
            <SkeletonBar className="h-7 w-10" />
            <SkeletonBar className="mt-1.5 h-4 w-48" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <SkeletonBar className="h-6 w-9 rounded-full" />
            <SkeletonBar className="h-6 w-9 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  </div>
)

/* ── The card ────────────────────────────────────────────────────────────── */

export const ClubGrowthAchievementCard: React.FC<
  ClubGrowthAchievementCardProps
> = ({ programYear, asOfDate, checkpointReads, isLoading, toDateCount }) => {
  const readFor = (id: ClubGrowthCheckpointRead['id']) =>
    checkpointReads.find(r => r.id === id)

  // A settled checkpoint's count comes ONLY from a `resolved` read of that
  // checkpoint's own dated file. `undefined` (unavailable, or still loading)
  // stays undefined all the way to the predicate, which turns it into
  // `unknown` — never into 0.
  const settledCount = (
    read: ClubGrowthCheckpointRead | undefined
  ): number | undefined =>
    read?.status === 'resolved' && typeof read.newCharteredClubs === 'number'
      ? read.newCharteredClubs
      : undefined

  const sep30Count = settledCount(readFor('september'))
  const mar31Count = settledCount(readFor('march'))

  const result = resolveClubGrowthAchievement({
    programYear,
    asOfDate: asOfDate ?? '',
    ...(sep30Count !== undefined && { sep30Count }),
    ...(mar31Count !== undefined && { mar31Count }),
    ...(toDateCount !== undefined && toDateCount !== null && { toDateCount }),
  })

  // A1/A5: before PY 2026-2027 the achievement did not exist, so there is
  // nothing to show and nothing to reserve — not an empty shell, not a zeroed
  // card, not "not earned". Absent. This is the FIRST gate: it must win over
  // the loading branch too.
  if (!result.applicable) return null

  const loading =
    isLoading === true ||
    checkpointReads.length === 0 ||
    checkpointReads.some(r => r.status === 'loading')

  if (loading) return <ClubGrowthAchievementCardSkeleton />

  // Past this point the card never returns null: every remaining state —
  // settled, pending, unavailable — renders the same outer geometry, so no
  // transition between them shifts the page (Lesson 125).
  return (
    <section
      className="redesign-panel"
      data-testid="club-growth-achievement"
      aria-labelledby="club-growth-achievement-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2
            id="club-growth-achievement-title"
            className="text-lg font-bold text-gray-900 font-tm-headline"
          >
            Club Growth Achievement
          </h2>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-gray-500 font-tm-body">
            New clubs chartered · {result.programYear}
          </p>
        </div>
        <a
          href={METHODOLOGY_HREF}
          className="inline-flex min-h-11 items-center text-xs font-semibold text-tm-loyal-blue font-tm-body hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-tm-loyal-blue rounded"
        >
          How this is measured
        </a>
      </div>

      <p className="text-sm text-gray-700 font-tm-body">
        Toastmasters International recognises districts that charter 3 or 5 new
        clubs by September 30, and 3, 5 or 10 new clubs by March 31.
      </p>
      {/* The announcement above is the whole published rule. Everything in this
          line is our reading of it (#1473 A2/A3) and says so. */}
      <p className="mt-1 text-xs text-gray-600 font-tm-body">
        We read the counts as cumulative from July 1 — so the March total
        includes the clubs already counted in September — and show the highest
        milestone reached at each checkpoint.
      </p>

      <ul
        data-testid="club-growth-checkpoints"
        className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        {result.checkpoints.map(state => (
          <CheckpointBlock
            key={state.id}
            state={state}
            read={readFor(READ_ID[state.id])}
          />
        ))}
      </ul>
    </section>
  )
}

export default ClubGrowthAchievementCard
