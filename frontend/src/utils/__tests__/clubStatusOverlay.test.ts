import { describe, it, expect } from 'vitest'
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import {
  parseVerifiedComplete,
  resolveClubStatusOverlay,
  buildDuesRenewalLookup,
  applyDuesRenewalOverlay,
} from '../clubStatusOverlay'
import type { OverlayableClub } from '../clubStatusOverlay'

describe('parseVerifiedComplete', () => {
  it('extracts an ISO date from "Verified complete - MM/DD/YYYY"', () => {
    expect(parseVerifiedComplete('Verified complete - 05/31/2026')).toBe(
      '2026-05-31'
    )
    expect(parseVerifiedComplete('Verified complete - 08/09/2025')).toBe(
      '2025-08-09'
    )
  })

  it('tolerates surrounding whitespace and is case-insensitive on the label', () => {
    expect(parseVerifiedComplete('  verified complete - 1/2/2026 ')).toBe(
      '2026-01-02'
    )
  })

  it('returns null for any non-verified status', () => {
    expect(parseVerifiedComplete('Not renewed')).toBeNull()
    expect(parseVerifiedComplete('Pending')).toBeNull()
    expect(parseVerifiedComplete('')).toBeNull()
    // "Verified" without a parseable date is not a promotion signal
    expect(parseVerifiedComplete('Verified complete')).toBeNull()
    expect(parseVerifiedComplete('Verified complete - soon')).toBeNull()
  })
})

describe('resolveClubStatusOverlay (promote-only, provenance)', () => {
  const ASOF = 'June 01, 2026'

  it('promotes a Low/stale base club to Active with provenance + activeSince', () => {
    const overlay = resolveClubStatusOverlay(
      'Low',
      'Verified complete - 05/31/2026',
      ASOF
    )
    expect(overlay).toEqual({
      status: 'Active',
      source: 'dues-renewal',
      activeSince: '2026-05-31',
      asOf: ASOF,
    })
  })

  it('Centretown D61 case (150→151): base Low + verified ⇒ Active, activeSince 2026-05-31', () => {
    const overlay = resolveClubStatusOverlay(
      'Low',
      'Verified complete - 05/31/2026',
      ASOF
    )
    expect(overlay?.status).toBe('Active')
    expect(overlay?.activeSince).toBe('2026-05-31')
    expect(overlay?.source).toBe('dues-renewal')
  })

  it('promotes a Suspended/Ineligible/undefined base when verified (upgrade-only)', () => {
    for (const base of ['Suspended', 'Ineligible', undefined]) {
      const overlay = resolveClubStatusOverlay(
        base,
        'Verified complete - 05/31/2026',
        ASOF
      )
      expect(overlay?.status).toBe('Active')
    }
  })

  it('is a NO-OP when the base is already Active (clean hand-off, no backward jump)', () => {
    expect(
      resolveClubStatusOverlay('Active', 'Verified complete - 05/31/2026', ASOF)
    ).toBeNull()
    // case-insensitive
    expect(
      resolveClubStatusOverlay('active', 'Verified complete - 05/31/2026', ASOF)
    ).toBeNull()
  })

  it('leaves a club unchanged when the renewal report does NOT verify it', () => {
    expect(resolveClubStatusOverlay('Low', 'Not renewed', ASOF)).toBeNull()
    expect(resolveClubStatusOverlay('Low', '', ASOF)).toBeNull()
    expect(
      resolveClubStatusOverlay('Suspended', 'Pending verification', ASOF)
    ).toBeNull()
  })

  it('never produces a status other than Active (promote-only, never demote)', () => {
    // The only status the overlay can ever emit is the top operational state.
    const overlay = resolveClubStatusOverlay(
      'Suspended',
      'Verified complete - 05/31/2026',
      ASOF
    )
    expect(overlay?.status).toBe('Active')
  })

  it('passes through an empty asOf without failing', () => {
    const overlay = resolveClubStatusOverlay(
      'Low',
      'Verified complete - 05/31/2026',
      ''
    )
    expect(overlay).toEqual({
      status: 'Active',
      source: 'dues-renewal',
      activeSince: '2026-05-31',
      asOf: '',
    })
  })
})

const datasetWith = (
  sections: DistrictReportsDataset['sections']
): DistrictReportsDataset => ({
  districtId: '61',
  programYear: '2025-2026',
  generatedAt: '2026-06-01T00:00:00.000Z',
  sections,
})

const duesSection = (
  asOf: string,
  records: Array<{ club: string; renewalStatus: string; name?: string }>
) => ({
  sources: [{ reportType: 'dues-renewal', tableId: '0235cdd5', asOf } as const],
  records: records.map(r => ({
    club: r.club,
    division: 'D',
    area: '33',
    renewalStatus: r.renewalStatus,
    name: r.name ?? 'A Club',
    location: 'Ottawa',
  })),
})

