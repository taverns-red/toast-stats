/**
 * `v1/global-history.json` assembler (#1499, epic #1496) — STUB.
 *
 * Red-phase placeholder so the specification in
 * `__tests__/globalHistory.test.ts` fails on its assertions rather than on a
 * missing module. Implemented in the green commit that follows.
 */

import {
  GLOBAL_HISTORY_FORMAT,
  type GlobalHistory,
  type GlobalHistoryEducation,
} from '@taverns-red/shared-contracts'

export interface ProgramYearEndSelection {
  readonly programYear: string
  readonly yearEndDate: string
  readonly marchDate: string | null
}

export interface GlobalHistoryReportsFile {
  readonly districtId: string
  readonly dataset: unknown
}

export interface GlobalHistoryYearSource {
  readonly programYear: string
  readonly yearEndDate: string
  readonly marchDate: string | null
  readonly yearEndTotals: unknown | null
  readonly marchTotals: unknown | null
  readonly rankingsDistrictIds: readonly string[] | null
  readonly reports: readonly GlobalHistoryReportsFile[] | null
}

export interface GlobalHistoryBuildResult {
  readonly history: GlobalHistory
  readonly warnings: readonly string[]
}

export function selectProgramYearEnds(
  _dates: readonly string[],
  _asOfDate: string
): ProgramYearEndSelection[] {
  return []
}

export function summarizeEducation(
  _reports: readonly GlobalHistoryReportsFile[],
  _rankingsDistrictIds: readonly string[] | null
): GlobalHistoryEducation | null {
  return null
}

export function buildGlobalHistory(
  _sources: readonly GlobalHistoryYearSource[],
  generatedAt: string
): GlobalHistoryBuildResult {
  return {
    history: {
      _format: GLOBAL_HISTORY_FORMAT,
      generatedAt,
      years: [],
      omitted: [],
    },
    warnings: [],
  }
}
