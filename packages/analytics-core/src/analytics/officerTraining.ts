/**
 * Officer-training roll-up (#2296): clubs by officers trained, per round.
 *
 * TI's club performance export carries `Off. Trained Round 1` (Round 1,
 * Jun–Aug) and `Off. Trained Round 2` (Round 2, Nov–Feb): a COUNT of club
 * officers trained, 0–7, not which officers. DCP goal 9 needs 4+ in each
 * round. The columns (and their aliases) are read through the goal-9
 * definition, so this roll-up and the per-club DCP goals panel read the same
 * cells and cannot disagree.
 *
 * Officer training is not part of the education program.
 */
import type {
  OfficerTrainingDistribution,
  ScrapedRecord,
} from '@taverns-red/shared-contracts'
import {
  DCP_GOAL_DEFINITIONS,
  readDcpGoalColumn,
  type DcpGoalColumn,
} from './dcpGoalDefinitions.js'

/** Officers a club has; the distribution's last index. */
export const OFFICER_TRAINING_MAX_OFFICERS = 7

const goal9 = DCP_GOAL_DEFINITIONS.find(definition => definition.goal === 9)
if (!goal9 || goal9.requirements.length !== 2) {
  throw new Error('DCP goal 9 must define exactly two officer-training rounds')
}

/** The goal-9 column for each round, in round order. */
export const OFFICER_TRAINING_ROUND_COLUMNS: readonly [
  DcpGoalColumn,
  DcpGoalColumn,
] = [goal9.requirements[0]!.anyOf[0]!, goal9.requirements[1]!.anyOf[0]!]

/** DCP goal 9's threshold: officers trained per round (4). */
export const OFFICER_TRAINING_DCP_THRESHOLD =
  OFFICER_TRAINING_ROUND_COLUMNS[0].required

const carriesColumn = (record: ScrapedRecord, column: DcpGoalColumn): boolean =>
  column.aliases.some(alias => alias in record)

/** One club's officers trained in a round, clamped into 0–7. */
export function officersTrainedInRound(
  record: ScrapedRecord,
  round: 1 | 2
): number {
  const value = readDcpGoalColumn(
    record,
    OFFICER_TRAINING_ROUND_COLUMNS[round - 1]!
  )
  return Math.max(0, Math.min(OFFICER_TRAINING_MAX_OFFICERS, value))
}

/**
 * Clubs by officers trained in each round. A club is counted in a round when
 * its record carries that round's column (a blank cell reads 0, as goal 9
 * reads it). Undefined when no record carries either column: an export from
 * before the columns existed is "not measured", never a block of zeros.
 */
export function summarizeOfficerTraining(
  records: readonly ScrapedRecord[]
): OfficerTrainingDistribution | undefined {
  const round1 = new Array<number>(OFFICER_TRAINING_MAX_OFFICERS + 1).fill(0)
  const round2 = new Array<number>(OFFICER_TRAINING_MAX_OFFICERS + 1).fill(0)
  let measured = false
  for (const record of records) {
    if (carriesColumn(record, OFFICER_TRAINING_ROUND_COLUMNS[0])) {
      round1[officersTrainedInRound(record, 1)]! += 1
      measured = true
    }
    if (carriesColumn(record, OFFICER_TRAINING_ROUND_COLUMNS[1])) {
      round2[officersTrainedInRound(record, 2)]! += 1
      measured = true
    }
  }
  return measured ? { round1, round2 } : undefined
}
