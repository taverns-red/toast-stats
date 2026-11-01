/**
 * Area workbook CSV (#2428). Red-phase stub: the signatures only.
 */
import type { CouncilPackInput } from './councilPack'

export const AREA_WORKBOOK_HEADER: readonly string[] = []

export interface AreaWorkbookScope {
  division: string
  area: string
}

export function buildAreaWorkbookRows(
  _input: CouncilPackInput,
  _scope: AreaWorkbookScope
): (string | number)[][] | null {
  return null
}

export function areaWorkbookFilename(_args: {
  districtId: string
  divisionId: string
  areaId: string
  snapshotDate: string
}): string {
  return ''
}