describe('buildDuesRenewalLookup (join key = club number, provenance asOf)', () => {
  it('returns an empty map for a null/absent dataset', () => {
    expect(buildDuesRenewalLookup(null, '2026-06-01').size).toBe(0)
    expect(buildDuesRenewalLookup(datasetWith({}), '2026-06-01').size).toBe(0)
  })

  it('maps each club number to its renewalStatus + the section asOf', () => {
    const ds = datasetWith({
      aprilDuesRenewal: duesSection('June 01, 2026', [
        { club: '1009147', renewalStatus: 'Verified complete - 05/31/2026' },
        { club: '7777777', renewalStatus: 'Not renewed' },
      ]),
    })
    const map = buildDuesRenewalLookup(ds, '2026-06-01')
    expect(map.get('1009147')).toEqual({
      renewalStatus: 'Verified complete - 05/31/2026',
      asOf: 'June 01, 2026',
    })
    expect(map.get('7777777')).toEqual({
      renewalStatus: 'Not renewed',
      asOf: 'June 01, 2026',
    })
  })

  it('uses the season whose dues period covers the viewed date when a club appears in both', () => {
    const ds = datasetWith({
      aprilDuesRenewal: duesSection('August 22, 2026', [
        { club: '1009147', renewalStatus: 'Verified complete - 01/30/2026' },
      ]),
      octoberDuesRenewal: duesSection('August 22, 2026', [
        { club: '1009147', renewalStatus: 'Verified complete - 08/03/2026' },
      ]),
    })
    // Sept: still the April period (Apr 1 – Sep 30) — the April record governs.
    expect(
      buildDuesRenewalLookup(ds, '2026-09-27').get('1009147')?.renewalStatus
    ).toBe('Verified complete - 01/30/2026')
    // Oct 1: the October period has started — the October record governs.
    expect(
      buildDuesRenewalLookup(ds, '2026-10-01').get('1009147')?.renewalStatus
    ).toBe('Verified complete - 08/03/2026')
  })
})

describe('renewal period gate (#1586): a verified renewal applies only while its dues period covers the viewed date', () => {
  // Pembroke & Area Club (D61 #5833), live data 2026-09-27: base Low, April
  // renewal not met, October renewal paid early (verified Aug 3).
  const pembroke = datasetWith({
    aprilDuesRenewal: duesSection('September 28, 2026', [
      {
        club: '5833',
        renewalStatus: 'Low - Minimum requirement not yet met',
      },
    ]),
    octoberDuesRenewal: duesSection('September 28, 2026', [
      { club: '5833', renewalStatus: 'Verified complete - 08/03/2026' },
    ]),
  })
  const overlayOn = (
    ds: DistrictReportsDataset,
    date: string,
    club: string
  ) => {
    const clubs: OverlayableClub[] = [{ clubId: club, clubStatus: 'Low' }]
    applyDuesRenewalOverlay(clubs, buildDuesRenewalLookup(ds, date))
    return clubs[0]!.statusOverlay
  }

  it('does NOT promote on an early October renewal before Oct 1 (Pembroke, 2026-09-27)', () => {
    expect(overlayOn(pembroke, '2026-09-27', '5833')).toBeUndefined()
  })

  it('promotes the same club once the October period starts', () => {
    expect(overlayOn(pembroke, '2026-10-01', '5833')).toEqual({
      status: 'Active',
      source: 'dues-renewal',
      activeSince: '2026-08-03',
      asOf: 'September 28, 2026',
    })
  })

  it('an early April renewal applies from Apr 1 through Sep 30 only', () => {
    const ds = datasetWith({
      aprilDuesRenewal: duesSection('January 16, 2026', [
        { club: '1', renewalStatus: 'Verified complete - 01/15/2026' },
      ]),
    })
    expect(overlayOn(ds, '2026-03-31', '1')).toBeUndefined()
    expect(overlayOn(ds, '2026-04-01', '1')?.status).toBe('Active')
    expect(overlayOn(ds, '2026-09-30', '1')?.status).toBe('Active')
    expect(overlayOn(ds, '2026-10-01', '1')).toBeUndefined()
  })

  it('a late October renewal applies from its verified date to Mar 31', () => {
    const ds = datasetWith({
      octoberDuesRenewal: duesSection('November 11, 2026', [
        { club: '2', renewalStatus: 'Verified complete - 11/10/2026' },
      ]),
    })
    expect(overlayOn(ds, '2026-11-09', '2')).toBeUndefined()
    expect(overlayOn(ds, '2026-11-10', '2')?.activeSince).toBe('2026-11-10')
    expect(overlayOn(ds, '2027-03-31', '2')?.status).toBe('Active')
    expect(overlayOn(ds, '2027-04-01', '2')).toBeUndefined()
  })
})

describe('applyDuesRenewalOverlay (join onto clubs at the assembly site)', () => {
  type C = OverlayableClub
  const centretownDataset = datasetWith({
    aprilDuesRenewal: duesSection('June 01, 2026', [
      { club: '1009147', renewalStatus: 'Verified complete - 05/31/2026' },
      { club: '2222222', renewalStatus: 'Not renewed' },
    ]),
  })

  it('attaches the overlay only to verified, non-Active clubs (Centretown 150→151)', () => {
    const clubs: C[] = [
      { clubId: '1009147', clubStatus: 'Low' }, // Centretown: promoted
      { clubId: '2222222', clubStatus: 'Low' }, // not renewed: unchanged
      { clubId: '3333333', clubStatus: 'Low' }, // absent from report: unchanged
      { clubId: '4444444', clubStatus: 'Active' }, // base-Active: no-op
    ]
    applyDuesRenewalOverlay(
      clubs,
      buildDuesRenewalLookup(centretownDataset, '2026-06-01')
    )

    expect(clubs[0]!.statusOverlay).toEqual({
      status: 'Active',
      source: 'dues-renewal',
      activeSince: '2026-05-31',
      asOf: 'June 01, 2026',
    })
    expect(clubs[1]!.statusOverlay).toBeUndefined()
    expect(clubs[2]!.statusOverlay).toBeUndefined()
    expect(clubs[3]!.statusOverlay).toBeUndefined()
    // The base status is NEVER mutated — overlay is read-time only.
    expect(clubs[0]!.clubStatus).toBe('Low')
  })

  it('is a no-op when the lookup is empty (graceful absence)', () => {
    const clubs: C[] = [{ clubId: '1009147', clubStatus: 'Low' }]
    applyDuesRenewalOverlay(clubs, buildDuesRenewalLookup(null, '2026-06-01'))
    expect(clubs[0]!.statusOverlay).toBeUndefined()
  })
})
