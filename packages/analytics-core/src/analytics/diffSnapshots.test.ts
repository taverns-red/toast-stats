import { describe, it, expect } from 'vitest'
import { diffSnapshots } from './diffSnapshots.js'
import type {
  DistrictStatisticsFile,
  ClubStatisticsFile,
  ScrapedRecord,
} from '@taverns-red/shared-contracts'

function club(
  over: Partial<ClubStatisticsFile> & { clubId: string }
): ClubStatisticsFile {
  return {
    clubName: `Club ${over.clubId}`,
    divisionId: 'A',
    areaId: '01',
    membershipCount: 20,
    paymentsCount: 25,
    dcpGoals: 0,
    status: 'Active',
    divisionName: 'Division A',
    areaName: 'Area 01',
    octoberRenewals: 0,
    aprilRenewals: 0,
    newMembers: 0,
    membershipBase: 20,
    clubStatus: 'Active',
    ...over,
  }
}

function perf(clubId: string, distinguished: string | null): ScrapedRecord {
  return {
    'Club Number': clubId,
    'Club Distinguished Status': distinguished,
  }
}

function snapshot(opts: {
  date: string
  clubs: ClubStatisticsFile[]
  perf?: ScrapedRecord[]
  /** Raw District.aspx rows — the only home of `Late Ren.`/`Total Chart` (#1459). */
  districtPerf?: ScrapedRecord[]
}): DistrictStatisticsFile {
  const { clubs } = opts
  return {
    districtId: '61',
    snapshotDate: opts.date,
    clubs,
    divisions: [],
    areas: [],
    totals: {
      totalClubs: clubs.length,
      totalMembership: clubs.reduce((s, c) => s + c.membershipCount, 0),
      totalPayments: clubs.reduce((s, c) => s + c.paymentsCount, 0),
      // Deliberately 0 — mirrors live data where totals.distinguished* is
      // unpopulated mid-year (Lesson 115). The engine must NOT read these.
      distinguishedClubs: 0,
      selectDistinguishedClubs: 0,
      presidentDistinguishedClubs: 0,
    },
    divisionPerformance: [],
    clubPerformance: opts.perf ?? clubs.map(c => perf(c.clubId, '')),
    districtPerformance: opts.districtPerf ?? [],
  }
}

