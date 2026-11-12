/**
 * Clubs CSV export carries every column the table shows (#2676, spec §9).
 *
 * The export is the whole schema, whatever the table's Columns menu hides, so
 * two people with the same link get the same file. The fields the table shows
 * but the CSV lacked are appended at the END, keeping the existing positions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exportClubPerformance } from '../csvExport'

describe('CSV Export - all table columns (#2676)', () => {
  let captured: string | null = null
  let originalBlob: typeof Blob
  let originalCreate: typeof URL.createObjectURL
  let originalRevoke: typeof URL.revokeObjectURL

  beforeEach(() => {
    captured = null
    originalCreate = URL.createObjectURL
    originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) =>
      tagName === 'a'
        ? ({
            setAttribute: vi.fn(),
            click: vi.fn(),
            style: {},
          } as unknown as HTMLAnchorElement)
        : realCreate(tagName)
    )
    vi.spyOn(document.body, 'appendChild').mockImplementation(
      () => null as unknown as HTMLElement
    )
    vi.spyOn(document.body, 'removeChild').mockImplementation(
      () => null as unknown as HTMLElement
    )
    originalBlob = globalThis.Blob
    globalThis.Blob = class MockBlob {
      constructor(
        parts?: ConstructorParameters<typeof Blob>[0],
        options?: ConstructorParameters<typeof Blob>[1]
      ) {
        if (parts && parts.length > 0) captured = parts[0] as string
        return new originalBlob(parts, options)
      }
    } as typeof Blob
  })

  afterEach(() => {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    globalThis.Blob = originalBlob
    vi.restoreAllMocks()
  })

  const club = (over: Record<string, unknown> = {}) => ({
    clubId: '1001',
    clubName: 'Alpha',
    divisionName: 'Division A',
    areaName: 'Area 11',
    membershipTrend: [{ date: '2026-11-11', count: 17 }],
    dcpGoalsTrend: [{ date: '2026-11-11', goalsAchieved: 4 }],
    currentStatus: 'thriving',
    distinguishedLevel: 'Select',
    riskFactors: [],
    ...over,
  })

  const table = (): { headers: string[]; rows: string[][] } => {
    expect(captured).not.toBeNull()
    const lines = captured!.split('\n')
    return {
      headers: lines[4].split(','),
      rows: lines
        .slice(5)
        .filter(l => l.trim())
        .map(l => l.split(',')),
    }
  }

  it('appends the fields the table shows after the existing columns', () => {
    exportClubPerformance([club()], '61')
    const { headers } = table()
    expect(headers.slice(0, 14)).toEqual([
      'Club ID',
      'Club Name',
      'Division',
      'Area',
      'Current Membership',
      'Current DCP Goals',
      'Status',
      'Club Status',
      'Coach',
      'Distinguished Level',
      'Oct Ren',
      'Apr Ren',
      'New',
      'Risk Factors',
    ])
    expect(headers.slice(14)).toEqual([
      'Members Base',
      'Members Needed',
      'Net Change',
      'Years Chartered',
      'Distinguished Confirmed',
    ])
  })

  it('exports the values the table shows', () => {
    exportClubPerformance(
      [
        club({
          membershipBase: 20,
          membersNeeded: 3,
          netChange: -2,
          yearsChartered: 12,
        }),
      ],
      '61'
    )
    const { headers, rows } = table()
    const at = (name: string): string => rows[0][headers.indexOf(name)]
    expect(at('Members Base')).toBe('20')
    expect(at('Members Needed')).toBe('3')
    expect(at('Net Change')).toBe('-2')
    expect(at('Years Chartered')).toBe('12')
  })

  it('leaves unknown values blank rather than inventing zeros', () => {
    exportClubPerformance([club()], '61')
    const { headers, rows } = table()
    const at = (name: string): string => rows[0][headers.indexOf(name)]
    expect(at('Members Base')).toBe('')
    expect(at('Net Change')).toBe('')
    expect(at('Years Chartered')).toBe('')
  })

  it('says whether a tier is confirmed, so provisional is not lost', () => {
    exportClubPerformance(
      [
        club({ clubId: '1', distinguishedLevel: 'Select' }),
        club({
          clubId: '2',
          distinguishedLevel: 'Select',
          isProvisionallyDistinguished: true,
        }),
        club({ clubId: '3', distinguishedLevel: 'NotDistinguished' }),
      ],
      '61'
    )
    const { headers, rows } = table()
    const col = headers.indexOf('Distinguished Confirmed')
    expect(rows.map(r => r[col])).toEqual(['Yes', 'No', 'No'])
  })
})
