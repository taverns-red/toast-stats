import { describe, it, expect } from 'vitest'
import {
  DATE_PAIR_PRESETS,
  resolveDatePairPreset,
  type DatePairPresetId,
} from '../datePairPresets'

/* #1462 (epic #1458 Sprint 4) — time-window preset chips for the What's Changed
   date-pair picker.

   The honest model: snapshots exist on RECORDED dates only, never on every
   calendar day. A preset therefore resolves to a date the district actually
   recorded — the latest recorded date at or before (latest − window) — not to a
   calendar offset that may name no snapshot at all. A window with no recorded
   date to anchor it resolves to null, so the chip renders disabled rather than
   silently producing an empty or reversed diff. */

const ALL_IDS: DatePairPresetId[] = [
  'last-snapshot',
  'week',
  'month',
  'program-year',
]

describe('DATE_PAIR_PRESETS', () => {
  it('offers the four windows the page renders, in display order', () => {
    expect(DATE_PAIR_PRESETS.map(p => p.id)).toEqual(ALL_IDS)
    expect(DATE_PAIR_PRESETS.map(p => p.label)).toEqual([
      'Last snapshot',
      '~1 week',
      '~1 month',
      'Program year',
    ])
  })

  it('gives every preset a description that names the honest model', () => {
    for (const preset of DATE_PAIR_PRESETS) {
      expect(preset.description.length).toBeGreaterThan(0)
    }
  })
})

describe('resolveDatePairPreset — to is always the latest recorded date', () => {
  const DATES = ['2026-05-20', '2026-05-22', '2026-05-25', '2026-05-26']

  it('anchors every preset to the latest recorded date', () => {
    for (const id of ALL_IDS) {
      const pair = resolveDatePairPreset(id, DATES)
      if (pair) expect(pair.to).toBe('2026-05-26')
    }
  })

  it('resolves "last snapshot" to the date immediately before the latest', () => {
    expect(resolveDatePairPreset('last-snapshot', DATES)).toEqual({
      from: '2026-05-25',
      to: '2026-05-26',
    })
  })

  it('reads an unsorted date list the same as a sorted one', () => {
    const shuffled = ['2026-05-25', '2026-05-20', '2026-05-26', '2026-05-22']
    expect(resolveDatePairPreset('last-snapshot', shuffled)).toEqual({
      from: '2026-05-25',
      to: '2026-05-26',
    })
  })

  it('returns elements OF the dates array, so a branded date round-trips', () => {
    const pair = resolveDatePairPreset('week', [
      '2026-05-01',
      '2026-05-19',
      '2026-05-26',
    ])
    expect(DATES.includes('2026-05-26')).toBe(true)
    expect(pair).toEqual({ from: '2026-05-19', to: '2026-05-26' })
  })

  it('returns null when fewer than two dates exist', () => {
    for (const id of ALL_IDS) {
      expect(resolveDatePairPreset(id, ['2026-05-26'])).toBeNull()
      expect(resolveDatePairPreset(id, [])).toBeNull()
    }
  })
})

