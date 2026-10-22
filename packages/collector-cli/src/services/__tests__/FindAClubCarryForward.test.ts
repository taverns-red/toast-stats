/**
 * #2237 — a rebuild of a date with no persisted raw-fac/ carries the
 * Find-A-Club fields forward from the date's existing (enriched) snapshot,
 * so re-deriving 2026-05-15..10-10 never strips them.
 *
 * Real shape: fixtures/fac-carry-forward-d61-2026-10-09 is prod's enriched
 * district 61 for 2026-10-09, trimmed (see its README). The "rebuilt" side is
 * that file with every FAC field removed — what a re-transform writes.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { containsPlaceSecret } from '@taverns-red/shared-contracts'
import {
  FAC_PARSED_ONLY_FIELDS,
  FAC_ROW_FIELDS,
  carryForwardFac,
  carryForwardFacDir,
  isFacEnriched,
  isFacMerged,
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

/*
 * Review of PR #2238. Planted secrets are synthetic (555 numbers, made-up
 * passcodes and links), in the positions #2069/#2157/#2167 found real ones.
 */
describe('carryForwardFac — carried text is scrubbed like fresh FAC (#2157, #2167)', () => {
  const planted = (): DistrictSnapshot => {
    const prior = clone(ENRICHED)
    const club = rows(prior, 'clubs')[0]!
    club['address'] = {
      ...(club['address'] as Row),
      street: '790 Edgar Street, call 613-555-0142',
      city: 'Kingston Passcode: 482913',
    }
    club['meetingTime'] = '7:30 pm https://us02web.zoom.us/j/00000000000'
    club['location'] = 'Library\nMeeting ID: 000 0000 0000'
    const perf = rows(prior, 'clubPerformance')[0]!
    perf['meetingDay'] = 'Wednesday, text 613-555-0199'
    const prospective = (prior.data as Row)['prospectiveClubs'] as Row[]
    prospective[0]!['city'] = 'Hawkesbury pwd: 123456'
    return prior
  }

  it('leaves no phone, credential or link in any carried text field', () => {
    const out = carryForwardFac(stripped(ENRICHED), planted()).snapshot
    const club = rows(out, 'clubs')[0]!
    const address = club['address'] as Row
    const texts = [
      address['street'],
      address['city'],
      club['meetingTime'],
      club['location'],
      rows(out, 'clubPerformance')[0]!['meetingDay'],
      ((out.data as Row)['prospectiveClubs'] as Row[])[0]!['city'],
    ]
    for (const text of texts) {
      expect(typeof text).toBe('string')
      expect(containsPlaceSecret(text as string), String(text)).toBe(false)
      expect(text as string).not.toMatch(/555-01|482913|123456/)
    }
    // The public part stays.
    expect(address['street']).toContain('790 Edgar Street')
    expect(address['city']).toContain('Kingston')
    expect(club['location']).toContain('Library')
  })

  it('leaves already-clean text byte-identical', () => {
    const out = carryForwardFac(stripped(ENRICHED), ENRICHED).snapshot
    expect(out).toEqual(ENRICHED)
  })
})

describe('carryForwardFac — prospectiveClubs against the rebuilt club set', () => {
  it('drops a prospective club the rebuild now has as a chartered club', () => {
    const rebuilt = stripped(ENRICHED)
    // 28678700 chartered: the rebuilt CSV lists it (padded in clubPerformance).
    rows(rebuilt, 'clubs').push({ clubId: '28678700', clubName: 'Parole' })
    rows(rebuilt, 'clubPerformance').push({
      'Club Number': '028678700',
      'Club Name': 'Parole',
    })
    const out = carryForwardFac(rebuilt, ENRICHED)
    const ids = ((out.snapshot.data as Row)['prospectiveClubs'] as Row[]).map(
      p => p['clubId']
    )
    expect(ids).toEqual(['28679454'])
    expect(out.prospectiveDropped).toBe(1)
  })
})

describe('carryForwardFac — what counts as carried (review finding 3)', () => {
  it('a rebuilt row with a transform charterDate is not "already enriched"', () => {
    // A CSV with a Charter Date column makes the transform write
    // clubs[].charterDate (DataTransformer); only prospectiveClubs marks a merge.
    const rebuilt = stripped(ENRICHED)
    rows(rebuilt, 'clubs')[0]!['charterDate'] = '1960-01-01'
    expect(isFacMerged(rebuilt)).toBe(false)
    const out = carryForwardFac(rebuilt, ENRICHED)
    expect(out.carried).toBe(4)
    expect(isFacMerged(out.snapshot)).toBe(true)
  })

  it('reports the prior FAC rows, so 0 carried of N is visible', () => {
    const rebuilt = stripped(ENRICHED)
    for (const r of rows(rebuilt, 'clubs')) r['clubId'] = `9${r['clubId']}`
    for (const r of rows(rebuilt, 'clubPerformance'))
      r['Club Number'] = `9${r['Club Number']}`
    const out = carryForwardFac(rebuilt, ENRICHED)
    expect(out.carried).toBe(0)
    expect(out.priorRows).toBe(4)
  })
})

describe('carryForwardFacDir (the CLI command)', () => {
  let dir: string
  const write = (sub: string, snap: unknown) => {
    mkdirSync(join(dir, sub), { recursive: true })
    writeFileSync(join(dir, sub, 'district_61.json'), JSON.stringify(snap))
  }
  const run = () =>
    carryForwardFacDir({
      fromDir: join(dir, 'prior'),
      snapshotDir: join(dir, 'snap'),
    })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'carry-forward-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('carries and counts the district and its rows', async () => {
    write('prior', ENRICHED)
    write('snap', stripped(ENRICHED))
    const s = await run()
    expect(s).toMatchObject({
      totalDistricts: 1,
      priorEnriched: 1,
      carried: 1,
      rowsCarried: 4,
      alreadyEnriched: 0,
      failed: 0,
    })
  })

  it('fails the district when an enriched staging copy carries 0 rows', async () => {
    const rebuilt = stripped(ENRICHED)
    for (const r of rows(rebuilt, 'clubs')) r['clubId'] = `9${r['clubId']}`
    for (const r of rows(rebuilt, 'clubPerformance'))
      r['Club Number'] = `9${r['Club Number']}`
    write('prior', ENRICHED)
    write('snap', rebuilt)
    const s = await run()
    expect(s.failed).toBe(1)
    expect(s.carried).toBe(0)
    // Nothing was rewritten.
    expect(
      JSON.parse(readFileSync(join(dir, 'snap', 'district_61.json'), 'utf-8'))
    ).toEqual(rebuilt)
  })

  it('does not count an already-merged rebuild as carried', async () => {
    write('prior', ENRICHED)
    write('snap', ENRICHED)
    const s = await run()
    expect(s).toMatchObject({ carried: 0, alreadyEnriched: 1, failed: 0 })
  })

  it('a missing prior copy is skipped; an unreadable one fails', async () => {
    write('snap', stripped(ENRICHED))
    expect((await run()).totalDistricts).toBe(0)
    mkdirSync(join(dir, 'prior', 'district_61.json'), { recursive: true })
    expect((await run()).failed).toBe(1)
  })
})
