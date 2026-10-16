/**
 * Meeting pin modes (#1787, spec §4.2): meeting day and how members attend,
 * read from the parsed FAC `meetingSchedule[]` (#1789) and the
 * `allowsVirtualAttendance` flag — never the free-text day, time or
 * location, never a link.
 *
 * Fixture: one prod analytics object (D61, 2026-10-15) reduced to the
 * parsed fields, recorded for #1796. On that object every club whose FAC
 * location names an online word also carries an online or hybrid schedule
 * entry (56 of 56), so the schedule alone is the online signal.
 */
import { describe, expect, it } from 'vitest'
import fixture from '../../../__tests__/fixtures/meeting-schedule-d61-2026-10-15.json'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'
import { applyExtendedFacets, extendedModel } from '../pinExtended'
import { legendChips } from '../pinModes'
import { attendanceOf, meetingModel } from '../pinMeeting'

const DATE = '2026-10-15'

const base = {
  membershipTrend: [],
  dcpGoalsTrend: [],
  currentStatus: 'thriving',
  riskFactors: [],
  distinguishedLevel: 'NotDistinguished',
}
const D61 = fixture.clubs.map(c => ({ ...base, ...c })) as ClubTrend[]

const club = (o: Partial<ClubTrend>): ClubTrend =>
  ({ ...base, clubId: '1', clubName: 'Club', ...o }) as ClubTrend

const sum = (chips: { count: number }[]) =>
  chips.reduce((n, c) => n + c.count, 0)
const counts = (chips: { key: string; count: number }[]) =>
  Object.fromEntries(chips.map(c => [c.key, c.count]))

describe('how members attend', () => {
  it('"online only" is a schedule whose every meeting is online', () => {
    const online = { day: 'Tuesday', mode: 'online' } as const
    expect(attendanceOf(club({ meetingSchedule: [online] }))).toBe('onlineOnly')
    // Even when the coarse flag says no: the club's own words win.
    expect(
      attendanceOf(
        club({ allowsVirtualAttendance: false, meetingSchedule: [online] })
      )
    ).toBe('onlineOnly')
    // One in-person or hybrid meeting, or one with no mode, is not "only".
    for (const other of [
      { day: 'Tuesday', mode: 'in-person' },
      { day: 'Tuesday', mode: 'hybrid' },
      { day: 'Tuesday' },
    ] as const)
      expect(
        attendanceOf(
          club({
            allowsVirtualAttendance: true,
            meetingSchedule: [online, other],
          })
        )
      ).toBe('online')
  })

  it('online possible from the flag or any online / hybrid meeting', () => {
    expect(attendanceOf(club({ allowsVirtualAttendance: true }))).toBe('online')
    expect(
      attendanceOf(
        club({
          allowsVirtualAttendance: false,
          meetingSchedule: [
            { day: 'Wednesday', mode: 'in-person' },
            { day: 'Wednesday', mode: 'online' },
          ],
        })
      )
    ).toBe('online')
  })

  it('in person only needs a stated "no" or an in-person meeting; silence is "not stated"', () => {
    expect(attendanceOf(club({ allowsVirtualAttendance: false }))).toBe(
      'inPerson'
    )
    expect(
      attendanceOf(
        club({ meetingSchedule: [{ day: 'Monday', mode: 'in-person' }] })
      )
    ).toBe('inPerson')
    expect(attendanceOf(club({}))).toBe('notStated')
    expect(attendanceOf(club({ meetingSchedule: [{ day: 'Monday' }] }))).toBe(
      'notStated'
    )
  })

  it('D61: the legend adds up to every club, "not stated" shown', () => {
    const model = extendedModel('attendance', DATE, null, D61)
    const chips = legendChips(model, D61)
    expect(sum(chips)).toBe(161)
    expect(counts(chips)).toEqual({
      online: 71,
      inPerson: 45,
      onlineOnly: 43,
      notStated: 2,
    })
    expect(chips.map(c => c.label)).toEqual([
      'In person only',
      'Online attendance possible',
      'Online only',
      'Not stated',
    ])
    // A distinct shape per category (WCAG 1.4.1): ● ◐ ○ and a small dot.
    expect(chips.map(c => c.shape)).toEqual([
      'circle',
      'fill50',
      'fill0',
      'dot',
    ])
    expect(model.note).toBeUndefined()
  })

  it('before #1789 (no schedules) online-only cannot be told apart, and says so', () => {
    const old = D61.map(c => ({ ...c, meetingSchedule: undefined }))
    const model = extendedModel('attendance', '2026-09-01', null, old)
    expect(counts(legendChips(model, old))).not.toHaveProperty('onlineOnly')
    expect(model.note).toMatch(/online-only clubs are counted under/i)
  })

  it('a date with no attendance data at all is "not available", not "not stated"', () => {
    const stripped = D61.map(c => ({
      ...c,
      allowsVirtualAttendance: undefined,
      meetingSchedule: undefined,
    }))
    const model = extendedModel('attendance', '2026-05-31', null, stripped)
    const chips = legendChips(model, stripped)
    expect(counts(chips)).toEqual({ na: 161 })
    expect(model.note).toBe(
      'How members attend is not available for 2026-05-31.'
    )
  })
})

