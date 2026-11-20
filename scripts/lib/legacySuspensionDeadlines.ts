import type { LegacySuspensionDeadlines } from '@taverns-red/shared-contracts'

export interface ClubObservation {
  date: string
  status: string | undefined
}

export const LEGACY_SOURCE_FROM = ''
export const LEGACY_SOURCE_TO = ''

export function lastDeadlineOnOrBefore(_date: string): string {
  return ''
}

export function deriveSuspensionDeadlines(
  _history: ReadonlyMap<string, readonly ClubObservation[]>
): Record<string, string> {
  return {}
}

export function clubStatusesOf(
  _snapshot: unknown
): Array<{ clubNumber: string; status: string | undefined }> {
  return []
}

export function rowsSha256(_rows: Record<string, string>): string {
  return ''
}

export function buildLegacySuspensionDeadlines(_input: {
  rows: Record<string, string>
  sourceDates: readonly string[]
  generatedAt: string
}): LegacySuspensionDeadlines {
  throw new Error('not built')
}

export function planLegacySources(_listing: string): {
  objects: Array<{ url: string; date: string; size: number }>
  count: number
  bytes: number
  dates: string[]
} {
  return { objects: [], count: 0, bytes: 0, dates: [] }
}
