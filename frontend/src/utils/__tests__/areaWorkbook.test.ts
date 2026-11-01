/**
 * Area workbook CSV (#2428): one row per club in one area, built only from
 * what the Area page and the area print pack already derive
 * (`buildCouncilPack` roster marks, `calculateClubProjection` gaps, the
 * program-year deadline table). No member-level data, no contact fields.
 *
 * The snapshot fixture is the raw CDN row shape (`divisionPerformance` +
 * `clubPerformance`, string-valued, zero-padded club numbers) run through
 * the real `extractDivisionPerformance`, as in councilPack.test.ts.
 */
import { describe, it, expect } from 'vitest'
import {
  AREA_WORKBOOK_HEADER,
  areaWorkbookFilename,
  buildAreaWorkbookRows,
} from '../areaWorkbook'
import type { CouncilPackInput } from '../councilPack'
import { extractDivisionPerformance } from '../extractDivisionPerformance'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'

const DATE = '2026-10-27' // PY 2026-27, round 1, after the 30 Sep CSP date
const PY = '2026-2027'

interface RawClub {
  div: string
  area: string
  id: string
  name: string
  status?: string
  csp?: string
  nov?: string
}

function rawSnapshot(clubs: RawClub[]) {
  const divBase = (div: string) => clubs.filter(c => c.div === div).length
  const areaBase = (div: string, area: string) =>
    clubs.filter(c => c.div === div && c.area === area).length
  return {
    divisionPerformance: clubs.map(c => ({
      Division: c.div,
      Area: c.area,
      Club: c.id.padStart(8, '0'),
      'Club Name': c.name,
      'Division Club Base': String(divBase(c.div)),
      'Area Club Base': String(areaBase(c.div, c.area)),
      'Nov Visit award': c.nov ?? '0',
      'May Visit award': '0',
    })),
    clubPerformance: clubs.map(c => ({
      'Club Number': c.id.padStart(8, '0'),
      'Club Name': c.name,
      'Club Status': c.status ?? 'Active',
      'Club Distinguished Status': '',
      CSP: c.csp ?? 'Y',
    })),
  }
}

function club(raw: RawClub, overrides: Partial<ClubTrend> = {}): ClubTrend {
  return {
    clubId: raw.id,
    clubName: raw.name,
    divisionId: raw.div,
    divisionName: `Division ${raw.div}`,
    areaId: raw.area,
    areaName: `Area ${raw.area}`,
    // 18 members, base 18: members gap min(20-18, 3-0) = 2; 4 goals: 1 short.
    membershipTrend: [
      { date: '2026-07-01', count: 18 },
      { date: DATE, count: 18 },
    ],
    dcpGoalsTrend: [{ date: DATE, goalsAchieved: 4 }],
    membershipBase: 18,
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'NotDistinguished',
    cspSubmitted: (raw.csp ?? 'Y') === 'Y',
    clubStatus: raw.status ?? 'Active',
    // Contact fields the workbook must never carry.
    email: 'president@example.org',
    phone: '+1 555 0100',
    website: 'https://zoom.example/j/1',
    ...overrides,
  } as ClubTrend
}

const RAW: RawClub[] = [
  { div: 'B', area: '01', id: '1001', name: 'Bravo Speakers', nov: '1' },
  { div: 'B', area: '01', id: '1002', name: 'Alpha Orators', csp: 'N' },
  {
    div: 'B',
    area: '01',
    id: '1003',
    name: 'Suspended Club',
    status: 'Suspended',
  },
  { div: 'B', area: '02', id: '2001', name: 'Charlie Club', nov: '1' },
  { div: 'C', area: '03', id: '3001', name: 'Other Division Club' },
]

function input(
  overrides: Partial<CouncilPackInput> = {},
  clubOverrides: Record<string, Partial<ClubTrend>> = {},
  raw: RawClub[] = RAW
): CouncilPackInput {
  const snapshotDate = overrides.snapshotDate ?? DATE
  return {
    divisions: extractDivisionPerformance(rawSnapshot(raw), snapshotDate),
    clubs: raw.map(r => club(r, clubOverrides[r.id])),
    snapshotDate,
    programYear: PY,
    ...overrides,
  }
}

