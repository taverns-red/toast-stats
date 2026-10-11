import { describe, it, expect } from 'vitest'
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import {
  summarizeClubCompliance,
  summarizeClubCoach,
  type ComplianceInput,
} from '../clubCompliance'

/**
 * #1790 — the club page's Compliance panel. Status strings are the ones in
 * D61's 2026-10-10 reports sidecar on the CDN (read 2026-10-11): officer list
 * "Received - MM/DD/YYYY" / "List Not Here"; dues "Verified complete -
 * MM/DD/YYYY" / "Low - …" / "Ineligible - …" / "**Renewals not here**"; CSP
 * "July 9, 2026" / "Not Submitted"; coach PENDING+active / AWARDED.
 * Visits come from the dashboard's divisionPerformance row ("1" / "0").
 */
const src = (reportType: string) => [
  { reportType, tableId: 'x', asOf: 'October 11, 2026' },
]

function dataset(
  overrides: Partial<Record<string, unknown>> = {}
): DistrictReportsDataset {
  return {
    districtId: '61',
    programYear: '2026-2027',
    generatedAt: '2026-10-11T09:05:12.053Z',
    sections: {
      officerList: {
        sources: src('officer-list'),
        records: [
          {
            club: '1009147',
            clubName: 'Los Amigos Online',
            division: 'D',
            area: '33',
            listStatus: 'Received - 05/25/2026',
            electionCadence: 'annual',
            officerListSubmitted: true,
          },
        ],
      },
      octoberDuesRenewal: {
        sources: src('dues-renewal'),
        records: [
          {
            club: '1009147',
            division: 'D',
            area: '33',
            renewalStatus: 'Verified complete - 08/03/2026',
            name: 'Los Amigos Online',
            location: 'Ottawa',
          },
        ],
      },
      aprilDuesRenewal: {
        sources: src('dues-renewal'),
        records: [
          {
            club: '1009147',
            division: 'D',
            area: '33',
            renewalStatus: 'Verified complete - 01/30/2026',
            name: 'Los Amigos Online',
            location: 'Ottawa',
          },
        ],
      },
      clubSuccessPlan: {
        sources: src('club-success-plan'),
        records: [
          {
            clubNumber: '1009147',
            division: 'D',
            area: '33',
            submissionDate: 'July 9, 2026',
            clubName: 'Los Amigos Online',
          },
        ],
      },
      coaches: {
        sources: src('coaches'),
        records: [
          {
            club: '1009147',
            clubName: 'Los Amigos Online',
            code: 'COACH',
            beginDate: '09/30/2026',
            status: 'PENDING',
            activeCoach: true,
          },
        ],
      },
      ...overrides,
    },
  } as unknown as DistrictReportsDataset
}

const base: ComplianceInput = {
  reports: dataset(),
  clubId: '01009147',
  divisionRecord: { 'Nov Visit award': '1', 'May Visit award': '0' },
  charterDate: '2009-01-01',
  programYear: '2026-2027',
  snapshotDate: '2026-10-10',
}

const row = (input: ComplianceInput, key: string) =>
  summarizeClubCompliance(input).find(r => r.key === key)