describe('resolveDatePairPreset — nearest RECORDED date, not a calendar offset', () => {
  it('lands on the exact date when a snapshot was recorded a week earlier', () => {
    const dates = ['2026-05-12', '2026-05-19', '2026-05-22', '2026-05-26']
    expect(resolveDatePairPreset('week', dates)).toEqual({
      from: '2026-05-19', // 2026-05-26 − 7d, recorded
      to: '2026-05-26',
    })
  })

  it('falls back to the latest recorded date BEFORE the target when the target day has no snapshot', () => {
    // Target is 2026-05-19; nothing was recorded that day. The window must
    // widen to the nearest recorded date at or before it (05-18), never narrow
    // to 05-22 — a "~1 week" chip that compares four days is a lie.
    const dates = ['2026-05-15', '2026-05-18', '2026-05-22', '2026-05-26']
    expect(resolveDatePairPreset('week', dates)).toEqual({
      from: '2026-05-18',
      to: '2026-05-26',
    })
  })

  it('resolves sensibly over a sparse, monthly-only history', () => {
    const dates = [
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
    ]
    // Week target 2026-07-24 → the only recorded date at or before it is 06-30.
    expect(resolveDatePairPreset('week', dates)).toEqual({
      from: '2026-06-30',
      to: '2026-07-31',
    })
    // Month target 2026-06-30 → recorded exactly.
    expect(resolveDatePairPreset('month', dates)).toEqual({
      from: '2026-06-30',
      to: '2026-07-31',
    })
  })

  it('clamps the month shift to a real calendar day (Mar 31 − 1 month = Feb 28)', () => {
    const dates = ['2026-02-27', '2026-02-28', '2026-03-15', '2026-03-31']
    expect(resolveDatePairPreset('month', dates)).toEqual({
      from: '2026-02-28',
      to: '2026-03-31',
    })
  })

  it('crosses a year boundary for the month window', () => {
    const dates = ['2025-12-05', '2025-12-20', '2026-01-05', '2026-01-20']
    // 2026-01-20 − 1 month = 2025-12-20, recorded exactly.
    expect(resolveDatePairPreset('month', dates)).toEqual({
      from: '2025-12-20',
      to: '2026-01-20',
    })
  })
})

describe('resolveDatePairPreset — program year uses the July 1 boundary of `to`', () => {
  it('resolves from to the earliest recorded date on or after July 1', () => {
    const dates = [
      '2026-06-15',
      '2026-06-30',
      '2026-07-05',
      '2026-08-01',
      '2026-08-30',
    ]
    expect(resolveDatePairPreset('program-year', dates)).toEqual({
      from: '2026-07-05', // first recorded date of PY 2026-27
      to: '2026-08-30',
    })
  })

  it('treats a `to` in July as belonging to the NEW program year', () => {
    const dates = ['2026-05-31', '2026-06-30', '2026-07-02', '2026-07-31']
    expect(resolveDatePairPreset('program-year', dates)).toEqual({
      from: '2026-07-02',
      to: '2026-07-31',
    })
  })

  it('treats a `to` in June as belonging to the program year that began the PREVIOUS July', () => {
    const dates = ['2025-06-30', '2025-07-15', '2026-01-31', '2026-06-30']
    expect(resolveDatePairPreset('program-year', dates)).toEqual({
      from: '2025-07-15',
      to: '2026-06-30',
    })
  })

  it('includes a snapshot recorded exactly on July 1', () => {
    const dates = ['2026-06-30', '2026-07-01', '2026-08-30']
    expect(resolveDatePairPreset('program-year', dates)).toEqual({
      from: '2026-07-01',
      to: '2026-08-30',
    })
  })

  it('returns null when the latest date is the only one in its program year', () => {
    // Nothing to compare against inside the program year — from would equal to.
    const dates = ['2026-05-31', '2026-06-30', '2026-07-05']
    expect(resolveDatePairPreset('program-year', dates)).toBeNull()
  })
})

describe('resolveDatePairPreset — insufficient history disables, never lies', () => {
  it('returns null when no recorded date reaches back a full week', () => {
    const dates = ['2026-05-24', '2026-05-25', '2026-05-26']
    expect(resolveDatePairPreset('week', dates)).toBeNull()
    expect(resolveDatePairPreset('month', dates)).toBeNull()
  })

  it('returns null rather than collapsing the window onto the latest date', () => {
    const dates = ['2026-05-25', '2026-05-26']
    expect(resolveDatePairPreset('week', dates)).toBeNull()
  })

  it('never produces from === to or a reversed pair, for any preset or history', () => {
    const histories = [
      ['2026-05-25', '2026-05-26'],
      ['2026-05-24', '2026-05-25', '2026-05-26'],
      ['2025-07-01', '2026-06-29', '2026-06-30'],
      ['2026-07-01', '2026-07-02'],
      ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'],
      ['2026-06-30', '2026-07-31', '2026-08-31'],
    ]
    for (const dates of histories) {
      for (const id of ALL_IDS) {
        const pair = resolveDatePairPreset(id, dates)
        if (pair === null) continue
        expect(pair.from < pair.to).toBe(true)
        expect(dates).toContain(pair.from)
        expect(dates).toContain(pair.to)
      }
    }
  })
})