describe('diffSnapshots', () => {
  it('computes signed aggregate deltas from totals (membership, payments, clubCount)', () => {
    const from = snapshot({
      date: '2026-05-25',
      clubs: [club({ clubId: '001', membershipCount: 20, paymentsCount: 22 })],
    })
    const to = snapshot({
      date: '2026-05-26',
      clubs: [club({ clubId: '001', membershipCount: 26, paymentsCount: 25 })],
    })
    const diff = diffSnapshots(from, to)
    expect(diff.totals.membership).toEqual({ from: 20, to: 26, delta: 6 })
    expect(diff.totals.payments).toEqual({ from: 22, to: 25, delta: 3 })
    expect(diff.totals.clubCount).toEqual({ from: 1, to: 1, delta: 0 })
    expect(diff.districtId).toBe('61')
    expect(diff.from.date).toBe('2026-05-25')
    expect(diff.to.date).toBe('2026-05-26')
    expect(diff.dayCount).toBe(1)
  })

  it('counts distinguished from clubPerformance, NOT totals (Lesson 115)', () => {
    // totals.distinguishedClubs stays 0 in both; clubPerformance tells the truth.
    const from = snapshot({
      date: '2026-05-25',
      clubs: [club({ clubId: '001' }), club({ clubId: '002' })],
      perf: [perf('001', 'D'), perf('002', '')],
    })
    const to = snapshot({
      date: '2026-05-26',
      clubs: [club({ clubId: '001' }), club({ clubId: '002' })],
      perf: [perf('001', 'D'), perf('002', 'S')],
    })
    const diff = diffSnapshots(from, to)
    // 1 distinguished -> 2 distinguished, despite totals.distinguishedClubs == 0
    expect(diff.totals.distinguished).toEqual({ from: 1, to: 2, delta: 1 })
  })

  it('partitions clubs into bothPresent / onlyInFrom / onlyInTo', () => {
    const from = snapshot({
      date: '2026-05-25',
      clubs: [club({ clubId: '001' }), club({ clubId: 'gone' })],
    })
    const to = snapshot({
      date: '2026-05-26',
      clubs: [club({ clubId: '001' }), club({ clubId: 'new' })],
    })
    const diff = diffSnapshots(from, to)
    expect(diff.clubs.bothPresent.map(c => c.clubId)).toEqual(['001'])
    expect(diff.clubs.onlyInFrom.map(c => c.clubId)).toEqual(['gone'])
    expect(diff.clubs.onlyInTo.map(c => c.clubId)).toEqual(['new'])
  })

  it('classifies roster appear/disappear with clubStatus, not as an error (Lesson 118)', () => {
    const from = snapshot({
      date: '2026-05-25',
      clubs: [club({ clubId: 'susp', clubStatus: 'Suspended' })],
    })
    const to = snapshot({
      date: '2026-05-26',
      clubs: [club({ clubId: 'new', clubStatus: 'Active' })],
    })
    const diff = diffSnapshots(from, to)
    expect(diff.clubs.onlyInFrom[0]?.clubStatus).toBe('Suspended')
    expect(diff.clubs.onlyInTo[0]?.clubStatus).toBe('Active')
    const added = diff.events.find(e => e.category === 'club-added')
    const removed = diff.events.find(e => e.category === 'club-removed')
    expect(added?.label).toMatch(/Active/)
    expect(removed?.label).toMatch(/Suspended/)
  })

  it('emits a per-club ClubDiff with signed membership/dcpGoals/distinguished change', () => {
    const from = snapshot({
      date: '2026-05-25',
      clubs: [club({ clubId: '001', membershipCount: 20, dcpGoals: 3 })],
      perf: [perf('001', '')],
    })
    const to = snapshot({
      date: '2026-05-26',
      clubs: [club({ clubId: '001', membershipCount: 18, dcpGoals: 6 })],
      perf: [perf('001', 'D')],
    })
    const cd = diffSnapshots(from, to).clubs.bothPresent[0]!
    expect(cd.membership.delta).toBe(-2)
    expect(cd.dcpGoals.delta).toBe(3)
    expect(cd.distinguishedFrom).toBe('')
    expect(cd.distinguishedTo).toBe('D')
    expect(cd.distinguishedChanged).toBe(true)
  })

  it('produces categorized events for every change kind', () => {
    const from = snapshot({
      date: '2026-05-25',
      clubs: [
        club({ clubId: '001', membershipCount: 20, dcpGoals: 2 }),
        club({ clubId: 'gone' }),
      ],
      perf: [perf('001', ''), perf('gone', '')],
    })
    const to = snapshot({
      date: '2026-05-26',
      clubs: [
        club({ clubId: '001', membershipCount: 23, dcpGoals: 5 }),
        club({ clubId: 'new' }),
      ],
      perf: [perf('001', 'D'), perf('new', '')],
    })
    const cats = new Set(diffSnapshots(from, to).events.map(e => e.category))
    expect(cats).toEqual(
      new Set([
        'membership',
        'dcp-goals',
        'distinguished',
        'club-added',
        'club-removed',
      ])
    )
  })

  it('labels a P→M promotion as "Smedley Distinguished" (#1226)', () => {
    // Tier code M = Smedley Distinguished (top DCP tier), NOT plain
    // "Distinguished". DataTransformer counts M into smedleyDistinguishedClubs.
    const from = snapshot({
      date: '2026-05-25',
      clubs: [club({ clubId: '001' })],
      perf: [perf('001', 'P')],
    })
    const to = snapshot({
      date: '2026-05-26',
      clubs: [club({ clubId: '001' })],
      perf: [perf('001', 'M')],
    })
    const event = diffSnapshots(from, to).events.find(
      e => e.category === 'distinguished'
    )
    expect(event?.label).toContain('Smedley Distinguished')
    expect(event?.label).toBe('Club 001 moved to Smedley Distinguished')
  })

  it('returns no events when nothing changed (valid outcome)', () => {
    const a = snapshot({
      date: '2026-05-25',
      clubs: [club({ clubId: '001' })],
    })
    const b = snapshot({
      date: '2026-05-26',
      clubs: [club({ clubId: '001' })],
    })
    expect(diffSnapshots(a, b).events).toEqual([])
  })

  it('sorts events by descending absolute magnitude', () => {
    const from = snapshot({
      date: '2026-05-25',
      clubs: [
        club({ clubId: 'big', membershipCount: 20 }),
        club({ clubId: 'small', membershipCount: 20 }),
      ],
    })
    const to = snapshot({
      date: '2026-05-26',
      clubs: [
        club({ clubId: 'big', membershipCount: 30 }),
        club({ clubId: 'small', membershipCount: 19 }),
      ],
    })
    const events = diffSnapshots(from, to).events
    expect(Math.abs(events[0]!.magnitude)).toBeGreaterThanOrEqual(
      Math.abs(events[1]!.magnitude)
    )
    expect(events[0]!.clubId).toBe('big')
  })

  it('tolerates null distinguished status from clubPerformance', () => {
    const from = snapshot({
      date: '2026-05-25',
      clubs: [club({ clubId: '001' })],
      perf: [perf('001', null)],
    })
    const to = snapshot({
      date: '2026-05-26',
      clubs: [club({ clubId: '001' })],
      perf: [perf('001', null)],
    })
    const diff = diffSnapshots(from, to)
    expect(diff.totals.distinguished).toEqual({ from: 0, to: 0, delta: 0 })
    expect(diff.clubs.bothPresent[0]!.distinguishedChanged).toBe(false)
  })

  /**
   * #1440 — the worst case in the audit. The diff keyed BOTH snapshots on the
   * raw `clubId`, so two dates written from differently-padded TI exports made
   * every club in the district read as removed-and-re-added: a total roster
   * replacement that never happened, rendered as fact in "What Changed".
   */
  describe('club-id padding (#1440)', () => {
    it('produces an EMPTY diff for two snapshots that differ only in padding', () => {
      const from = snapshot({
        date: '2026-05-25',
        clubs: [
          club({ clubId: '00009905', membershipCount: 20 }),
          club({ clubId: '00000180', membershipCount: 31 }),
        ],
        perf: [perf('00009905', 'D'), perf('00000180', '')],
      })
      const to = snapshot({
        date: '2026-05-26',
        clubs: [
          club({ clubId: '9905', membershipCount: 20 }),
          club({ clubId: '180', membershipCount: 31 }),
        ],
        perf: [perf('9905', 'D'), perf('180', '')],
      })

      const diff = diffSnapshots(from, to)

      expect(diff.clubs.onlyInFrom).toEqual([])
      expect(diff.clubs.onlyInTo).toEqual([])
      expect(diff.clubs.bothPresent).toHaveLength(2)
      expect(diff.events).toEqual([])
      expect(diff.totals.distinguished).toEqual({ from: 1, to: 1, delta: 0 })
    })

    it('still reports a real change across a padding difference', () => {
      const from = snapshot({
        date: '2026-05-25',
        clubs: [club({ clubId: '00009905', membershipCount: 20 })],
        perf: [perf('00009905', '')],
      })
      const to = snapshot({
        date: '2026-05-26',
        clubs: [club({ clubId: '9905', membershipCount: 26 })],
        perf: [perf('9905', '')],
      })

      const diff = diffSnapshots(from, to)

      expect(diff.clubs.onlyInFrom).toEqual([])
      expect(diff.clubs.onlyInTo).toEqual([])
      expect(diff.events.map(e => e.category)).toEqual(['membership'])
      expect(diff.events[0]!.magnitude).toBe(6)
    })

    it('still reports a genuine departure and arrival', () => {
      const from = snapshot({
        date: '2026-05-25',
        clubs: [club({ clubId: '00009905' }), club({ clubId: '0000777' })],
      })
      const to = snapshot({
        date: '2026-05-26',
        clubs: [club({ clubId: '9905' }), club({ clubId: '888' })],
      })

      const diff = diffSnapshots(from, to)

      expect(diff.clubs.onlyInFrom.map(c => c.clubId)).toEqual(['0000777'])
      expect(diff.clubs.onlyInTo.map(c => c.clubId)).toEqual(['888'])
    })
  })
})

