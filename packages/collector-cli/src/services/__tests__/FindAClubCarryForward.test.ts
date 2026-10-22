/**
 * #2237 — a rebuild of a date with no persisted raw-fac/ carries the
 * Find-A-Club fields forward from the date's existing (enriched) snapshot,
 * so re-deriving 2026-05-15..10-10 never strips them.
 *
 * Real shape: fixtures/fac-carry-forward-d61-2026-10-09 is prod's enriched
 * district 61 for 2026-10-09, trimmed (see its README). The "rebuilt" side is
 * that file with every FAC field removed — what a re-transform writes.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FAC_PARSED_ONLY_FIELDS,
  FAC_ROW_FIELDS,
  carryForwardFac,
  isFacEnriched,
} from '../FindAClubCarryForward.js'
import { mergeFacIntoSnapshot } from '../FindAClubMerger.js'
import type { DistrictSnapshot } from '../../types/findAClub.js'

type Row = Record<string, unknown>

const ENRICHED: DistrictSnapshot = JSON.parse(
  readFileSync(
    join(
      __dirname,
      'fixtures/fac-carry-forward-d61-2026-10-09/district_61.json'
    ),
    'utf-8'
  )
)

const clone = <T>(v: T): T => structuredClone(v)
const rows = (snap: DistrictSnapshot, key: 'clubs' | 'clubPerformance') =>
  ((snap.data as Row)[key] ?? []) as Row[]

/** The fixture as a re-transform writes it: no FAC field, no prospectives. */
function stripped(snap: DistrictSnapshot): DistrictSnapshot {
  const out = clone(snap)
  const data = out.data as Row
  const drop = (r: Row) => {
    for (const k of [...FAC_ROW_FIELDS, ...FAC_PARSED_ONLY_FIELDS]) delete r[k]
  }
  rows(out, 'clubs').forEach(drop)
  rows(out, 'clubPerformance').forEach(drop)
  delete data['prospectiveClubs']
  return out
}

describe('the fixture', () => {
  it('is an enriched snapshot with padded clubPerformance ids', () => {
    expect(isFacEnriched(ENRICHED)).toBe(true)
    expect(rows(ENRICHED, 'clubPerformance')[0]!['Club Number']).toBe(
      '00003045'
    )
    expect(rows(ENRICHED, 'clubs')[0]!['clubId']).toBe('3045')
    expect(rows(ENRICHED, 'clubs')[0]!['coordinates']).toBeDefined()
  })
})

describe('isFacEnriched', () => {
  it('is false for a re-transformed (unenriched) snapshot', () => {
    expect(isFacEnriched(stripped(ENRICHED))).toBe(false)
  })

  it('is true when only prospectiveClubs marks the merge (no club matched)', () => {
    const snap = stripped(ENRICHED)
    ;(snap.data as Row)['prospectiveClubs'] = []
    expect(isFacEnriched(snap)).toBe(true)
  })

  it('is false for anything that is not a snapshot', () => {
    expect(isFacEnriched(null)).toBe(false)
    expect(isFacEnriched({ districtId: '61' })).toBe(false)
  })
})

