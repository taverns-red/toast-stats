/**
 * Officer-training roll-up (#2296): clubs by officers trained, per round.
 */
import type {
  OfficerTrainingDistribution,
  ScrapedRecord,
} from '@taverns-red/shared-contracts'

export function summarizeOfficerTraining(
  _records: readonly ScrapedRecord[]
): OfficerTrainingDistribution | undefined {
  return undefined
}
