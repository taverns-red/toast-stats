import { describe, expect, it } from 'vitest'
import fixture from '../../__tests__/fixtures/council-standing.recorded.json'
import {
  COUNCIL_DISCLAIMER,
  COUNCIL_STALE_DAYS,
  councilStandingCsvRows,
  deriveCouncilStanding,
  duesPeriodOf,
  groupByDivision,
  quorumOf,
  resolveCouncilSnapshot,
  type CouncilClub,
} from '../councilStanding'

/* #2300 — District Council voting strength as of a council date.
   Good standing is TI's own `clubStatus === 'Active'` (Policy 2.0 §4), never
   recomputed from counts: the fixture's in-period charter has 0 renewals and
   TI still shows it Active. Fixtures are cut from real CDN snapshots. */

const d61Oct = fixture.d61_2026_10_27 as CouncilClub[]
const d61Apr = fixture.d61_2026_04_29 as CouncilClub[]
const d31Oct = fixture.d31_2026_10_27 as CouncilClub[]

describe('duesPeriodOf', () => {
  it('puts Oct 1 – Mar 31 in the October period', () => {
    expect(duesPeriodOf('2026-10-01').start).toBe('2026-10-01')
    expect(duesPeriodOf('2026-12-31').start).toBe('2026-10-01')
    expect(duesPeriodOf('2027-03-31').start).toBe('2026-10-01')
    expect(duesPeriodOf('2027-03-31').end).toBe('2027-03-31')
  })

  it('puts Apr 1 – Sep 30 in the April period', () => {
    expect(duesPeriodOf('2026-04-01').start).toBe('2026-04-01')
    expect(duesPeriodOf('2026-09-30').start).toBe('2026-04-01')
    expect(duesPeriodOf('2026-09-30').end).toBe('2026-09-30')
  })

  it('names the period for display', () => {
    expect(duesPeriodOf('2026-10-12').label).toBe('October 2026 dues period')
    expect(duesPeriodOf('2027-02-01').label).toBe('October 2026 dues period')
    expect(duesPeriodOf('2026-05-01').label).toBe('April 2026 dues period')
  })
})

describe('resolveCouncilSnapshot', () => {
  const dates = ['2026-09-29', '2026-09-30', '2026-10-08', '2026-10-27']
  const today = '2026-10-28'

  it('refuses a snapshot from the previous dues period (Oct 3 → Sep 30)', () => {
    const r = resolveCouncilSnapshot(dates, '2026-10-03', today)
    expect(r.status).toBe('period-mismatch')
    if (r.status === 'none') throw new Error('unreachable')
    expect(r.snapshotDate).toBe('2026-09-30')
    expect(r.councilPeriod.start).toBe('2026-10-01')
    expect(r.snapshotPeriod.start).toBe('2026-04-01')
  })

  it('uses the latest snapshot on or before the date (Oct 12 → Oct 8)', () => {
    const r = resolveCouncilSnapshot(dates, '2026-10-12', today)
    expect(r).toMatchObject({
      status: 'ok',
      snapshotDate: '2026-10-08',
      gapDays: 4,
    })
  })

  it('uses a snapshot on the council date itself', () => {
    const r = resolveCouncilSnapshot(dates, '2026-10-08', today)
    expect(r).toMatchObject({ status: 'ok', snapshotDate: '2026-10-08' })
  })

  it(`flags a gap of more than ${COUNCIL_STALE_DAYS} days as stale`, () => {
    const r = resolveCouncilSnapshot(dates, '2026-10-16', today)
    expect(r).toMatchObject({
      status: 'stale',
      snapshotDate: '2026-10-08',
      gapDays: 8,
    })
    // Exactly the threshold is still fresh.
    expect(resolveCouncilSnapshot(dates, '2026-10-15', today).status).toBe('ok')
  })

  it('labels a future date in the same period, on the latest snapshot', () => {
    const r = resolveCouncilSnapshot(dates, '2026-11-14', today)
    expect(r).toMatchObject({
      status: 'future',
      snapshotDate: '2026-10-27',
      gapDays: 18,
    })
  })

  it('refuses a future date in the next dues period', () => {
    const r = resolveCouncilSnapshot(dates, '2027-04-25', today)
    expect(r.status).toBe('period-mismatch')
  })

  it('refuses a pre-2026 April date against a month-end March snapshot', () => {
    const monthEnds = ['2025-02-28', '2025-03-31', '2025-04-30']
    const r = resolveCouncilSnapshot(monthEnds, '2025-04-26', today)
    expect(r).toMatchObject({
      status: 'period-mismatch',
      snapshotDate: '2025-03-31',
    })
  })

  it('reports none before the first snapshot, naming it', () => {
    const r = resolveCouncilSnapshot(dates, '2026-01-01', today)
    expect(r).toEqual({ status: 'none', firstDate: '2026-09-29' })
  })

  it('reports none with no dates at all', () => {
    expect(resolveCouncilSnapshot([], '2026-10-12', today)).toEqual({
      status: 'none',
      firstDate: undefined,
    })
  })

  it('does not depend on the input order', () => {
    const shuffled = ['2026-10-27', '2026-09-29', '2026-10-08', '2026-09-30']
    expect(resolveCouncilSnapshot(shuffled, '2026-10-12', today)).toMatchObject(
      { snapshotDate: '2026-10-08' }
    )
  })
})