describe('carryForwardFac', () => {
  it('restores every FAC field and prospectiveClubs onto the rebuilt snapshot', () => {
    const result = carryForwardFac(stripped(ENRICHED), ENRICHED)
    expect(result.snapshot).toEqual(ENRICHED)
    // 3045 and 9560 in both arrays; 28678196 was never matched.
    expect(result.carried).toBe(4)
    expect(isFacEnriched(result.snapshot)).toBe(true)
  })

  it('keeps the rebuilt values for every non-FAC field', () => {
    const rebuilt = stripped(ENRICHED)
    rows(rebuilt, 'clubs')[0]!['membershipCount'] = 99
    rows(rebuilt, 'clubPerformance')[0]!['Active Members'] = '99'
    const out = carryForwardFac(rebuilt, ENRICHED).snapshot
    expect(rows(out, 'clubs')[0]!['membershipCount']).toBe(99)
    expect(rows(out, 'clubs')[0]!['coordinates']).toEqual(
      rows(ENRICHED, 'clubs')[0]!['coordinates']
    )
    expect(rows(out, 'clubPerformance')[0]!['Active Members']).toBe('99')
    expect(rows(out, 'clubPerformance')[0]!['meetingDay']).toBe(
      rows(ENRICHED, 'clubPerformance')[0]!['meetingDay']
    )
  })

  it('adds no club the rebuild does not have, and gives a new club nothing', () => {
    const rebuilt = stripped(ENRICHED)
    const data = rebuilt.data as Row
    data['clubs'] = [
      ...rows(rebuilt, 'clubs').slice(1),
      { clubId: '7777777', clubName: 'New Club' },
    ]
    const out = carryForwardFac(rebuilt, ENRICHED).snapshot
    const ids = rows(out, 'clubs').map(r => r['clubId'])
    expect(ids).toEqual(['9560', '28678196', '7777777'])
    expect(rows(out, 'clubs')[2]).toEqual({
      clubId: '7777777',
      clubName: 'New Club',
    })
  })

  it('returns the rebuilt snapshot unchanged when the prior one is not enriched', () => {
    const rebuilt = stripped(ENRICHED)
    const result = carryForwardFac(rebuilt, stripped(ENRICHED))
    expect(result.snapshot).toEqual(rebuilt)
    expect(result.carried).toBe(0)
  })

  it('never carries a contact field (#2026)', () => {
    const prior = clone(ENRICHED)
    rows(prior, 'clubs')[0]!['email'] = 'club-1@example.com'
    rows(prior, 'clubPerformance')[0]!['phone'] = '+15550100001'
    const out = carryForwardFac(stripped(ENRICHED), prior).snapshot
    expect(rows(out, 'clubs')[0]).not.toHaveProperty('email')
    expect(rows(out, 'clubPerformance')[0]).not.toHaveProperty('phone')
  })

  it('carries exactly the fields the merge writes (no drift from FindAClubMerger)', () => {
    // A FAC record with every optional field the merger reads set.
    const fac = {
      Clubs: [
        {
          Identification: { Id: { Value: '00003045' }, Name: 'Limestone' },
          Address: {
            Street: '1 Main St',
            City: 'Kingston',
            PrimaryRegion: { Value: 'ON' },
            Coordinates: { Latitude: 44.23, Longitude: -76.48 },
          },
          CountryName: 'Canada',
          CharterDate: '/Date(541580400000)/',
          Website: 'https://limestonetm.com/',
          FacebookLink: 'https://facebook.com/limestone',
          TwitterLink: 'https://twitter.com/limestone',
          MeetingDay: 'Tuesday',
          MeetingTime: '7:00 pm',
          Location: 'Library',
          AllowsVirtualAttendance: true,
          IsProspective: false,
        },
      ],
    }
    const bareRow = { 'Club Number': '00003045', 'Club Name': 'Limestone' }
    const bareParsed = { clubId: '3045', clubName: 'Limestone' }
    const merged = mergeFacIntoSnapshot(
      {
        districtId: '61',
        data: { clubPerformance: [bareRow], clubs: [bareParsed] },
      },
      fac as Parameters<typeof mergeFacIntoSnapshot>[1]
    ).snapshot
    const added = (r: Row, bare: Row) =>
      Object.keys(r).filter(k => !(k in bare))
    const rowAdded = added(rows(merged, 'clubPerformance')[0]!, bareRow)
    const parsedAdded = added(rows(merged, 'clubs')[0]!, bareParsed)
    expect(rowAdded.length).toBeGreaterThan(5)
    expect(FAC_ROW_FIELDS).toEqual(expect.arrayContaining(rowAdded))
    expect([...FAC_ROW_FIELDS, ...FAC_PARSED_ONLY_FIELDS]).toEqual(
      expect.arrayContaining(parsedAdded)
    )
  })
})
