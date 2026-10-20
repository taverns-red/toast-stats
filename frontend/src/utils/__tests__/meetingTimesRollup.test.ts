import { describe, it, expect } from 'vitest'
import recorded from '../../__tests__/fixtures/meeting-times-2026-10-19.recorded.json'
import {
  aggregateMeetingTimes,
  meetingTimesChildren,
  parseMeetingTimes,
  scopeMeetingTimes,
  type MeetingTimesView,
} from '../meetingTimesRollup'

/* #1814 — the region and world meeting-time heatmaps' pure layer, over the
   pipeline's own meeting-times.json for 2026-10-19: the builder's output
   over recorded prod district files (Region 05's seven districts, plus 17,
   49 and the undistricted U). Expected figures were read with jq. */

const view = parseMeetingTimes(recorded) as MeetingTimesView
const WED = 2

describe('parseMeetingTimes', () => {
  it('reads the recorded artifact', () => {
    expect(view).not.toBeNull()
    expect(view.snapshotDate).toBe('2026-10-19')
    expect(view.programYear).toBe('2026-2027')
    expect(view.hasRegions).toBe(true)
    expect(view.districts.map(d => d.id)).toEqual([
      '17',
      '31',
      '49',
      '53',
      '60',
      '61',
      '86',
      '123',
      '216',
      'U',
    ])
    expect(view.unreadable).toEqual([])
  })

  it('an absent or off-contract body is null ("not available"), never zeros', () => {
    expect(parseMeetingTimes(null)).toBeNull()
    expect(parseMeetingTimes({})).toBeNull()
    expect(parseMeetingTimes({ ...recorded, districts: [] })).toBeNull()
    expect(
      parseMeetingTimes({ ...recorded, _format: { type: 'region-rollups' } })
    ).toBeNull()
  })

  it('a key it does not know is ignored (#2183)', () => {
    const later = structuredClone(recorded) as Record<string, unknown>
    later['bands'] = { evening: 1 }
    ;(later['districts'] as Record<string, Record<string, unknown>>)['61']![
      'extra'
    ] = true
    expect(parseMeetingTimes(later)?.districts).toHaveLength(10)
  })

  it('one malformed district is left out and named, not the whole page', () => {
    const bad = structuredClone(recorded)
    bad.districts['53'].modes.online.counts.pop()
    const v = parseMeetingTimes(bad)!
    expect(v.districts.map(d => d.id)).not.toContain('53')
    expect(v.districts).toHaveLength(9)
    expect(v.unreadable).toEqual(['53'])
  })
})

describe('scopeMeetingTimes', () => {
  it('a region is its program year’s districts', () => {
    const s = scopeMeetingTimes(view, { kind: 'region', regionId: '05' })
    expect(s.districts.map(d => d.id)).toEqual([
      '31',
      '53',
      '60',
      '61',
      '86',
      '123',
      '216',
    ])
    expect(s.filter).toBeNull()
  })

  it('a region narrows to one of its districts; a stranger is ignored', () => {
    expect(
      scopeMeetingTimes(view, {
        kind: 'region',
        regionId: '05',
        district: '61',
      }).districts.map(d => d.id)
    ).toEqual(['61'])
    const stray = scopeMeetingTimes(view, {
      kind: 'region',
      regionId: '05',
      district: '17',
    })
    expect(stray.filter).toBeNull()
    expect(stray.districts).toHaveLength(7)
  })

  it('the world is every district, narrowed to a region', () => {
    expect(scopeMeetingTimes(view, { kind: 'world' }).districts).toHaveLength(
      10
    )
    expect(
      scopeMeetingTimes(view, { kind: 'world', region: '12' }).districts.map(
        d => d.id
      )
    ).toEqual(['17'])
  })
})

describe('aggregateMeetingTimes', () => {
  it('sums the districts, matching each district page', () => {
    const d61 = scopeMeetingTimes(view, {
      kind: 'region',
      regionId: '05',
      district: '61',
    })
    const a61 = aggregateMeetingTimes(d61.districts, 'all')
    // The district page's own KPIs for D61 (#1796).
    expect(a61.clubs).toBe(161)
    expect(a61.scheduled).toBe(158)
    expect(a61.inPerson).toBe(111)
    expect(a61.onlineCapable).toBe(67)
    expect(a61.counts[WED]![19]).toBe(14)
  })

  it('a region total is Σ its districts, cell by cell', () => {
    const r = scopeMeetingTimes(view, { kind: 'region', regionId: '05' })
    const all = aggregateMeetingTimes(r.districts, 'all')
    expect(all.clubs).toBe(198 + 154 + 105 + 161 + 101 + 111 + 142)
    expect(all.scheduled).toBe(193 + 145 + 102 + 158 + 94 + 107 + 137)
    for (let d = 0; d < 7; d++)
      for (let h = 0; h < 24; h++)
        expect(all.counts[d]![h]).toBe(
          r.districts.reduce((n, x) => n + x.modes.all.counts[d]![h]!, 0)
        )
    expect(all.max).toBe(Math.max(...all.counts.flat()))
  })

  it('names the evenings no club starts in, per mode', () => {
    const r = scopeMeetingTimes(view, {
      kind: 'region',
      regionId: '12',
    })
    const online = aggregateMeetingTimes(r.districts, 'online')
    for (const day of online.eveningGaps) {
      const d = [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ].indexOf(day)
      expect(online.counts[d]!.slice(17, 22).every(n => n === 0)).toBe(true)
    }
  })

  it('no districts is an empty scope, not a grid of zeros to show', () => {
    const a = aggregateMeetingTimes([], 'all')
    expect(a.clubs).toBe(0)
    expect(a.max).toBe(0)
  })
})

describe('meetingTimesChildren', () => {
  it('a region’s children are its districts, linking to their meetings pages', () => {
    const r = scopeMeetingTimes(view, { kind: 'region', regionId: '05' })
    const rows = meetingTimesChildren(r, 'all', { day: 'Wednesday', hour: 19 })
    expect(rows.map(c => c.label)).toContain('District 61')
    const d61 = rows.find(c => c.id === '61')!
    expect(d61.to).toBe('/district/61/meetings')
    expect(d61.inSlot).toBe(14)
    // Busiest first in a slot.
    const counts = rows.map(c => c.inSlot ?? 0)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
  })

  it('the world’s children are regions; the undistricted bucket has no link', () => {
    const w = scopeMeetingTimes(view, { kind: 'world' })
    const rows = meetingTimesChildren(w, 'all', null)
    expect(rows.map(c => c.id)).toEqual(['01', '05', '12', 'unassigned'])
    expect(rows.find(c => c.id === '05')).toMatchObject({
      label: 'Region 05',
      to: '/region/05/meetings',
      clubs: 198 + 154 + 105 + 161 + 101 + 111 + 142,
    })
    expect(rows.find(c => c.id === 'unassigned')).toMatchObject({
      label: 'Not in a region',
      to: null,
      clubs: 28,
    })
    expect(rows[0]!.inSlot).toBeNull()
  })
})