describe('quorumOf', () => {
  it('is one-third of the clubs in good standing, rounded up', () => {
    expect(quorumOf(158)).toBe(53)
    expect(quorumOf(139)).toBe(47)
    expect(quorumOf(3)).toBe(1)
    expect(quorumOf(0)).toBe(0)
  })
})

describe('deriveCouncilStanding', () => {
  it('reads TI status: Active is good, Low and Ineligible are not', () => {
    const s = deriveCouncilStanding(d61Oct)
    const byId = new Map(s.rows.map(r => [r.clubId, r]))
    expect(byId.get('3045')).toMatchObject({
      tiStatus: 'Active',
      inGoodStanding: true,
      votes: 2,
    })
    expect(byId.get('9560')).toMatchObject({
      tiStatus: 'Low',
      inGoodStanding: false,
      votes: 0,
      reason: 'Fewer than 8 paid members this dues period',
    })
    expect(byId.get('7261')).toMatchObject({
      tiStatus: 'Ineligible',
      inGoodStanding: false,
      votes: 0,
      reason: 'TI status: Ineligible',
    })
  })

  it('counts clubs, club votes (2 each) and quorum', () => {
    const s = deriveCouncilStanding(d61Oct)
    expect(s.goodCount).toBe(3)
    expect(s.clubVotes).toBe(6)
    expect(s.quorumClubs).toBe(1)
    expect(s.good.map(r => r.clubId).sort()).toEqual(
      ['28678571', '28679190', '3045'].sort()
    )
    expect(s.notGood.map(r => r.clubId).sort()).toEqual(['7261', '9560'])
  })

  it("trusts TI's verdict for a first-period charter with 0 renewals", () => {
    const [charter] = d61Apr
    expect(charter!.aprilRenewals + charter!.octoberRenewals).toBe(0)
    const s = deriveCouncilStanding(d61Apr)
    expect(s.rows[0]).toMatchObject({ clubId: '28679190', votes: 2 })
    expect(s.goodCount).toBe(1)
  })

  it('lists a suspended club as not in good standing', () => {
    const s = deriveCouncilStanding(d31Oct)
    expect(s.rows[0]).toMatchObject({
      clubId: '902446',
      inGoodStanding: false,
      reason: 'TI status: Suspended',
    })
    expect(s.goodCount).toBe(0)
  })

  it('never counts a club with no TI status', () => {
    const base = d61Oct[0]!
    const { clubStatus: _omit, ...noStatus } = base
    void _omit
    const s = deriveCouncilStanding([noStatus])
    expect(s.rows[0]).toMatchObject({
      inGoodStanding: false,
      reason: 'No TI status in this snapshot',
    })
  })

  it('leaves out prospective clubs, which are not Member Clubs yet', () => {
    const prospective = { ...d61Oct[0]!, clubId: '1', isProspective: true }
    expect(deriveCouncilStanding([prospective]).rows).toHaveLength(0)
  })
})

describe('groupByDivision', () => {
  it('groups by division in order, clubs by area then name', () => {
    const groups = groupByDivision(deriveCouncilStanding(d61Oct).rows)
    expect(groups.map(g => g.divisionId)).toEqual(['A', 'C', 'G', 'I'])
    expect(groups[0]!.rows.map(r => r.clubId)).toEqual(['9560', '3045'])
  })
})

describe('councilStandingCsvRows', () => {
  const s = deriveCouncilStanding(d61Oct)
  const rows = councilStandingCsvRows({
    districtId: '61',
    snapshotDate: '2026-10-27',
    councilDate: '2026-11-14',
    rows: s.rows,
  })

  it('opens with the disclaimer row', () => {
    expect(String(rows[0]![0])).toContain(COUNCIL_DISCLAIMER)
  })

  it('carries the header and one row per club, with Y/N and votes', () => {
    const headerAt = rows.findIndex(r => r[0] === 'District')
    expect(rows[headerAt]).toEqual([
      'District',
      'TI data as of',
      'Council date',
      'Club number',
      'Club name',
      'Division',
      'Area',
      'TI status',
      'In good standing',
      'Votes',
      'Reason',
    ])
    const body = rows.slice(headerAt + 1)
    expect(body).toHaveLength(5)
    expect(body.find(r => r[3] === '3045')).toEqual([
      '61',
      '2026-10-27',
      '2026-11-14',
      '3045',
      'Limestone City Club',
      'A',
      '01',
      'Active',
      'Y',
      2,
      '',
    ])
    expect(body.find(r => r[3] === '9560')?.slice(7)).toEqual([
      'Low',
      'N',
      0,
      'Fewer than 8 paid members this dues period',
    ])
  })
})

describe('COUNCIL_DISCLAIMER', () => {
  it("says the list is derived, not TI's official credentials list", () => {
    expect(COUNCIL_DISCLAIMER).toContain(
      "derived from TI's public dashboard, not TI's official credentials list (District Central)"
    )
  })
})