const SCOPE = { division: 'B', area: '01' }

/** The rows as objects keyed by header, so each assertion names its column. */
function byHeader(rows: (string | number)[][]) {
  const [header, ...body] = rows
  return body.map(r =>
    Object.fromEntries(header!.map((h, i) => [String(h), r[i]]))
  )
}

describe('buildAreaWorkbookRows (#2428)', () => {
  it('starts with the fixed header', () => {
    const rows = buildAreaWorkbookRows(input(), SCOPE)!
    expect(rows[0]).toEqual([...AREA_WORKBOOK_HEADER])
    expect(AREA_WORKBOOK_HEADER).toEqual([
      'Club Number',
      'Club Name',
      'Division',
      'Area',
      'Health',
      'Members',
      'DCP Goals Met',
      'Distinguished',
      'Missing for Distinguished',
      'Club Visit (Current Round)',
      'Club Success Plan',
      'Next Deadline',
      'Next Deadline For',
    ])
  })

  it('has one row per club in the area, by name, and nothing outside it', () => {
    const rows = byHeader(buildAreaWorkbookRows(input(), SCOPE)!)
    expect(rows.map(r => r['Club Name'])).toEqual([
      'Alpha Orators',
      'Bravo Speakers',
      'Suspended Club',
    ])
    expect(rows.every(r => r['Division'] === 'B' && r['Area'] === '01')).toBe(
      true
    )
  })

  it('matches the route ids case-insensitively', () => {
    const rows = buildAreaWorkbookRows(input(), { division: 'b', area: '01' })
    expect(rows).not.toBeNull()
    expect(rows!.length).toBe(4)
  })

  it('returns null for an area that is not in the snapshot', () => {
    expect(
      buildAreaWorkbookRows(input(), { division: 'B', area: '09' })
    ).toBeNull()
    expect(
      buildAreaWorkbookRows(input(), { division: 'Z', area: '01' })
    ).toBeNull()
  })

  it('fills a club on track: visited, plan filed, gap to Distinguished', () => {
    const bravo = byHeader(buildAreaWorkbookRows(input(), SCOPE)!).find(
      r => r['Club Name'] === 'Bravo Speakers'
    )!
    expect(bravo).toEqual({
      'Club Number': '1001',
      'Club Name': 'Bravo Speakers',
      Division: 'B',
      Area: '01',
      Health: 'Thriving',
      Members: 18,
      'DCP Goals Met': 4,
      Distinguished: '',
      'Missing for Distinguished': '2 members + 1 DCP goal',
      'Club Visit (Current Round)': 'Done',
      'Club Success Plan': 'Filed',
      // Visited and filed, so the next date is the program year's general
      // one after 27 Oct: Round 2 officer training opens 1 Nov.
      'Next Deadline': '2026-11-01',
      'Next Deadline For': 'Round 2 officer training opens',
    })
  })

  it('says a club that missed its plan date cannot be Distinguished', () => {
    const alpha = byHeader(buildAreaWorkbookRows(input(), SCOPE)!).find(
      r => r['Club Name'] === 'Alpha Orators'
    )!
    expect(alpha['Club Visit (Current Round)']).toBe('Not yet')
    expect(alpha['Club Success Plan']).toBe('Not filed (was due 2026-09-30)')
    expect(alpha['Missing for Distinguished']).toBe(
      'Club Success Plan not filed: cannot be Distinguished this program year'
    )
  })

  it('lists the plan as missing, with its date, before the deadline', () => {
    const rows = byHeader(
      buildAreaWorkbookRows(input({ snapshotDate: '2026-09-15' }), SCOPE)!
    )
    const alpha = rows.find(r => r['Club Name'] === 'Alpha Orators')!
    expect(alpha['Club Success Plan']).toBe('Not filed (due 2026-09-30)')
    expect(alpha['Missing for Distinguished']).toBe(
      '2 members + 1 DCP goal + Club Success Plan'
    )
    // The plan's own date beats the general 1 Oct dues date.
    expect(alpha['Next Deadline']).toBe('2026-09-30')
    expect(alpha['Next Deadline For']).toBe('Club Success Plan due')
    const bravo = rows.find(r => r['Club Name'] === 'Bravo Speakers')!
    expect(bravo['Next Deadline']).toBe('2026-10-01')
    expect(bravo['Next Deadline For']).toBe('October dues renewal due')
  })

  it("gives an unvisited club the round's visit date when it comes first", () => {
    const rows = byHeader(
      buildAreaWorkbookRows(input({ snapshotDate: '2026-11-02' }), SCOPE)!
    )
    const alpha = rows.find(r => r['Club Name'] === 'Alpha Orators')!
    expect(alpha['Next Deadline']).toBe('2026-11-30')
    expect(alpha['Next Deadline For']).toBe('Round 1 club visit reports due')
    const bravo = rows.find(r => r['Club Name'] === 'Bravo Speakers')!
    expect(bravo['Next Deadline']).toBe('2027-02-28')
    expect(bravo['Next Deadline For']).toBe('Round 2 officer training closes')
  })

  it('marks a suspended club n/a for visits and the plan', () => {
    const suspended = byHeader(buildAreaWorkbookRows(input(), SCOPE)!).find(
      r => r['Club Name'] === 'Suspended Club'
    )!
    expect(suspended['Club Visit (Current Round)']).toBe('n/a')
    expect(suspended['Club Success Plan']).toBe('n/a')
  })

  it('writes the tier and "Achieved" for a Distinguished club', () => {
    const rows = byHeader(
      buildAreaWorkbookRows(
        input(
          {},
          {
            '1001': {
              distinguishedLevel: 'Select',
              dcpGoalsTrend: [{ date: DATE, goalsAchieved: 7 }],
              membershipTrend: [{ date: DATE, count: 22 }],
            },
          }
        ),
        SCOPE
      )!
    )
    const bravo = rows.find(r => r['Club Name'] === 'Bravo Speakers')!
    expect(bravo['Distinguished']).toBe('Select')
    expect(bravo['Missing for Distinguished']).toBe('Achieved')
    expect(bravo['DCP Goals Met']).toBe(7)
    expect(bravo['Members']).toBe(22)
  })

  it('says "Not required" for the plan in a year before plans were required', () => {
    const rows = byHeader(
      buildAreaWorkbookRows(
        input({ programYear: '2024-2025', snapshotDate: '2024-10-27' }),
        SCOPE
      )!
    )
    const alpha = rows.find(r => r['Club Name'] === 'Alpha Orators')!
    expect(alpha['Club Success Plan']).toBe('Not required')
    expect(alpha['Missing for Distinguished']).not.toMatch(/Success Plan/)
  })

  it('leaves blank cells, not zeros, when a club has no trend points', () => {
    const rows = byHeader(
      buildAreaWorkbookRows(
        input({}, { '1001': { membershipTrend: [], dcpGoalsTrend: [] } }),
        SCOPE
      )!
    )
    const bravo = rows.find(r => r['Club Name'] === 'Bravo Speakers')!
    expect(bravo['Members']).toBe('')
    expect(bravo['DCP Goals Met']).toBe('')
  })

  it('carries no contact or member-level fields', () => {
    const text = JSON.stringify(buildAreaWorkbookRows(input(), SCOPE))
    expect(text).not.toMatch(/example\.org|555 0100|zoom\.example/)
  })
})

describe('areaWorkbookFilename (#2428)', () => {
  it('names the district, the area and the snapshot date', () => {
    expect(
      areaWorkbookFilename({
        districtId: '61',
        divisionId: 'B',
        areaId: '01',
        snapshotDate: '2026-10-27',
      })
    ).toBe('area_workbook_district_61_area_B01_2026-10-27.csv')
  })

  it('keeps only filename-safe characters from the ids', () => {
    expect(
      areaWorkbookFilename({
        districtId: '61',
        divisionId: 'b/..',
        areaId: '0 1',
        snapshotDate: '2026-10-27',
      })
    ).toBe('area_workbook_district_61_area_B01_2026-10-27.csv')
  })
})