describe('summarizeClubCompliance', () => {
  it('lists officer list, dues, CSP and visits in a fixed order', () => {
    expect(summarizeClubCompliance(base).map(r => r.key)).toEqual([
      'officerList',
      'octoberDues',
      'aprilDues',
      'csp',
      'visitR1',
      'visitR2',
    ])
  })

  it('officer list received → ok with the date, and its report as source', () => {
    expect(row(base, 'officerList')).toEqual({
      key: 'officerList',
      label: 'Officer list',
      state: 'ok',
      value: 'Received May 25, 2026',
      source: 'Officer list report · October 11, 2026',
    })
  })

  it('officer list not here → warn', () => {
    const r = row(
      {
        ...base,
        reports: dataset({
          officerList: {
            sources: src('officer-list'),
            records: [
              {
                club: '1009147',
                clubName: '',
                division: 'D',
                area: '33',
                listStatus: 'List Not Here',
                electionCadence: 'annual',
                officerListSubmitted: false,
              },
            ],
          },
        }),
      },
      'officerList'
    )
    expect(r).toMatchObject({ state: 'warn', value: 'Not received' })
  })

  it('October dues verified this program year → ok', () => {
    expect(row(base, 'octoberDues')).toMatchObject({
      label: 'October dues',
      state: 'ok',
      value: 'Verified Aug 3, 2026',
    })
  })

  it.each([
    ['Low - Minimum requirement not yet met', 'warn', 'Minimum not yet met'],
    [
      'Ineligible - Minimum requirement not yet met',
      'bad',
      'Minimum not yet met (ineligible)',
    ],
    ['**Renewals not here**', 'warn', 'Not received'],
    ['Verified complete - 08/03/2025', 'warn', 'Not received'],
  ])('October dues "%s" → %s', (status, state, value) => {
    const r = row(
      {
        ...base,
        reports: dataset({
          octoberDuesRenewal: {
            sources: src('dues-renewal'),
            records: [
              {
                club: '1009147',
                division: 'D',
                area: '33',
                renewalStatus: status,
                name: '',
                location: '',
              },
            ],
          },
        }),
      },
      'octoberDues'
    )
    expect(r).toMatchObject({ state, value })
  })

  it("April dues are not yet due in October — last April's record is not this year's", () => {
    expect(row(base, 'aprilDues')).toMatchObject({
      label: 'April dues',
      state: 'neutral',
      value: 'Not yet due (April 2027)',
    })
  })

  it('April dues verified for this year in spring → ok', () => {
    const r = row(
      {
        ...base,
        snapshotDate: '2027-04-20',
        reports: dataset({
          aprilDuesRenewal: {
            sources: src('dues-renewal'),
            records: [
              {
                club: '1009147',
                division: 'D',
                area: '33',
                renewalStatus: 'Verified complete - 03/02/2027',
                name: '',
                location: '',
              },
            ],
          },
        }),
      },
      'aprilDues'
    )
    expect(r).toMatchObject({ state: 'ok', value: 'Verified Mar 2, 2027' })
  })

  it('CSP submitted → ok with its date', () => {
    expect(row(base, 'csp')).toMatchObject({
      label: 'Club Success Plan',
      state: 'ok',
      value: 'Submitted July 9, 2026',
    })
  })

  const notSubmitted = (extra: Partial<ComplianceInput> = {}) => ({
    ...base,
    ...extra,
    reports: dataset({
      clubSuccessPlan: {
        sources: src('club-success-plan'),
        records: [
          {
            clubNumber: '1009147',
            division: 'D',
            area: '33',
            submissionDate: 'Not Submitted',
            clubName: '',
          },
        ],
      },
    }),
  })

  it('CSP not submitted before the deadline → warn with the due date', () => {
    expect(
      row(notSubmitted({ snapshotDate: '2026-09-15' }), 'csp')
    ).toMatchObject({
      state: 'warn',
      value: 'Not submitted — due 30 September 2026',
    })
  })

  it('CSP not submitted after the deadline → bad, deadline passed', () => {
    expect(row(notSubmitted(), 'csp')).toMatchObject({
      state: 'bad',
      value: 'Not submitted — deadline 30 September 2026 passed',
    })
  })

  it('CSP for a club chartered after 1 April → automatic credit', () => {
    expect(
      row(
        notSubmitted({
          charterDate: '2027-04-15',
          snapshotDate: '2027-05-01',
        }),
        'csp'
      )
    ).toMatchObject({ state: 'ok', value: 'Automatic credit' })
  })

  it('visits read the dashboard row; source is the dashboard date', () => {
    expect(row(base, 'visitR1')).toEqual({
      key: 'visitR1',
      label: 'Round 1 club visit',
      state: 'ok',
      value: 'Completed',
      source: 'Dashboard · Oct 10, 2026',
    })
    expect(row(base, 'visitR2')).toMatchObject({
      state: 'neutral',
      value: 'Not yet recorded',
    })
  })

  it('accepts the lowercase "May visit award" field the CDN sometimes emits', () => {
    expect(
      row({ ...base, divisionRecord: { 'May visit award': '1' } }, 'visitR2')
    ).toMatchObject({ state: 'ok', value: 'Completed' })
  })

  it('every row says "not available" — never a guess — when its source is absent', () => {
    const rows = summarizeClubCompliance({
      ...base,
      reports: null,
      divisionRecord: null,
    })
    expect(rows).toHaveLength(6)
    for (const r of rows) {
      expect(r).toMatchObject({
        state: 'unknown',
        value: 'Not available for this date',
        source: '',
      })
    }
  })
})

describe('summarizeClubCoach', () => {
  it('an active coach → active, with the start date (no names)', () => {
    expect(summarizeClubCoach(dataset(), '1009147')).toEqual({
      status: 'active',
      label: 'Active since Sep 30, 2026',
      source: 'Coaches report · October 11, 2026',
    })
  })

  it('a finished coaching assignment → awarded', () => {
    const r = summarizeClubCoach(
      dataset({
        coaches: {
          sources: src('coaches'),
          records: [
            {
              club: '1009147',
              clubName: '',
              code: 'COACH',
              beginDate: '12/09/2025',
              status: 'AWARDED',
              activeCoach: false,
            },
          ],
        },
      }),
      '1009147'
    )
    expect(r).toMatchObject({
      status: 'awarded',
      label: 'Coach award earned (began Dec 9, 2025)',
    })
  })

  it('no coach record → none; no coaches section → null', () => {
    expect(summarizeClubCoach(dataset(), '3045')).toMatchObject({
      status: 'none',
      label: 'No coach',
    })
    expect(summarizeClubCoach(null, '3045')).toBeNull()
  })
})
