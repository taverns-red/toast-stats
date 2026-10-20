/**
 * `snapshots/{date}/meeting-times.json` (#1814, epic #1781) — weekday ×
 * start-hour counts per district for the region and world heatmaps.
 *
 * Inputs are recorded prod district files projected to `clubId` and the
 * parsed `meetingSchedule[]` (see `__tests__/fixtures/meeting-times/README.md`).
 * Every expected count was taken with jq over the same fixture bytes; the
 * D61 figures also match the district page's own KPIs (#1796: 158 of 161
 * scheduled, 111 in person, 67 online-capable).
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DistrictRegionHistorySchema,
  MEETING_TIMES_FORMAT,
  MeetingTimesSchema,
  type DistrictRegionHistory,
} from '@taverns-red/shared-contracts'
import {
  buildMeetingTimes,
  readMeetingTimesInput,
  type MeetingTimesDistrictInput,
} from './meetingTimes.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIX = join(HERE, '__tests__/fixtures/meeting-times')
const HISTORY = join(
  HERE,
  '__tests__/fixtures/clubs-by-region/config/district-region-history.json'
)
const DATE = '2026-10-19'
const GENERATED_AT = '2026-10-20T00:00:00.000Z'
const MON = 0
const TUE = 1
const WED = 2
const SUN = 6

const history = (): DistrictRegionHistory =>
  DistrictRegionHistorySchema.parse(JSON.parse(readFileSync(HISTORY, 'utf-8')))

const input = () => readMeetingTimesInput(join(FIX, 'snapshots', DATE))

function build(
  opts: {
    snapshotDate?: string
    regionHistory?: DistrictRegionHistory | null
    districts?: MeetingTimesDistrictInput[]
  } = {}
) {
  const { rankings, districts } = input()
  return buildMeetingTimes({
    snapshotDate: opts.snapshotDate ?? DATE,
    rankings,
    districts: opts.districts ?? districts,
    regionHistory:
      opts.regionHistory === undefined ? history() : opts.regionHistory,
    generatedAt: GENERATED_AT,
  })
}

describe('readMeetingTimesInput (#1814)', () => {
  it('reads every district file with its clubs and parsed schedules', () => {
    const { rankings, districts } = input()
    expect(rankings.map(r => r.districtId).sort()).toEqual([
      '17',
      '49',
      '61',
      'U',
    ])
    expect(
      Object.fromEntries(districts.map(d => [d.districtId, d.clubs.length]))
    ).toEqual({ '17': 63, '49': 66, '61': 161, U: 28 })
    const d61 = districts.find(d => d.districtId === '61')!
    expect(d61.clubs.find(c => c.clubId === '3045')?.meetingSchedule).toEqual([
      {
        day: 'Wednesday',
        cadence: 'monthly',
        weeksOfMonth: [1, 3],
        startTime: '19:30',
        mode: 'in-person',
      },
      {
        day: 'Wednesday',
        cadence: 'monthly',
        weeksOfMonth: [2],
        startTime: '19:30',
        mode: 'online',
      },
    ])
  })
})

describe('buildMeetingTimes — recorded prod 2026-10-19 (#1814)', () => {
  const { meetingTimes: m, missingDistricts } = build()

  it('is a valid artifact under its logical date', () => {
    expect(MeetingTimesSchema.parse(m)).toEqual(m)
    expect(m._format).toEqual(MEETING_TIMES_FORMAT)
    expect(m.snapshotDate).toBe(DATE)
    expect(m.programYear).toBe('2026-2027')
    expect(m.generatedAt).toBe(GENERATED_AT)
    expect(m.timeBasis).toBe('local')
    expect(missingDistricts).toEqual([])
  })

  it('places each district in its program year’s region', () => {
    expect(m.regionMembership).toEqual({
      source: 'config/district-region-history.json',
      asOf: '2026-10-16',
      programYear: '2026-2027',
    })
    expect(m.regionMembershipNote).toBeNull()
    expect(
      Object.fromEntries(
        Object.entries(m.districts).map(([id, d]) => [id, d.region])
      )
    ).toEqual({ '17': '12', '49': '01', '61': '05', U: null })
  })

  it('matches the district page’s KPIs for D61', () => {
    const d = m.districts['61']!
    expect(d.clubs).toBe(161)
    expect(d.scheduled).toBe(158)
    expect(d.inPerson).toBe(111)
    expect(d.onlineCapable).toBe(67)
  })

  it('counts distinct clubs per weekday × start hour, per mode', () => {
    const d = m.districts['61']!
    expect(d.modes.all.counts[WED]![19]).toBe(14)
    expect(d.modes.online.counts[WED]![19]).toBe(6)
    expect(d.modes['in-person'].counts[TUE]![19]).toBe(10)
    expect(Math.max(...d.modes.all.counts.flat())).toBe(18)
    expect(d.modes.all.counts[TUE]![12]).toBe(18)
  })

  it('keeps no-time and no-mode meetings, never a silent zero', () => {
    expect(m.districts['17']!.modes.all.noTime[WED]).toBe(4)
    expect(m.districts['U']!.modes.online.noTime[SUN]).toBe(3)
    expect(m.districts['61']!.modes.online.modeNotStated).toBe(4)
    expect(m.districts['49']!.modes.online.modeNotStated).toBe(1)
    expect(m.districts['49']!.modes.all.modeNotStated).toBe(0)
    expect(m.districts['61']!.modes.all.noTime).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('totals are the sum of the districts', () => {
    expect(m.totals).toEqual({ districts: 4, clubs: 318, scheduled: 309 })
    // Σ distinct clubs per cell over all four districts (jq: 306).
    const cells = Object.values(m.districts)
      .flatMap(d => d.modes.all.counts.flat())
      .reduce((a, b) => a + b, 0)
    expect(cells).toBe(306)
  })

  it('publishes counts only: no club id, name or schedule text', () => {
    const json = JSON.stringify(m)
    expect(json).not.toContain('clubId')
    expect(json).not.toContain('"3045"')
    expect(json).not.toContain('28680108')
    expect(json).not.toContain('startTime')
    expect(json.length).toBeLessThan(20_000)
  })
})

describe('buildMeetingTimes — scope and edge cases (#1814)', () => {
  it('scopes districts by the date’s rankings and reports a missing file', () => {
    const { districts } = input()
    const r = build({
      districts: [
        ...districts.filter(d => d.districtId !== '49'),
        { districtId: '999', clubs: [{ clubId: '1' }] },
      ],
    })
    expect(r.missingDistricts).toEqual(['49'])
    expect(Object.keys(r.meetingTimes.districts).sort()).toEqual([
      '17',
      '61',
      'U',
    ])
  })

  it('counts a club found in two district files once, in the first', () => {
    const { districts } = input()
    const d17 = districts.find(d => d.districtId === '17')!
    const stray = d17.clubs.find(c => c.meetingSchedule?.length)!
    const r = build({
      districts: districts.map(d =>
        d.districtId === '61' ? { ...d, clubs: [...d.clubs, stray] } : d
      ),
    })
    expect(r.meetingTimes.districts['61']!.clubs).toBe(161)
    expect(r.meetingTimes.districts['17']!.clubs).toBe(63)
    expect(r.meetingTimes.totals.clubs).toBe(318)
  })

  it('is byte-identical whatever order the files arrive in', () => {
    const { districts } = input()
    const a = build({ districts })
    const b = build({ districts: [...districts].reverse() })
    expect(JSON.stringify(b.meetingTimes)).toBe(JSON.stringify(a.meetingTimes))
  })

  it('no history: regions null with the reason, counts still built', () => {
    const { meetingTimes: m } = build({ regionHistory: null })
    expect(m.regionMembership).toBeNull()
    expect(m.regionMembershipNote).toMatch(/district-region-history/)
    expect(Object.values(m.districts).every(d => d.region === null)).toBe(true)
    expect(m.totals.scheduled).toBe(309)
  })

  it('takes the program year from the logical date (June close)', () => {
    const { meetingTimes: m } = build({ snapshotDate: '2026-06-30' })
    expect(m.programYear).toBe('2025-2026')
  })

  it('a club with no file schedule is counted, not dropped', () => {
    const r = build({
      districts: [
        { districtId: '17', clubs: [{ clubId: '1' }] },
        {
          districtId: '49',
          clubs: [
            {
              clubId: '2',
              meetingSchedule: [{ day: 'Monday', startTime: '07:00' }],
            },
          ],
        },
        { districtId: '61', clubs: [] },
        { districtId: 'U', clubs: [] },
      ],
    })
    expect(r.meetingTimes.districts['17']).toMatchObject({
      clubs: 1,
      scheduled: 0,
    })
    expect(r.meetingTimes.districts['49']!.modes.all.counts[MON]![7]).toBe(1)
  })
})
