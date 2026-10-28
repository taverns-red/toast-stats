/**
 * Council print packs (#2299): `buildCouncilPack` composes the derivations the
 * Area and Division pages already show — `extractDivisionPerformance` for
 * recognition, visits and Club Success Plans, `buildActionList` for the
 * close-to-Distinguished list — and adds no rule of its own (R7). These are
 * parity tests (Lesson 052): every section must equal the source it reads.
 *
 * The snapshot fixture uses the raw CDN row shape (`divisionPerformance` +
 * `clubPerformance`, string-valued columns), run through the real
 * `extractDivisionPerformance`, so the pack is tested against what the pages
 * actually derive rather than hand-built performance objects.
 */
import { describe, it, expect } from 'vitest'
import {
  buildCouncilPack,
  COUNCIL_PACK_LIST_CAP,
  type CouncilPackInput,
} from '../councilPack'
import { extractDivisionPerformance } from '../extractDivisionPerformance'
import { buildActionList } from '../actionListData'
import { getAreaVisitDeadlines } from '../areaRecognitionState'
import { divisionChip } from '../../components/DivisionRecognitionChip'
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
      'Club Number': c.id,
      'Club Name': c.name,
      'Division Club Base': String(divBase(c.div)),
      'Area Club Base': String(areaBase(c.div, c.area)),
      'Nov Visit award': c.nov ?? '0',
      'May Visit award': '0',
    })),
    clubPerformance: clubs.map(c => ({
      'Club Number': c.id,
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
    // members gap min(20-18, 3-0) = 2, 4 goals, CSP filed: close to D.
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
    // Contact fields the pack must never carry onto paper.
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
  { div: 'B', area: '02', id: '2002', name: 'Delta Club' },
  { div: 'C', area: '03', id: '3001', name: 'Other Division Club' },
]

function input(
  raw: RawClub[] = RAW,
  overrides: Partial<CouncilPackInput> = {}
) {
  const snapshot = rawSnapshot(raw)
  const divisions = extractDivisionPerformance(snapshot, DATE)
  const clubs = raw.map(r =>
    // Delta is far from Distinguished (1 goal) so not every club qualifies.
    r.id === '2002'
      ? club(r, { dcpGoalsTrend: [{ date: DATE, goalsAchieved: 1 }] })
      : club(r)
  )
  return {
    divisions,
    clubs,
    snapshotDate: DATE,
    programYear: PY,
    ...overrides,
  } satisfies CouncilPackInput
}

describe('buildCouncilPack (#2299)', () => {
  it('returns null for a division or area that is not in the snapshot', () => {
    expect(buildCouncilPack(input(), { division: 'Z' })).toBeNull()
    expect(buildCouncilPack(input(), { division: 'B', area: '09' })).toBeNull()
  })

  it('matches ids case-insensitively, as the Area and Division pages do', () => {
    const pack = buildCouncilPack(input(), { division: 'b', area: '01' })
    expect(pack?.divisionId).toBe('B')
    expect(pack?.areaId).toBe('01')
  })

  describe('division scope', () => {
    const data = input()
    const pack = buildCouncilPack(data, { division: 'B' })!
    const division = data.divisions.find(d => d.divisionId === 'B')!

    it('carries the division recognition figures unchanged', () => {
      expect(pack.recognition).toMatchObject({
        paidClubs: division.paidClubs,
        clubBase: division.clubBase,
        distinguishedClubs: division.distinguishedClubs,
        requiredDistinguishedClubs: division.requiredDistinguishedClubs,
      })
      // The same chip the phone division rows show (net loss outranks the
      // tier: the suspended club leaves paid clubs under the base here).
      expect(pack.recognition.label).toBe(divisionChip(division).label)
      expect(pack.recognition.label).toBe('Net loss')
    })

    it('lists every area of the division, in snapshot order', () => {
      expect(pack.areas.map(a => a.areaId)).toEqual(
        division.areas.map(a => a.areaId)
      )
    })

    it('reads each area’s current-round visits from AreaPerformance', () => {
      const { r1 } = getAreaVisitDeadlines(DATE)
      expect(pack.visitRound).toBe(1)
      expect(pack.visitDeadline).toBe(r1)
      for (const row of pack.areas) {
        const area = division.areas.find(a => a.areaId === row.areaId)!
        expect(row.visits).toEqual(area.firstRoundVisits)
        expect(row.missingVisit).toEqual(area.clubsMissingCurrentRoundVisit)
        expect(row.recognition).toBeTruthy()
      }
    })

    it('equals buildActionList’s close-to-Distinguished list for the scope', () => {
      const expected = buildActionList(
        {
          clubs: data.clubs,
          interventionClubs: [],
          divisions: data.divisions,
          snapshotDate: DATE,
          programYear: PY,
        },
        { division: 'B' }
      ).closeToDistinguished
      expect(pack.closeToDistinguished.total).toBe(expected.length)
      expect([...pack.closeToDistinguished.shown].sort(byId)).toEqual(
        [...expected].sort(byId)
      )
      // Out-of-division clubs never appear.
      expect(
        pack.closeToDistinguished.shown.every(c => c.divisionId === 'B')
      ).toBe(true)
    })

    it('reads Club Success Plan status from the division roll-up', () => {
      expect(pack.csp.tracked).toBe(true)
      expect(pack.csp.submitted).toBe(division.cspSubmittedCount)
      expect(pack.csp.held).toBe(
        division.cspSubmittedCount + division.clubsMissingCsp.length
      )
      expect(pack.csp.missing.total).toBe(division.clubsMissingCsp.length)
      expect(pack.csp.missing.shown.map(c => c.clubNumber)).toEqual(
        division.clubsMissingCsp.map(c => c.clubNumber)
      )
      expect(pack.csp.missing.shown[0]).toMatchObject({
        clubName: 'Alpha Orators',
        areaId: '01',
      })
    })

    it('builds the roster from the scope’s clubs, by area then name', () => {
      expect(pack.roster.map(r => r.clubName)).toEqual([
        'Alpha Orators',
        'Bravo Speakers',
        'Suspended Club',
        'Charlie Club',
        'Delta Club',
      ])
    })

    it('marks each roster club’s current-round visit and plan from the area lists', () => {
      const byName = Object.fromEntries(pack.roster.map(r => [r.clubName, r]))
      expect(byName['Bravo Speakers']).toMatchObject({
        visit: 'done',
        csp: 'submitted',
      })
      expect(byName['Alpha Orators']).toMatchObject({
        visit: 'missing',
        csp: 'missing',
      })
      // A suspended club is not held to the visit or the plan (flagged lists).
      expect(byName['Suspended Club']).toMatchObject({
        visit: 'not-held',
      })
      expect(byName['Bravo Speakers']).toMatchObject({
        members: 18,
        goals: 4,
        health: 'Thriving',
        distinguished: '—',
      })
    })

    it('never carries contact details or meeting links onto the pack', () => {
      const keys = new Set(pack.roster.flatMap(r => Object.keys(r)))
      expect([...keys].sort()).toEqual(
        [
          'areaId',
          'clubId',
          'clubName',
          'csp',
          'distinguished',
          'goals',
          'health',
          'members',
          'visit',
        ].sort()
      )
      const text = JSON.stringify(pack)
      expect(text).not.toMatch(/example\.org|555 0100|zoom/)
    })
  })

  describe('area scope', () => {
    const data = input()
    const pack = buildCouncilPack(data, { division: 'B', area: '01' })!
    const area = data.divisions
      .find(d => d.divisionId === 'B')!
      .areas.find(a => a.areaId === '01')!

    it('carries only that area, with its own recognition figures', () => {
      expect(pack.areas.map(a => a.areaId)).toEqual(['01'])
      expect(pack.recognition).toMatchObject({
        paidClubs: area.paidClubs,
        clubBase: area.clubBase,
        distinguishedClubs: area.distinguishedClubs,
        requiredDistinguishedClubs: area.requiredDistinguishedClubs,
      })
    })

    it('scopes close-to-Distinguished, plans and roster to the area', () => {
      const expected = buildActionList(
        {
          clubs: data.clubs,
          interventionClubs: [],
          divisions: data.divisions,
          snapshotDate: DATE,
          programYear: PY,
        },
        { division: 'B', area: '01' }
      ).closeToDistinguished
      expect(pack.closeToDistinguished.total).toBe(expected.length)
      expect(pack.csp.submitted).toBe(area.cspSubmittedCount)
      expect(pack.csp.missing.total).toBe(area.clubsMissingCsp.length)
      expect(pack.roster.every(r => r.areaId === '01')).toBe(true)
      expect(pack.roster).toHaveLength(3)
    })
  })

  it('caps long lists and counts the rest, never clipping silently', () => {
    const many: RawClub[] = Array.from(
      { length: COUNCIL_PACK_LIST_CAP + 3 },
      (_, i) => ({
        div: 'B',
        area: '01',
        id: String(5000 + i),
        name: `Club ${String(i).padStart(2, '0')}`,
        csp: 'N',
      })
    )
    const pack = buildCouncilPack(
      // Every club filed nothing, so none is close (the predicate needs a
      // plan): give the close list its own clubs with plans filed.
      input(many, {
        clubs: many.map(r => club({ ...r, csp: 'Y' })),
      }),
      { division: 'B' }
    )!
    expect(pack.closeToDistinguished.total).toBe(COUNCIL_PACK_LIST_CAP + 3)
    expect(pack.closeToDistinguished.shown).toHaveLength(COUNCIL_PACK_LIST_CAP)
    expect(pack.closeToDistinguished.more).toBe(3)
    expect(pack.csp.missing.shown).toHaveLength(COUNCIL_PACK_LIST_CAP)
    expect(pack.csp.missing.more).toBe(3)
  })

  it('has no Club Success Plan section before 2025-26 (isCspRequired)', () => {
    const date = '2024-10-15'
    const snapshot = rawSnapshot(RAW)
    const pack = buildCouncilPack(
      {
        divisions: extractDivisionPerformance(snapshot, date),
        clubs: RAW.map(r => club(r, { cspSubmitted: undefined })),
        snapshotDate: date,
        programYear: '2024-2025',
      },
      { division: 'B' }
    )!
    expect(pack.csp.tracked).toBe(false)
    expect(pack.csp.missing.total).toBe(0)
    expect(pack.roster.every(r => r.csp === null)).toBe(true)
  })
})

function byId(a: { clubId: string }, b: { clubId: string }) {
  return a.clubId.localeCompare(b.clubId)
}
