/**
 * District Club Growth Achievement — the predicate (#1474, epic #1473).
 *
 * Toastmasters International introduced this recognition for PY 2026-2027.
 * The announcement is the entire published spec; quoted verbatim:
 *
 *   > This new achievement celebrates Districts that reach key club charter
 *   > milestones by **September 30** and **March 31**.
 *   > **September 30 Milestones** — Charter 3 or 5 new clubs
 *   > **March 31 Milestones** — Charter 3, 5, or 10 new clubs
 *
 * Everything below that is an operator ruling recorded on #1473, not TI's
 * words — copy that surfaces this must not present them as TI's:
 *
 *   A1  Effective PY 2026-2027. Gated the way the club Smedley rung is
 *       (`clubTiersForProgramYear`, #1406) — an earlier program year is
 *       NOT-APPLICABLE, never "not earned". A recognition that did not exist
 *       cannot have been missed.
 *   A2  Counts are cumulative from July 1. The March 31 count INCLUDES the
 *       clubs already counted on September 30 — one running total, two
 *       checkpoints — which is exactly how `newCharteredClubs` is computed
 *       upstream (charter date ≥ PY start).
 *   A3  3 / 5 / 10 are tiers within a checkpoint; a district holds the
 *       highest one it reached.
 *   A5  Forward-only. No "would have earned" backfill for past years.
 *
 * ── The load-bearing constraint on the CALLER ───────────────────────────────
 * A settled checkpoint's count must be read from THAT DATE'S OWN rankings
 * snapshot, never recomputed from current rankings. A district's charter
 * count can go DOWN mid-year without any charter being revoked: the global
 * sum across districts is strictly monotonic (81 → 638 over PY 2025-26), but
 * clubs chartered this year move between districts and the per-district count
 * follows them. Recomputing from today would let an April transfer erase a
 * September 30 achievement (#1473, measured). This module therefore takes the
 * checkpoint counts as INPUTS and never guesses one from another: `toDateCount`
 * decides only checkpoints that have not happened yet.
 *
 * Pure and date-injected — the caller pins the as-of date (a snapshot date),
 * so a historical view gates on the data's own clock, not the wall clock.
 */

/** The first program year the achievement exists (A1). */
export const CLUB_GROWTH_ACHIEVEMENT_FIRST_PROGRAM_YEAR = '2026-2027'

/** Start year of `CLUB_GROWTH_ACHIEVEMENT_FIRST_PROGRAM_YEAR`. */
const FIRST_START_YEAR = 2026

/** Milestones TI lists for the September 30 checkpoint, ascending. */
const SEPTEMBER_30_MILESTONES: readonly number[] = [3, 5]

/** Milestones TI lists for the March 31 checkpoint, ascending. */
const MARCH_31_MILESTONES: readonly number[] = [3, 5, 10]

export type ClubGrowthCheckpointId = 'september30' | 'march31'

/** One checkpoint of one program year: when it falls and what it asks for. */
export interface ClubGrowthCheckpoint {
  id: ClubGrowthCheckpointId
  /** Deadline as an ISO `YYYY-MM-DD` string. */
  date: string
  /** Milestone tiers, ascending (A3 — the district holds the highest met). */
  milestones: readonly number[]
}

/**
 * A checkpoint's verdict.
 *
 *  - `settled` — the checkpoint date has passed and its own count is known.
 *  - `pending` — the checkpoint is still ahead; the running total counts down
 *    to the next milestone. `remaining` is a CLAMPED gap ("N more"), never a
 *    signed delta — do not label it growth or change (Lesson 102).
 *  - `unknown` — the deciding count is unavailable. Deliberately carries no
 *    `count`: rendering 0 for a data gap claims "zero charters", which is a
 *    different and falsifiable statement.
 */
export type ClubGrowthCheckpointState = ClubGrowthCheckpoint &
  (
    | {
        status: 'settled'
        /** The count as it stood at the checkpoint, from that date's data. */
        count: number
        /** Highest milestone reached, or `null` for none (A3). */
        milestoneReached: number | null
      }
    | {
        status: 'pending'
        /** Running total so far, from the as-of date's data. */
        count: number
        /** Highest milestone already secured, or `null`. */
        milestoneReached: number | null
        /** Lowest milestone not yet reached, or `null` when all are. */
        nextMilestone: number | null
        /** Clamped distance to `nextMilestone`; 0 once none remain. */
        remaining: number
      }
    | { status: 'unknown' }
  )

export type ClubGrowthNotApplicableReason =
  /** The program year predates the achievement (A1/A5). */
  | 'before-first-program-year'
  /** The program year is not a `YYYY-YYYY` pair of consecutive years. */
  | 'unrecognised-program-year'

export type ClubGrowthAchievementResult =
  | {
      applicable: false
      programYear: string
      reason: ClubGrowthNotApplicableReason
    }
  | {
      applicable: true
      programYear: string
      /** September 30 first, then March 31 — the order they fall in. */
      checkpoints: readonly ClubGrowthCheckpointState[]
    }