describe('meeting day', () => {
  it('D61: one chip per weekday in weekday order, then several days, then not stated', () => {
    const model = extendedModel('day', DATE, null, D61)
    const chips = legendChips(model, D61)
    expect(sum(chips)).toBe(161)
    expect(chips.map(c => [c.label, c.count])).toEqual([
      ['Monday', 21],
      ['Tuesday', 46],
      ['Wednesday', 37],
      ['Thursday', 35],
      ['Friday', 9],
      ['Saturday', 7],
      ['Several days', 3],
      ['Not stated', 3],
    ])
    // The code label is the non-colour channel (spec §3.2).
    expect(chips.map(c => c.code)).toEqual([
      'Mo',
      'Tu',
      'We',
      'Th',
      'Fr',
      'Sa',
      '2+',
      undefined,
    ])
    expect(chips.at(-1)!.shape).toBe('dot')
    expect(model.facet?.param).toBe('day')
  })

  it('a club meeting on two weekdays is "several days"; two meetings on one day are that day', () => {
    const m = meetingModel('day', '')
    expect(
      m.categoryOf(
        club({
          meetingSchedule: [
            { day: 'Wednesday', mode: 'in-person' },
            { day: 'Wednesday', mode: 'online' },
          ],
        })
      ).key
    ).toBe('wed')
    expect(
      m.categoryOf(
        club({ meetingSchedule: [{ day: 'Tuesday' }, { day: 'Thursday' }] })
      ).key
    ).toBe('several')
  })

  it('before #1789 the whole date is "not available", never "not stated"', () => {
    const old = D61.map(c => ({ ...c, meetingSchedule: undefined }))
    const model = extendedModel('day', '2026-09-01', null, old)
    expect(counts(legendChips(model, old))).toEqual({ na: 161 })
    expect(model.note).toBe('Meeting day is not available for 2026-09-01.')
  })

  it('suspended overrides the day, and the chips still add up', () => {
    const clubs = [
      club({ clubId: 'a', meetingSchedule: [{ day: 'Monday' }] }),
      club({
        clubId: 'b',
        clubStatus: 'Suspended',
        meetingSchedule: [{ day: 'Monday' }],
      }),
    ]
    const chips = legendChips(meetingModel('day', '', clubs), clubs)
    expect(counts(chips)).toEqual({ mon: 1, suspended: 1 })
  })

  it('?day= filters by the legend key, OR within', () => {
    const ids = (q: string) =>
      applyExtendedFacets(D61, new URLSearchParams(q), DATE).map(c => c.clubId)
    expect(ids('day=sat')).toHaveLength(7)
    expect(ids('day=sat,notStated')).toHaveLength(10)
    expect(ids('attendance=onlineOnly')).toHaveLength(43)
  })
})
