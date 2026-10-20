import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  MEETING_TIMES_FILE_NAME,
  MEETING_TIMES_FORMAT,
  MEETING_TIMES_MODES,
  MeetingTimesSchema,
  countMeetingSlots,
  type MeetingScheduleEntry,
  type MeetingSlotClub,
} from '../index.js'

/**
 * #1814 (epic #1781) — the meeting-time counting rule shared by the district
 * heatmap (#1796) and `snapshots/{date}/meeting-times.json`, and the
 * artifact's contract. Real-data counts are tested where the pipeline
 * builds the file (analytics-core, recorded prod district files).
 */

const club = (
  clubId: string,
  meetingSchedule?: MeetingScheduleEntry[] | null
): MeetingSlotClub => ({
  clubId,
  ...(meetingSchedule !== undefined ? { meetingSchedule } : {}),
})

const WED = 2

describe('countMeetingSlots (#1814)', () => {
  it('is 7 weekdays × 24 hours, Monday first', () => {
    const c = countMeetingSlots(
      [club('1', [{ day: 'Monday', startTime: '07:15' }])],
      'all'
    )
    expect(c.counts).toHaveLength(7)
    for (const row of c.counts) expect(row).toHaveLength(24)
    expect(c.counts[0]![7]).toBe(1)
    expect(c.noTime).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('counts a club once per cell however many meetings it has there', () => {
    // Real shape (D61 club 3045): 1st & 3rd in person, 2nd online, 19:30.
    const c = countMeetingSlots(
      [
        club('3045', [
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
        ]),
      ],
      'all'
    )
    expect(c.counts[WED]![19]).toBe(1)
    expect(c.inPerson).toBe(1)
    expect(c.onlineCapable).toBe(1)
  })

  it('in-person = in-person or hybrid; online = online or hybrid', () => {
    const clubs = [
      club('1', [{ day: 'Wednesday', startTime: '19:00', mode: 'hybrid' }]),
      club('2', [{ day: 'Wednesday', startTime: '19:00', mode: 'online' }]),
      club('3', [{ day: 'Wednesday', startTime: '19:00', mode: 'in-person' }]),
      club('4', [{ day: 'Wednesday', startTime: '19:00' }]),
    ]
    expect(countMeetingSlots(clubs, 'all').counts[WED]![19]).toBe(4)
    expect(countMeetingSlots(clubs, 'in-person').counts[WED]![19]).toBe(2)
    expect(countMeetingSlots(clubs, 'online').counts[WED]![19]).toBe(2)
  })

  it('drops nothing: no schedule, no time and no mode are each counted', () => {
    const clubs = [
      club('1'),
      club('2', null),
      club('3', []),
      club('4', [{ day: 'Tuesday', cadence: 'weekly' }]),
      club('5', [{ day: 'Friday', startTime: '12:00' }]),
    ]
    const all = countMeetingSlots(clubs, 'all')
    expect(all.clubs).toBe(5)
    expect(all.scheduled).toBe(2)
    expect(all.noTime[1]).toBe(1)
    expect(all.counts[4]![12]).toBe(1)
    expect(all.modeNotStated).toBe(0)
    const online = countMeetingSlots(clubs, 'online')
    // Neither scheduled club says how it meets.
    expect(online.modeNotStated).toBe(2)
    expect(online.counts.flat().every(n => n === 0)).toBe(true)
  })

  it('reads only a well-formed HH:MM start', () => {
    const c = countMeetingSlots(
      [club('1', [{ day: 'Sunday', startTime: '7:30' }])],
      'all'
    )
    expect(c.counts.flat().every(n => n === 0)).toBe(true)
    expect(c.noTime[6]).toBe(1)
  })
})

describe('MeetingTimesSchema (#1814)', () => {
  const grid = () => ({
    counts: Array.from({ length: 7 }, () => Array<number>(24).fill(0)),
    noTime: Array<number>(7).fill(0),
    modeNotStated: 0,
  })
  const valid = {
    _format: MEETING_TIMES_FORMAT,
    snapshotDate: '2026-10-19',
    programYear: '2026-2027',
    generatedAt: '2026-10-20T00:00:00.000Z',
    timeBasis: 'local',
    regionMembership: null,
    regionMembershipNote: 'no history',
    totals: { districts: 1, clubs: 0, scheduled: 0 },
    districts: {
      '61': {
        region: null,
        clubs: 0,
        scheduled: 0,
        inPerson: 0,
        onlineCapable: 0,
        modes: { all: grid(), 'in-person': grid(), online: grid() },
      },
    },
  }

  it('names the file and the modes', () => {
    expect(MEETING_TIMES_FILE_NAME).toBe('meeting-times.json')
    expect(MEETING_TIMES_MODES).toEqual(['all', 'in-person', 'online'])
  })

  it('parses the recorded artifact unchanged', () => {
    // The builder's output over recorded prod district files (2026-10-19).
    const recorded = JSON.parse(
      readFileSync(
        new URL('./__fixtures__/recorded-meeting-times.json', import.meta.url),
        'utf-8'
      )
    ) as unknown
    expect(MeetingTimesSchema.parse(recorded)).toEqual(recorded)
  })

  it('parses a valid artifact', () => {
    expect(MeetingTimesSchema.safeParse(valid).success).toBe(true)
  })

  it('tolerates a key it does not know (#2183)', () => {
    const later = {
      ...valid,
      bands: {},
      districts: {
        '61': { ...valid.districts['61'], extra: 1 },
      },
    }
    expect(MeetingTimesSchema.safeParse(later).success).toBe(true)
  })

  it('rejects a grid that is not 7 × 24', () => {
    const bad = structuredClone(valid)
    bad.districts['61']!.modes.all.counts[0] = [0]
    expect(MeetingTimesSchema.safeParse(bad).success).toBe(false)
  })
})