export interface ClubGrowthAchievementInput {
  /** Program year the counts belong to, `"YYYY-YYYY"` (R3: from the parent). */
  programYear: string
  /**
   * The date the data is as of — a PINNED snapshot date, not the wall clock.
   * A checkpoint on or before this date is settled; one after it is pending.
   */
  asOfDate: string
  /** Charters as of September 30, read from that date's own snapshot. */
  sep30Count?: number
  /** Charters as of March 31, read from that date's own snapshot (A2). */
  mar31Count?: number
  /** The running total at `asOfDate` — decides pending checkpoints only. */
  toDateCount?: number
}

/**
 * Start year of a `"YYYY-YYYY"` program year, or `null` when the string is not
 * one (`"2026-2028"` and `"2026"` are both rejected).
 *
 * String-slice parsing is intentional: `new Date(...)` is timezone-sensitive
 * and there is no date here to parse, only a label.
 */
const programYearStartYear = (programYear: string): number | null => {
  const match = /^(\d{4})-(\d{4})$/.exec(programYear)
  if (!match) return null
  const start = Number.parseInt(match[1]!, 10)
  const end = Number.parseInt(match[2]!, 10)
  return end === start + 1 ? start : null
}

/** ISO `YYYY-MM-DD` prefix of a date string, or `null` if it is not one. */
const toIsoDate = (value: string): string | null => {
  const iso = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null
}

/**
 * The two checkpoints of a program year, in the order they fall.
 *
 * Exported so a caller that must FETCH a checkpoint's data (the
 * `useClubGrowthMilestones` hook, #1475) resolves its dates from the same
 * place the verdict does — a countdown and the gate it counts down to are one
 * fact, and so are a checkpoint's date and its milestones (Lesson 103).
 *
 * Returns `null` when the program year cannot be placed on a calendar.
 */
export const clubGrowthCheckpoints = (
  programYear: string
): readonly ClubGrowthCheckpoint[] | null => {
  const startYear = programYearStartYear(programYear)
  if (startYear === null) return null
  return [
    {
      id: 'september30',
      date: `${startYear}-09-30`,
      milestones: SEPTEMBER_30_MILESTONES,
    },
    {
      id: 'march31',
      date: `${startYear + 1}-03-31`,
      milestones: MARCH_31_MILESTONES,
    },
  ]
}

/** Highest milestone `count` reaches, or `null` for none (A3). */
const highestMilestoneReached = (
  count: number,
  milestones: readonly number[]
): number | null => {
  let reached: number | null = null
  for (const milestone of milestones) {
    if (count >= milestone) reached = milestone
  }
  return reached
}

/** Lowest milestone still ahead of `count`, or `null` when all are reached. */
const nextMilestoneAfter = (
  count: number,
  milestones: readonly number[]
): number | null => milestones.find(milestone => count < milestone) ?? null

/** Resolve one checkpoint against the count that decides it. */
const resolveCheckpoint = (
  checkpoint: ClubGrowthCheckpoint,
  settled: boolean,
  count: number | undefined
): ClubGrowthCheckpointState => {
  if (count === undefined) return { ...checkpoint, status: 'unknown' }

  if (settled) {
    return {
      ...checkpoint,
      status: 'settled',
      count,
      milestoneReached: highestMilestoneReached(count, checkpoint.milestones),
    }
  }

  const nextMilestone = nextMilestoneAfter(count, checkpoint.milestones)
  return {
    ...checkpoint,
    status: 'pending',
    count,
    milestoneReached: highestMilestoneReached(count, checkpoint.milestones),
    nextMilestone,
    // Clamped: a gap, not a delta. Zero once every milestone is secured.
    remaining: nextMilestone === null ? 0 : Math.max(0, nextMilestone - count),
  }
}

/**
 * Resolve a district's Club Growth Achievement standing for a program year.
 *
 * Unlike the Smedley ladder — where an unknown program year falls back to the
 * current rules — an unusable program year here is NOT-APPLICABLE. The
 * checkpoint dates are derived from the year itself, so there is no calendar
 * to fall back to; guessing one would date a deadline wrong.
 */
export const resolveClubGrowthAchievement = (
  input: ClubGrowthAchievementInput
): ClubGrowthAchievementResult => {
  const { programYear, asOfDate, sep30Count, mar31Count, toDateCount } = input

  const startYear = programYearStartYear(programYear)
  if (startYear === null) {
    return {
      applicable: false,
      programYear,
      reason: 'unrecognised-program-year',
    }
  }
  if (startYear < FIRST_START_YEAR) {
    return {
      applicable: false,
      programYear,
      reason: 'before-first-program-year',
    }
  }

  const checkpoints = clubGrowthCheckpoints(programYear)!
  const asOf = toIsoDate(asOfDate)
  const settledCounts: Record<ClubGrowthCheckpointId, number | undefined> = {
    september30: sep30Count,
    march31: mar31Count,
  }

  return {
    applicable: true,
    programYear,
    checkpoints: checkpoints.map(checkpoint => {
      // Undated data cannot be placed relative to a deadline, so neither
      // verdict can be claimed — every checkpoint is unknown.
      if (asOf === null) return { ...checkpoint, status: 'unknown' as const }
      // Lexical comparison is safe on `YYYY-MM-DD`, and the deadline day
      // itself counts as settled (its snapshot IS the checkpoint value).
      const settled = asOf >= checkpoint.date
      return resolveCheckpoint(
        checkpoint,
        settled,
        settled ? settledCounts[checkpoint.id] : toDateCount
      )
    }),
  }
}
