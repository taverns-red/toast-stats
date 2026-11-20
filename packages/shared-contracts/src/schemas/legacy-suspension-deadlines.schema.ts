import { z } from 'zod'

export interface LegacySuspensionDeadlines {
  _format: { version: string; type: 'legacy-suspension-deadlines' }
  generatedAt: string
  expires: string
  sourceDates: string[]
  rowCount: number
  rowsSha256: string
  rows: Record<string, string>
}

export const LegacySuspensionDeadlinesSchema =
  z.custom<LegacySuspensionDeadlines>(() => false)

export const LEGACY_SUSPENSION_DEADLINES_FORMAT: LegacySuspensionDeadlines['_format'] =
  { version: '1.0.0', type: 'legacy-suspension-deadlines' }

export const LEGACY_SUSPENSION_DEADLINES_PATH =
  'config/legacy-suspension-deadlines.json'

export const LEGACY_SUSPENSION_DEADLINES_EXPIRES = '2027-10-01'