/* District-composition discontinuity (#1443).

   The 2026-07-01 reformation merged and split districts and moved clubs
   between them. A default diff for a surviving district straddles that
   boundary (last June vs first July) and used to render every transferred
   club as "X (Active) joined the roster" / "left the roster" — dozens of
   them. Those clubs did not join or leave; the district's boundaries moved.

   The regression risk these tests exist to guard: a NORMAL within-year diff
   must be unchanged. That is pinned first, on the whole event list. */
describe('diffSnapshots — district-composition discontinuity (#1443)', () => {
  /* Cohort markers must be NUMERIC and distinct.
   *
   * `normalizeClubId` (#1440) strips every non-digit before stripping leading
   * zeros, so a LETTER prefix collapses every cohort onto the same canonical
   * ids: `out001`, `in001`, `stay001` and `s001` all become `1`. The two
   * snapshots then see one club present on both sides, no club reads as moved,
   * and the discontinuity these tests exist to check can never fire — the
   * suite would fail for a reason that has nothing to do with the behaviour
   * under test.
   *
   * Distinct numeric blocks keep each cohort a distinct club under the shipped
   * identity rule. Unknown prefixes throw rather than silently colliding: a
   * future cohort added without a block would otherwise reintroduce exactly
   * the collapse described above, invisibly. (That collapse is the collision
   * tracked in #1450.)
   */
  const COHORT_BLOCK: Record<string, number> = {
    s: 100,
    stay: 101,
    in: 102,
    out: 103,
  }

  /** N clubs with sequential ids, `prefix` distinguishing the cohort. */
  function clubs(prefix: string, count: number): ClubStatisticsFile[] {
    const block = COHORT_BLOCK[prefix]
    if (block === undefined) {
      throw new Error(
        `no COHORT_BLOCK for prefix '${prefix}' — add one, or cohorts collide under normalizeClubId (#1450)`
      )
    }
    return Array.from({ length: count }, (_, i) =>
      club({ clubId: `${block}${String(i + 1).padStart(3, '0')}` })
    )
  }

  it('leaves a normal within-year diff completely unchanged', () => {
    const from = snapshot({
      date: '2026-05-25',
      clubs: [...clubs('s', 40), club({ clubId: 'gone' })],
    })
    const to = snapshot({
      date: '2026-05-26',
      clubs: [...clubs('s', 40), club({ clubId: 'new' })],
    })
    const diff = diffSnapshots(from, to)

    expect(diff.rosterDiscontinuity).toBeUndefined()
    expect(diff.events).toEqual([
      {
        category: 'club-removed',
        clubId: 'gone',
        clubName: 'Club gone',
        label: 'Club gone (Active) left the roster',
        magnitude: -1,
      },
      {
        category: 'club-added',
        clubId: 'new',
        clubName: 'Club new',
        label: 'Club new (Active) joined the roster',
        magnitude: 1,
      },
    ])
    expect(diff.clubs.onlyInFrom).toEqual([
      {
        clubId: 'gone',
        clubName: 'Club gone',
        divisionId: 'A',
        areaId: '01',
        clubStatus: 'Active',
      },
    ])
    expect(diff.clubs.onlyInTo[0]).not.toHaveProperty('transferred')
  })

  /** Last June → first July, with a reformation-sized roster exchange. */
  function reformationPair(over?: {
    extraFrom?: ClubStatisticsFile[]
    extraTo?: ClubStatisticsFile[]
  }) {
    return {
      from: snapshot({
        date: '2026-06-30',
        clubs: [
          ...clubs('stay', 30),
          ...clubs('out', 10),
          ...(over?.extraFrom ?? []),
        ],
      }),
      to: snapshot({
        date: '2026-07-01',
        clubs: [
          ...clubs('stay', 30),
          ...clubs('in', 12),
          ...(over?.extraTo ?? []),
        ],
      }),
    }
  }

  it('reports the discontinuity when the pair straddles a program-year boundary with a reformation-sized roster exchange', () => {
    const { from, to } = reformationPair()
    const diff = diffSnapshots(from, to)

    expect(diff.rosterDiscontinuity).toEqual({
      kind: 'program-year-boundary',
      fromProgramYear: '2025-2026',
      toProgramYear: '2026-2027',
      clubsMovedIn: 12,
      clubsMovedOut: 10,
    })
  })

  it('classifies transferred clubs as transfers, not as joining or leaving the roster', () => {
    const { from, to } = reformationPair()
    const events = diffSnapshots(from, to).events

    const movedIn = events.filter(e => e.category === 'club-transferred-in')
    const movedOut = events.filter(e => e.category === 'club-transferred-out')
    expect(movedIn).toHaveLength(12)
    expect(movedOut).toHaveLength(10)
    expect(events.some(e => e.category === 'club-added')).toBe(false)
    expect(events.some(e => e.category === 'club-removed')).toBe(false)

    // No transferred club is described as having joined or left the roster.
    for (const e of [...movedIn, ...movedOut]) {
      expect(e.label).not.toContain('the roster')
      expect(e.label.startsWith(e.clubName)).toBe(true)
      expect(e.label).toContain('realignment')
    }
    expect(movedIn[0]!.label).toBe(
      'Club 102001 (Active) moved into the district in the 2026 district realignment'
    )
    expect(movedOut[0]!.label).toBe(
      'Club 103001 (Active) moved to another district in the 2026 district realignment'
    )
  })

  it('marks transferred clubs on the presence lists', () => {
    const { from, to } = reformationPair()
    const diff = diffSnapshots(from, to)
    expect(diff.clubs.onlyInTo.every(c => c.transferred === true)).toBe(true)
    expect(diff.clubs.onlyInFrom.every(c => c.transferred === true)).toBe(true)
  })

  it('keeps a genuine new charter visible as a roster join, not a transfer', () => {
    const { from, to } = reformationPair({
      extraTo: [club({ clubId: 'brandnew', charterDate: '2026-07-01' })],
    })
    const diff = diffSnapshots(from, to)

    const added = diff.events.filter(e => e.category === 'club-added')
    expect(added).toHaveLength(1)
    expect(added[0]!.clubId).toBe('brandnew')
    expect(added[0]!.label).toBe('Club brandnew (Active) joined the roster')
    expect(
      diff.clubs.onlyInTo.find(c => c.clubId === 'brandnew')
    ).not.toHaveProperty('transferred')
    // A club chartered long before the window is still a transfer.
    expect(
      diff.events.filter(e => e.category === 'club-transferred-in')
    ).toHaveLength(12)
  })

  it('keeps a genuine closure visible as a roster departure, not a transfer', () => {
    const { from, to } = reformationPair({
      extraFrom: [club({ clubId: 'closed', clubStatus: 'Suspended' })],
    })
    const diff = diffSnapshots(from, to)

    const removed = diff.events.filter(e => e.category === 'club-removed')
    expect(removed).toHaveLength(1)
    expect(removed[0]!.clubId).toBe('closed')
    expect(removed[0]!.label).toBe('Club closed (Suspended) left the roster')
    expect(
      diff.events.filter(e => e.category === 'club-transferred-out')
    ).toHaveLength(10)
  })

  it('does not fire on ordinary July-rollover churn (too few clubs moved)', () => {
    const from = snapshot({
      date: '2026-06-30',
      clubs: [...clubs('stay', 40), ...clubs('out', 3)],
    })
    const to = snapshot({
      date: '2026-07-01',
      clubs: [...clubs('stay', 40), ...clubs('in', 1)],
    })
    const diff = diffSnapshots(from, to)

    expect(diff.rosterDiscontinuity).toBeUndefined()
    expect(diff.events.filter(e => e.category === 'club-removed')).toHaveLength(
      3
    )
    expect(diff.events.filter(e => e.category === 'club-added')).toHaveLength(1)
  })

  it('does not fire on a wide date range that merely happens to span July 1', () => {
    const from = snapshot({
      date: '2026-01-15',
      clubs: [...clubs('stay', 30), ...clubs('out', 10)],
    })
    const to = snapshot({
      date: '2026-12-15',
      clubs: [...clubs('stay', 30), ...clubs('in', 12)],
    })
    const diff = diffSnapshots(from, to)

    expect(diff.rosterDiscontinuity).toBeUndefined()
    expect(diff.events.filter(e => e.category === 'club-added')).toHaveLength(
      12
    )
  })

  it('does not fire within a program year however large the roster exchange', () => {
    const from = snapshot({
      date: '2026-05-25',
      clubs: [...clubs('stay', 30), ...clubs('out', 10)],
    })
    const to = snapshot({
      date: '2026-05-26',
      clubs: [...clubs('stay', 30), ...clubs('in', 12)],
    })
    const diff = diffSnapshots(from, to)

    expect(diff.rosterDiscontinuity).toBeUndefined()
    expect(diff.events.filter(e => e.category === 'club-added')).toHaveLength(
      12
    )
    expect(diff.events.filter(e => e.category === 'club-removed')).toHaveLength(
      10
    )
  })
})

