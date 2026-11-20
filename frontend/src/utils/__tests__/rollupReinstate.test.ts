/**
 * #3094 — the region and world "Can reinstate" card, summed in the browser
 * over the one dated `reinstatable-clubs.json` that covers every district.
 */
import { describe, it, expect } from 'vitest'
import type {
  ReinstatableClub,
  ReinstatableClubs,
} from '@taverns-red/shared-contracts'
import { buildRollupReinstate } from '../rollupReinstate'

const DATE = '2026-11-18'

let seq = 0
function club(over: Partial<ReinstatableClub> = {}): ReinstatableClub {
  seq += 1
  return {
    clubNumber: String(1000 + seq),
    clubName: `Club ${seq}`,
    division: 'A',
    area: '01',
    status: 'suspended',
    suspendDate: '2026-09-30',
    oldestPeriod: false,
    addsToBase: true,
    reason: 'suspended_sept30_october_cycle',
    ...over,
  } as ReinstatableClub
}

const closed = (over: Partial<ReinstatableClub> = {}) =>
  club({
    status: 'closed',
    suspendDate: undefined,
    lastSeen: '2025-06-30',
    addsToBase: false,
    reason: 'closed_does_not_add',
    ...over,
  })

function file(
  districts: Record<string, ReinstatableClub[]>,
  over: Partial<ReinstatableClubs> = {}
): ReinstatableClubs {
  return {
    _format: { version: '1.0.0', type: 'reinstatable-clubs' },
    snapshotDate: DATE,
    baseProgramYear: '2026-2027',
    districts,
    ...over,
  } as ReinstatableClubs
}

const build = (
  f: ReinstatableClubs | null,
  districtIds: readonly string[] | 'all',
  extra: { date?: string; search?: string } = {}
) =>
  buildRollupReinstate({
    file: f,
    date: extra.date ?? DATE,
    districtIds,
    search: extra.search,
  })

describe('buildRollupReinstate', () => {
  it('is null when the date has no file', () => {
    expect(build(null, 'all')).toBeNull()
  })

  it('is null when the file is another date’s', () => {
    expect(build(file({ '61': [club()] }), 'all', { date: '2026-11-19' })).toBe(
      null
    )
  })

  it('sums every district in scope and splits each row', () => {
    const r = build(
      file({
        '61': [club(), club(), closed(), closed({ oldestPeriod: true })],
        '86': [
          club({ addsToBase: false, reason: 'suspended_mar31_after_oct1' }),
        ],
        '99': [club()],
      }),
      ['61', '86']
    )!
    expect(r.count).toBe(5)
    expect(r.adds).toBe(2)
    expect(r.card).toBe('2 add to the club base')
    expect(r.rows).toEqual([
      {
        id: '61',
        label: 'District 61',
        to: '/district/61/growth#growth-reinstate',
        suspended: 2,
        closed: 2,
        adds: 2,
        oldest: 1,
        unknown: 0,
        total: 4,
      },
      {
        id: '86',
        label: 'District 86',
        to: '/district/86/growth#growth-reinstate',
        suspended: 1,
        closed: 0,
        adds: 0,
        oldest: 0,
        unknown: 0,
        total: 1,
      },
    ])
  })

  it('skips a district absent from the file: not measured, no row', () => {
    const r = build(file({ '61': [club()] }), ['61', '86'])!
    expect(r.count).toBe(1)
    expect(r.rows.map(x => x.id)).toEqual(['61'])
  })

  it('counts an empty list as a measured zero, with no row', () => {
    const r = build(file({ '61': [], '86': [] }), ['61', '86'])!
    expect(r).toMatchObject({ count: 0, adds: 0, rows: [] })
    expect(r.card).toBe('0 add to the club base')
  })

  it('takes every district worldwide, F included and U left out', () => {
    const r = build(
      file({ F: [club()], U: [club(), club()], '61': [closed()] }),
      'all'
    )!
    expect(r.count).toBe(2)
    expect(r.rows.map(x => x.id).sort()).toEqual(['61', 'F'])
  })

  it('leaves U out even when a region lists it', () => {
    const r = build(file({ U: [club()], '61': [club()] }), ['61', 'U'])!
    expect(r.count).toBe(1)
  })

  it('counts the clubs in the oldest renewal period', () => {
    const r = build(
      file({
        '61': [
          closed({ oldestPeriod: true }),
          closed({ oldestPeriod: true }),
          closed(),
        ],
      }),
      'all'
    )!
    expect(r.rows[0]!.oldest).toBe(2)
  })

  it('uses the district card’s rule: an undecided reason never adds', () => {
    const r = build(
      file({
        '61': [
          club({ reason: 'suspend_date_unexpected', addsToBase: true }),
          club({ reason: 'a_code_from_a_later_release', addsToBase: true }),
          club(),
        ],
      }),
      'all'
    )!
    expect(r.adds).toBe(1)
    // The clubs whose effect isn't known are counted, not dropped (S6).
    expect(r.unknown).toBe(2)
    expect(r.rows[0]!.unknown).toBe(2)
    expect(r.card).toBe(
      '1 adds to the club base · 2 effect on the club base not known'
    )
  })

  it('says nothing about an unknown effect when every effect is known', () => {
    const r = build(file({ '61': [club(), closed()] }), 'all')!
    expect(r.unknown).toBe(0)
    expect(r.card).toBe('1 adds to the club base')
  })

  it('sorts by adds to the club base, then total, then district number', () => {
    const r = build(
      file({
        '9': [closed(), closed(), closed()],
        '10': [club()],
        '2': [club(), closed()],
        '3': [club(), closed()],
        '1': [closed()],
      }),
      'all'
    )!
    expect(r.rows.map(x => x.id)).toEqual(['2', '3', '10', '9', '1'])
  })

  /* Ron, 2026-11-20: always this year's club base. A March 31 suspension
     doesn't add from April to June, whatever its addsToBase flag says. */
  it('April to June: a March 31 suspension is not summed as adding', () => {
    const spring = club({
      suspendDate: '2027-03-31',
      reason: 'suspended_mar31_before_oct1',
      addsToBase: true,
    })
    const date = '2027-05-15'
    const r = build(
      file(
        { '61': [spring, club({ reason: 'closed_does_not_add' })] },
        { snapshotDate: date, baseProgramYear: '2027-2028' }
      ),
      ['61'],
      { date }
    )!
    expect(r.adds).toBe(0)
    expect(r.rows[0]!.adds).toBe(0)
    expect(r.card).toBe('0 add to the club base')
  })

  it('from July 1: the March 31 suspension is summed as adding', () => {
    const spring = club({
      suspendDate: '2027-03-31',
      reason: 'suspended_mar31_before_oct1',
      addsToBase: true,
    })
    const date = '2027-07-01'
    const r = build(
      file(
        { '61': [spring] },
        { snapshotDate: date, baseProgramYear: '2027-2028' }
      ),
      ['61'],
      { date }
    )!
    expect(r.adds).toBe(1)
    expect(r.card).toBe('1 adds to the club base')
  })

  it('carries the page’s py and date on each district link', () => {
    const r = build(file({ '61': [club()] }), 'all', {
      search: '?py=2026-2027&date=2026-11-18&sort=x',
    })!
    expect(r.rows[0]!.to).toBe(
      '/district/61/growth?py=2026-2027&date=2026-11-18#growth-reinstate'
    )
  })
})
