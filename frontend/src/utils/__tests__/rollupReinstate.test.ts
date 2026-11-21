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
    expect(r.netGrowth).toBe(3)
    // #3130: the card counts the 3 that add to net club growth.
    expect(r.card).toBe('3 add to net club growth')
    expect(r.rows).toEqual([
      {
        id: '61',
        label: 'District 61',
        to: '/district/61/growth#growth-reinstate',
        suspended: 2,
        closed: 2,
        netGrowth: 2,
        total: 4,
      },
      {
        id: '86',
        label: 'District 86',
        to: '/district/86/growth#growth-reinstate',
        suspended: 1,
        closed: 0,
        netGrowth: 1,
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
    expect(r).toMatchObject({ count: 0, netGrowth: 0, rows: [] })
    expect(r.card).toBe('0 add to net club growth')
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

  it('keeps no oldest-period or unknown-effect counts (#3103)', () => {
    // Ron's ruling (2026-11-20): five periods, and the pipeline always
    // decides the effect on the club base. An older file still flags
    // oldestPeriod; it is ignored.
    const r = build(
      file({ '61': [closed({ oldestPeriod: true }), closed()] }),
      'all'
    )!
    expect(r).not.toHaveProperty('unknown')
    expect(r.rows[0]).not.toHaveProperty('oldest')
    expect(r.rows[0]).not.toHaveProperty('unknown')
  })

  it('uses the district card’s rule: the pipeline’s addsToBase, whatever the code (#3103)', () => {
    const r = build(
      file({
        '61': [
          club({ reason: 'suspend_date_unexpected', addsToBase: true }),
          club({ reason: 'a_code_from_a_later_release', addsToBase: true }),
          club({ reason: 'suspended_mar31_before_july1', addsToBase: false }),
          club(),
        ],
      }),
      'all'
    )!
    expect(r.netGrowth).toBe(1)
    expect(r.rows[0]!.netGrowth).toBe(1)
    expect(r.card).toBe('1 adds to net club growth')
  })

  // #3130: the table counts net club growth, like the card.
  it('sorts by net club growth, then total, then district number', () => {
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
    expect(r.rows.map(x => x.id)).toEqual(['9', '2', '3', '1', '10'])
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
        { '61': [spring, closed()] },
        { snapshotDate: date, baseProgramYear: '2027-2028' }
      ),
      ['61'],
      { date }
    )!
    expect(r.netGrowth).toBe(2)
    expect(r.rows[0]!.netGrowth).toBe(2)
    expect(r.card).toBe('2 add to net club growth')
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
    expect(r.netGrowth).toBe(0)
    expect(r.card).toBe('0 add to net club growth')
  })

  /* Ron's ruling: a retired district's clubs count in the world total and
     in no region, with a note instead of a link, because the retired
     district has no current growth page. */
  describe('retired districts (#3101)', () => {
    const retired = (over: Partial<ReinstatableClub> = {}) =>
      closed({ districtRetiredOn: '2026-07-01', ...over })

    it('counts a retired district in the world total', () => {
      const r = build(
        file({ '61': [club()], '124': [retired(), retired()] }),
        'all'
      )!
      expect(r.count).toBe(3)
      expect(r.rows.map(x => x.id)).toEqual(['61', '124'])
    })

    it('counts it in no region: a region lists only its live districts', () => {
      const r = build(file({ '61': [club()], '124': [retired(), retired()] }), [
        '61',
        '86',
      ])!
      expect(r.count).toBe(1)
      expect(r.rows.map(x => x.id)).toEqual(['61'])
    })

    it('gives its row the note and no link', () => {
      const r = build(file({ '124': [retired()] }), 'all', {
        search: '?py=2026-2027',
      })!
      const row = r.rows[0]!
      expect(row).not.toHaveProperty('to')
      expect(row.label).toBe('District 124')
      expect(row.retiredNote).toBe('District 124 was retired on July 1, 2026.')
    })

    it('names the district as its row label does, and the year from the row', () => {
      const r = build(
        file({ '09': [retired({ districtRetiredOn: '2025-07-01' })] }),
        'all'
      )!
      expect(r.rows[0]!.label).toBe('District 09')
      expect(r.rows[0]!.retiredNote).toBe(
        'District 09 was retired on July 1, 2025.'
      )
    })

    it('gives a live district no note', () => {
      const r = build(file({ '61': [club()] }), 'all')!
      expect(r.rows[0]).not.toHaveProperty('retiredNote')
    })

    it('sorts retired districts after every live one', () => {
      const r = build(
        file({
          // Retired rows lead on net club growth (3 and 2), yet sort last.
          '124': [retired(), retired(), retired()],
          '98': [retired(), retired()],
          '61': [closed()],
          '86': [club()],
        }),
        'all'
      )!
      expect(r.rows.map(x => [x.id, x.netGrowth])).toEqual([
        ['61', 1],
        ['86', 0],
        ['124', 3],
        ['98', 2],
      ])
    })
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
