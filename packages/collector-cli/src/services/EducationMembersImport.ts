/**
 * EducationMembersImport — one-off import of a prior program year's distinct
 * members per club from a TI Education Achievements CSV export (#1603).
 * Stub: implementation follows the red tests.
 */

export interface EducationExportTable {
  headers: string[]
  rows: string[][]
}

export function parseEducationExportCsv(_text: string): EducationExportTable {
  throw new Error('not implemented')
}

export function formatReportAsOf(_isoDate: string): string {
  throw new Error('not implemented')
}

export interface ImportEducationMembersOptions {
  cacheDir: string
  districtId: string
  programYear: string
  csvText: string
  asOf: string
}

export interface ImportEducationMembersResult {
  districtId: string
  programYear: string
  snapshotDate: string
  path: string
  rowsRead: number
  rowsCounted: number
  clubs: number
  membersWithAward: number
}

export async function importEducationMembers(
  _options: ImportEducationMembersOptions
): Promise<ImportEducationMembersResult> {
  throw new Error('not implemented')
}
