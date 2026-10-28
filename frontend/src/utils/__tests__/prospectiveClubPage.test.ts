import { describe, it, expect } from 'vitest'
import type {
  DistrictReportsDataset,
  ProspectiveClub,
} from '@taverns-red/shared-contracts'
import recorded from '../../__tests__/fixtures/prospective-club-page.recorded.json'
import {
  buildProspectiveClubPage,
  parseProspectChecklist,
  prospectiveClubHref,
  type ChecklistStep,
} from '../prospectiveClubPage'

/* #2303 — the in-site prospective club page. Every row is RECORDED from prod
   2026-10-27 (see the fixture's _provenance); names and place text are
   scrubbed to placeholders, the TI step text is verbatim. */

const d84 = recorded.d84_reports as unknown as DistrictReportsDataset
const d25 = recorded.d25_reports as unknown as DistrictReportsDataset
const fac84 = recorded.d84_findAClub as unknown as ProspectiveClub[]
const AS_OF = recorded.snapshotDate

const prospect = (r: DistrictReportsDataset, club: string) =>
  r.sections.prospectiveClubs!.records.find(x => x.club === club)!.prospect

const byKey = (steps: ChecklistStep[]) =>
  Object.fromEntries(steps.map(s => [s.key, s]))

describe('parseProspectChecklist (recorded TI text)', () => {
  it('lists the six steps and Payment, in TI order, every time', () => {
    const steps = parseProspectChecklist(prospect(d84, '28679702'), AS_OF)!
    expect(steps.map(s => s.key)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      'payment',
    ])
    expect(steps.map(s => s.label)).toEqual([
      'Application to Organize',
      'Certificate & Remit',
      'Roster',
      'Officer Info',
      'Club Info',
      'Constitution & Bylaws',
      'Payment',
    ])
  })

  it('marks steps TI does not print as not listed — not incomplete', () => {
    // '#1 Application to Organize Complete - 01/20/2026Payment Complete - 01/22/2026'
    const s = byKey(parseProspectChecklist(prospect(d84, '28679702'), AS_OF)!)
    expect(s['1']).toMatchObject({ status: 'complete', date: '2026-01-20' })
    for (const k of ['2', '3', '4', '5', '6']) {
      expect(s[k]).toMatchObject({
        status: 'not-listed',
        date: null,
        daysSince: null,
      })
    }
    expect(s.payment).toMatchObject({ status: 'complete', date: '2026-01-22' })
  })

  it('reads each step on its own: out of order, and a step gone back (D25)', () => {
    // #2 Incomplete (08/14) while #3–#6 are Complete: a checklist, not a ladder.
    const s = byKey(parseProspectChecklist(prospect(d25, '28680093'), AS_OF)!)
    expect(s['2']).toMatchObject({
      status: 'incomplete',
      date: '2026-08-14',
      daysSince: 74,
    })
    expect(s['3']).toMatchObject({ status: 'complete', date: '2026-06-30' })
    expect(s['6']).toMatchObject({ status: 'complete', date: '2026-06-15' })
    expect(s.payment).toMatchObject({ status: 'complete', date: '2026-04-17' })
  })

  it('reads every step after #1 as incomplete with its date (D84)', () => {
    const s = byKey(parseProspectChecklist(prospect(d84, '28680214'), AS_OF)!)
    expect(s['1']).toMatchObject({ status: 'complete', date: '2026-05-08' })
    for (const k of ['2', '3', '4', '5', '6']) {
      expect(s[k]).toMatchObject({
        status: 'incomplete',
        date: '2026-05-11',
        daysSince: 169,
      })
    }
  })

  it('reads an undated "Payment Incomplete"', () => {
    const s = byKey(parseProspectChecklist(prospect(d84, '28681056'), AS_OF)!)
    expect(s.payment).toMatchObject({
      status: 'incomplete',
      date: null,
      daysSince: null,
    })
    expect(s['1']).toMatchObject({ date: '2026-10-05', daysSince: 22 })
  })

  it('returns null for text that is not the checklist', () => {
    expect(parseProspectChecklist('Pending review', AS_OF)).toBeNull()
    expect(parseProspectChecklist('', AS_OF)).toBeNull()
  })

  it('runs in linear time on hostile whitespace', () => {
    const hostile = `#1 a${' '.repeat(50_000)}x#2${' '.repeat(50_000)}`
    const t = performance.now()
    parseProspectChecklist(hostile, AS_OF)
    expect(performance.now() - t).toBeLessThan(500)
  })
})

describe('buildProspectiveClubPage', () => {
  const build = (
    clubId: string,
    reports: DistrictReportsDataset | null = d84,
    clubPageIds: ReadonlySet<string> = new Set()
  ) =>
    buildProspectiveClubPage({
      districtId: '84',
      clubId,
      reports,
      findAClub: fac84,
      clubPageIds,
      asOfDate: AS_OF,
    })

  it('builds the header from the report and the place from Find-a-Club', () => {
    const m = build('28679702')
    expect(m).toMatchObject({
      kind: 'found',
      clubId: '28679702',
      clubName: 'Prospective Club 84-3',
      division: 'C',
      area: '31',
      place: 'Cityville 3, ST, United States',
      reportAsOf: 'October 28, 2026',
      tiHref: 'https://www.toastmasters.org/Find-a-Club/28679702',
    })
  })

  it('has no place for a club not on Find-a-Club — never the report text', () => {
    const m = build('28679424')
    expect(m.kind).toBe('found')
    if (m.kind !== 'found') return
    expect(m.place).toBeNull()
    expect(JSON.stringify(m)).not.toMatch(/LOCATION-TEXT/)
  })

  it('never carries the report location, website or meeting times', () => {
    const json = JSON.stringify(build('28679702'))
    expect(json).not.toMatch(/LOCATION-TEXT/)
    expect(json).not.toMatch(/WEBSITE/)
    expect(json).not.toMatch(/MEETING-/)
  })

  it('says not found for a club off this date’s list', () => {
    expect(build('99999999')).toEqual({
      kind: 'not-found',
      clubId: '99999999',
      clubHref: null,
      tiHref: 'https://www.toastmasters.org/Find-a-Club/99999999',
    })
  })

  it('links a club that has chartered to its club page here', () => {
    const m = build('1234567', d84, new Set(['1234567']))
    expect(m).toMatchObject({
      kind: 'not-found',
      clubHref: '/district/84/club/1234567',
    })
  })

  it('is unknown — not "not found" — when the date has no report', () => {
    expect(build('28679702', null)).toEqual({ kind: 'unknown' })
    const noSection = { ...d84, sections: {} } as DistrictReportsDataset
    expect(build('28679702', noSection)).toEqual({ kind: 'unknown' })
  })
})

describe('prospectiveClubHref', () => {
  it('is the in-site route under Growth', () => {
    expect(prospectiveClubHref('61', '28678700')).toBe(
      '/district/61/growth/prospective/28678700'
    )
  })
})