/* Per-club payment events with payment-type attribution (#1459, epic #1458
   Sprint 1). The engine already computed each club's `payments` delta and
   dropped it on the floor — renewal season, the most campaign-relevant signal
   a district leader has, was invisible in the feed.

   Attribution sources (live-verified against
   https://cdn.taverns.red/snapshots/2026-08-30/district_61.json on 2026-08-31):
     - October/April renewals and new members are TYPED, required club fields.
     - Late renewals and charter payments live only in the raw
       `districtPerformance` rows (columns `Late Ren.` / `Total Chart`, keyed by
       `Club`), which every snapshot retains and the CDN read path hands over
       unparsed. When those rows are absent the two types are UNAVAILABLE, never
       faked as 0 — their contribution surfaces as the `N other` residual. */
describe('diffSnapshots — payments events (#1459)', () => {
  /** A raw districtPerformance row. Omit a column to make it unavailable. */
  function dperf(
    clubId: string,
    over: Record<string, string> = {}
  ): ScrapedRecord {
    return { Club: clubId, ...over }
  }

  function paymentsEvents(
    from: DistrictStatisticsFile,
    to: DistrictStatisticsFile
  ) {
    return diffSnapshots(from, to).events.filter(e => e.category === 'payments')
  }

  it('emits a payments event attributed from the typed club fields', () => {
    const from = snapshot({
      date: '2026-07-31',
      clubs: [
        club({
          clubId: '3045',
          paymentsCount: 20,
          octoberRenewals: 5,
          aprilRenewals: 3,
          newMembers: 2,
        }),
      ],
    })
    const to = snapshot({
      date: '2026-08-30',
      clubs: [
        club({
          clubId: '3045',
          paymentsCount: 24,
          octoberRenewals: 7,
          aprilRenewals: 4,
          newMembers: 3,
        }),
      ],
    })

    const events = paymentsEvents(from, to)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      category: 'payments',
      clubId: '3045',
      clubName: 'Club 3045',
      label:
        'Club 3045 recorded 4 new payments ' +
        '(2 October renewals, 1 April renewal, 1 new member)',
      magnitude: 4,
    })
  })

  it('attributes late renewals and charter payments from the raw districtPerformance rows', () => {
    const base = {
      paymentsCount: 20,
      octoberRenewals: 5,
      aprilRenewals: 3,
      newMembers: 2,
    }
    const from = snapshot({
      date: '2026-07-31',
      clubs: [club({ clubId: '3045', ...base })],
      districtPerf: [
        dperf('00003045', { 'Late Ren.': '0', 'Total Chart': '0' }),
      ],
    })
    const to = snapshot({
      date: '2026-08-30',
      clubs: [club({ clubId: '3045', ...base, paymentsCount: 23 })],
      // Padded `Club` key on one side only — the join is canonical (#1440).
      districtPerf: [dperf('3045', { 'Late Ren.': '2', 'Total Chart': '1' })],
    })

    const events = paymentsEvents(from, to)
    expect(events).toHaveLength(1)
    expect(events[0]!.magnitude).toBe(3)
    expect(events[0]!.label).toBe(
      'Club 3045 recorded 3 new payments (2 late renewals, 1 charter payment)'
    )
  })

  it('falls back to an "other" residual when late/charter columns are unavailable', () => {
    // No districtPerformance rows at all: 1 of the 5 payments is explained by
    // the typed October field, the other 4 must be reported as unattributed —
    // never silently dropped, never 0-faked into a named type.
    const from = snapshot({
      date: '2026-07-31',
      clubs: [
        club({
          clubId: '3045',
          paymentsCount: 20,
          octoberRenewals: 5,
          aprilRenewals: 3,
          newMembers: 2,
        }),
      ],
    })
    const to = snapshot({
      date: '2026-08-30',
      clubs: [
        club({
          clubId: '3045',
          paymentsCount: 25,
          octoberRenewals: 6,
          aprilRenewals: 3,
          newMembers: 2,
        }),
      ],
    })

    const events = paymentsEvents(from, to)
    expect(events[0]!.label).toBe(
      'Club 3045 recorded 5 new payments (1 October renewal, 4 other)'
    )
    expect(events[0]!.label).not.toContain('NaN')
  })

  it('treats an unparseable raw column as unavailable, not as zero', () => {
    const from = snapshot({
      date: '2026-07-31',
      clubs: [club({ clubId: '3045', paymentsCount: 20 })],
      districtPerf: [dperf('3045', { 'Late Ren.': '', 'Total Chart': '' })],
    })
    const to = snapshot({
      date: '2026-08-30',
      clubs: [club({ clubId: '3045', paymentsCount: 22 })],
      districtPerf: [dperf('3045', { 'Late Ren.': 'n/a', 'Total Chart': '—' })],
    })

    expect(paymentsEvents(from, to)[0]!.label).toBe(
      'Club 3045 recorded 2 new payments (2 other)'
    )
  })

  it('emits nothing when the payments delta is zero, even if the type mix shifted', () => {
    const from = snapshot({
      date: '2026-07-31',
      clubs: [
        club({
          clubId: '3045',
          paymentsCount: 20,
          octoberRenewals: 5,
          newMembers: 2,
        }),
      ],
    })
    const to = snapshot({
      date: '2026-08-30',
      clubs: [
        club({
          clubId: '3045',
          paymentsCount: 20,
          octoberRenewals: 6,
          newMembers: 1,
        }),
      ],
    })
    expect(paymentsEvents(from, to)).toEqual([])
  })

  it('reports a negative delta as a plain correction, with no type breakdown', () => {
    // A drop is a data correction at TI, not five clubs un-paying a renewal;
    // attributing it by type would narrate a story the numbers do not support.
    const from = snapshot({
      date: '2026-07-31',
      clubs: [club({ clubId: '3045', paymentsCount: 22, octoberRenewals: 5 })],
    })
    const to = snapshot({
      date: '2026-08-30',
      clubs: [club({ clubId: '3045', paymentsCount: 21, octoberRenewals: 4 })],
    })

    const events = paymentsEvents(from, to)
    expect(events[0]!.magnitude).toBe(-1)
    expect(events[0]!.label).toBe('Club 3045 recorded 1 fewer payment')
    expect(events[0]!.label).not.toContain('(')
  })

  /* The breakdown must never claim MORE than the total it decomposes.
     Per-type counts and the total can disagree: DataTransformer sources
     octoberRenewals from districtPerformance with a clubPerformance fallback
     that yields 0 when the columns are absent, so a pair straddling that skew
     shows a huge type delta against a small total delta. Printing the parts
     anyway narrates a number the headline contradicts one clause earlier. */
  it('suppresses the breakdown when the type deltas exceed the total', () => {
    const from = snapshot({
      date: '2026-07-31',
      clubs: [club({ clubId: '3045', paymentsCount: 20, octoberRenewals: 0 })],
    })
    const to = snapshot({
      date: '2026-08-30',
      clubs: [club({ clubId: '3045', paymentsCount: 23, octoberRenewals: 45 })],
    })

    // NOT "3 new payments (45 October renewals)".
    expect(paymentsEvents(from, to)[0]!.label).toBe(
      'Club 3045 recorded 3 new payments'
    )
  })

  it('suppresses the breakdown when a negative type delta makes the parts overshoot', () => {
    const from = snapshot({
      date: '2026-07-31',
      clubs: [
        club({
          clubId: '3045',
          paymentsCount: 20,
          octoberRenewals: 0,
          newMembers: 2,
        }),
      ],
    })
    const to = snapshot({
      date: '2026-08-30',
      clubs: [
        club({
          clubId: '3045',
          paymentsCount: 24,
          octoberRenewals: 6,
          newMembers: 0,
        }),
      ],
    })

    // oct +6 alone overshoots the +4 total, so no parts are named.
    expect(paymentsEvents(from, to)[0]!.label).toBe(
      'Club 3045 recorded 4 new payments'
    )
  })

  it('never lets the residual exceed the total', () => {
    const from = snapshot({
      date: '2026-07-31',
      clubs: [club({ clubId: '3045', paymentsCount: 20, octoberRenewals: 3 })],
    })
    const to = snapshot({
      date: '2026-08-30',
      clubs: [club({ clubId: '3045', paymentsCount: 25, octoberRenewals: 0 })],
    })

    // A NET-summed residual would read "8 other" against a 5-payment total.
    expect(paymentsEvents(from, to)[0]!.label).toBe(
      'Club 3045 recorded 5 new payments (5 other)'
    )
  })

  it('ignores a negative or fractional raw count rather than trusting it', () => {
    const from = snapshot({
      date: '2026-07-31',
      clubs: [club({ clubId: '3045', paymentsCount: 20 })],
      districtPerf: [
        dperf('3045', { 'Late Ren.': '-3', 'Total Chart': '2.5' }),
      ],
    })
    const to = snapshot({
      date: '2026-08-30',
      clubs: [club({ clubId: '3045', paymentsCount: 22 })],
      districtPerf: [
        dperf('3045', { 'Late Ren.': '1,000', 'Total Chart': '2.5' }),
      ],
    })

    // A payment count is a non-negative integer; anything else is unreadable,
    // so both types stay unavailable and the delta reports as residual.
    expect(paymentsEvents(from, to)[0]!.label).toBe(
      'Club 3045 recorded 2 new payments (2 other)'
    )
  })

  it('takes the FIRST raw row when duplicates normalize to one club', () => {
    const from = snapshot({
      date: '2026-07-31',
      clubs: [club({ clubId: '3045', paymentsCount: 20 })],
      districtPerf: [dperf('3045', { 'Late Ren.': '0', 'Total Chart': '0' })],
    })
    const to = snapshot({
      date: '2026-08-30',
      clubs: [club({ clubId: '3045', paymentsCount: 22 })],
      districtPerf: [
        dperf('3045', { 'Late Ren.': '2', 'Total Chart': '0' }),
        // Same club, padded — must NOT silently overwrite the row above.
        dperf('00003045', { 'Late Ren.': '9', 'Total Chart': '0' }),
      ],
    })

    expect(paymentsEvents(from, to)[0]!.label).toBe(
      'Club 3045 recorded 2 new payments (2 late renewals)'
    )
  })

  it('joins the sorted feed by absolute magnitude like every other category', () => {
    const from = snapshot({
      date: '2026-07-31',
      clubs: [
        club({ clubId: '101', membershipCount: 20, paymentsCount: 20 }),
        club({ clubId: '102', membershipCount: 20, paymentsCount: 20 }),
      ],
    })
    const to = snapshot({
      date: '2026-08-30',
      clubs: [
        // Club 101: +2 members, +9 payments (9 outranks everything below).
        club({
          clubId: '101',
          membershipCount: 22,
          paymentsCount: 29,
          newMembers: 9,
        }),
        club({ clubId: '102', membershipCount: 20, paymentsCount: 20 }),
      ],
    })

    const events = diffSnapshots(from, to).events
    expect(events.map(e => e.category)).toEqual(['payments', 'membership'])
    expect(events[0]!.magnitude).toBe(9)
  })
})
