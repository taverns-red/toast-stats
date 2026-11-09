/** Stub (red): the fold lands in the next commit (#2591). */
import type {
  DistrictRegionHistory,
  DistrictReportsDataset,
  EducationLedgerHistoryFile,
  EducationRollupIndex,
  EducationRollupProgramYear,
  EducationTimeline,
  EducationTimelinePrior,
} from '@taverns-red/shared-contracts'

const todo = (): never => {
  throw new Error('not implemented')
}

export function foldReportsDate(_a: {
  programYear: string
  date: string
  reports: readonly DistrictReportsDataset[]
  regionHistory: DistrictRegionHistory | null
}): EducationRollupProgramYear {
  return todo()
}

export function upsertTimelineDate(
  _existing: EducationTimeline | null,
  _programYear: string,
  _date: string,
  _rollup: EducationRollupProgramYear
): EducationTimeline {
  return todo()
}

export function withPrior(
  _t: EducationTimeline,
  _prior: EducationTimelinePrior | null
): EducationTimeline {
  return todo()
}

export function ghostFromTimeline(
  _prior: EducationTimeline
): EducationTimelinePrior {
  return todo()
}

export function ghostFromRollups(
  _programYear: string,
  _entries: readonly { date: string; rollup: EducationRollupProgramYear }[]
): EducationTimelinePrior | null {
  return todo()
}

export function ghostFromLedger(
  _programYear: string,
  _files: readonly EducationLedgerHistoryFile[],
  _regionHistory: DistrictRegionHistory | null
): EducationTimelinePrior | null {
  return todo()
}

export function timelineIndexRow(
  _t: EducationTimeline
): NonNullable<EducationRollupIndex['timelines']>[number] {
  return todo()
}
