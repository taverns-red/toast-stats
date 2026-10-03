import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'

import {
  memberIdentityKey,
  parseDistrictReport,
  type ParsedDistrictReport,
} from '../DailyReportParser'

/**
 * Sprint 2 #1064 (epic #1062) — promote the validated keep/EXCLUDE column map
 * (spike #1063) into a real, pure parser.
 *
 * `parseDistrictReport(tableId, html)` returns typed, KEEP-only rows for each of
 * the 12 District Daily Reports. The HARD PRIVACY RULE (epic #1062): every
 * EXCLUDE (personal) column — and every personal cell value — is dropped at
 * parse time, before anything could ever be persisted. No pipeline wiring here.
 */

const FIXTURE_DIR = fileURLToPath(
  new URL('../../__tests__/fixtures/daily-reports/', import.meta.url)
)

const readFixture = (name: string): string =>
  readFileSync(FIXTURE_DIR + name, 'utf8')

// tableId GUIDs — verified in the spike doc, identical to the column-map test.
const ID = {
  aprilDues: '0235cdd5-ffee-4101-ab43-a952a2736fc0',
  octoberDues: '0d56c054-0cd2-46ba-b3b1-3bf17221bd6c',
  officerJan: '43abeb51-40a6-4514-868a-d697d6481753',
  officerJul: '68d834ff-90c1-40ae-a79e-c9270bd9919c',
  csp: '99b20422-f82f-456b-8376-18d5ce1b70c5',
  education: 'c757d313-f815-4b22-93dc-b839d04cec7b',
  tripleCrown: 'b546ef04-e602-4ffc-95c5-5a786aba36b7',
  archive: 'a30b93f3-081e-42c8-9a36-137acb24be69',
  newClubs: 'ac6df5db-13de-425a-b8b9-f9c6093b538a',
  prospective: '50630d17-1492-40c9-8244-930b1d94167b',
  sponsors: '4da53bd8-f6d9-4fa5-81d8-34ed5966dddd',
  coaches: '41955922-25ab-4a5a-8025-ebb7634f68bf',
} as const

/** Every personal value present in the recorded fixtures. NONE may survive. */
const PERSONAL_DENYLIST = [
  'Ricardo J. Bocanegra, DTM', // education-achievements → Member
  'Louise Audy, PM5', // sponsors-mentors → Name
  'Rodica Jelea, VC1', // coaches → Name
  'Linda Brisebois', // prospective-clubs → Club Contact
  '00987204 - Name unavailable', // triple-crown → Member (the ID is identifying)
]

/**
 * Serialize the WHOLE parsed result (rows and any per-report extras such as
 * education's `clubMembers`) into one blob, so a personal value can't hide in
 * a field the guard doesn't walk.
 */
function flattenValues(report: ParsedDistrictReport): string {
  return JSON.stringify(report)
}

const ALL_REPORTS: Array<{ id: string; fixture: string }> = [
  { id: ID.aprilDues, fixture: 'april-dues-renewal.html' },
  { id: ID.octoberDues, fixture: 'october-dues-renewal.html' },
  { id: ID.officerJan, fixture: 'officer-list-january.html' },
  { id: ID.officerJul, fixture: 'officer-list-july.html' },
  { id: ID.csp, fixture: 'club-success-plan.html' },
  { id: ID.education, fixture: 'education-achievements.html' },
  { id: ID.tripleCrown, fixture: 'triple-crown.html' },
  { id: ID.archive, fixture: 'education-archive-empty.html' },
  { id: ID.newClubs, fixture: 'new-clubs.html' },
  { id: ID.prospective, fixture: 'prospective-clubs.html' },
  { id: ID.sponsors, fixture: 'sponsors-mentors.html' },
  { id: ID.coaches, fixture: 'coaches.html' },
]

describe('parseDistrictReport — privacy backstop', () => {
  it.each(ALL_REPORTS)(
    'drops every personal value from $fixture',
    ({ id, fixture }) => {
      const html = readFixture(fixture)
      const report = parseDistrictReport(id, html)
      const blob = flattenValues(report)
      for (const personal of PERSONAL_DENYLIST) {
        expect(blob).not.toContain(personal)
      }
    }
  )

  // Each denylist value must actually exist in its source fixture, or the guard
  // above is vacuous. Pairs every denylist entry with the fixture it lives in.
  it.each([
    ['education-achievements.html', 'Ricardo J. Bocanegra, DTM'],
    ['sponsors-mentors.html', 'Louise Audy, PM5'],
    ['coaches.html', 'Rodica Jelea, VC1'],
    ['prospective-clubs.html', 'Linda Brisebois'],
    ['triple-crown.html', '00987204 - Name unavailable'],
  ])(
    'really had the personal value %s → "%s" in the raw fixture (falsifiability)',
    (fixture, personal) => {
      expect(readFixture(fixture)).toContain(personal)
    }
  )
})

describe('parseDistrictReport — typed KEEP shapes', () => {
  it('dues renewal keeps club-level cols, Name = club', () => {
    const r = parseDistrictReport(
      ID.aprilDues,
      readFixture('april-dues-renewal.html')
    )
    expect(r.reportType).toBe('dues-renewal')
    expect(r.rows.length).toBeGreaterThan(0)
    const row = r.rows[0]
    expect(Object.keys(row).sort()).toEqual(
      ['area', 'club', 'division', 'location', 'name', 'renewalStatus'].sort()
    )
    expect(row.club).not.toBe('')
  })

  it('officer list keeps List Status + Election + Name=club', () => {
    const r = parseDistrictReport(
      ID.officerJul,
      readFixture('officer-list-july.html')
    )
    expect(r.reportType).toBe('officer-list')
    expect(Object.keys(r.rows[0]).sort()).toEqual(
      ['area', 'club', 'division', 'election', 'listStatus', 'name'].sort()
    )
  })

  it('club success plan keeps the submission date', () => {
    const r = parseDistrictReport(ID.csp, readFixture('club-success-plan.html'))
    expect(r.reportType).toBe('club-success-plan')
    expect(Object.keys(r.rows[0]).sort()).toEqual(
      ['area', 'clubName', 'clubNumber', 'division', 'submissionDate'].sort()
    )
  })

  it('new clubs keeps charter date + status', () => {
    const r = parseDistrictReport(ID.newClubs, readFixture('new-clubs.html'))
    expect(r.reportType).toBe('new-clubs')
    expect(Object.keys(r.rows[0]).sort()).toEqual(
      [
        'area',
        'charterDate',
        'club',
        'division',
        'location',
        'name',
        'status',
      ].sort()
    )
  })

  it('prospective clubs drops Club Contact (person), keeps prospect milestones', () => {
    const r = parseDistrictReport(
      ID.prospective,
      readFixture('prospective-clubs.html')
    )
    expect(r.reportType).toBe('prospective-clubs')
    const keys = Object.keys(r.rows[0])
    expect(keys).not.toContain('clubContact')
    expect(keys.sort()).toEqual(
      [
        'area',
        'club',
        'division',
        'location',
        'name',
        'prospect',
        'status',
      ].sort()
    )
  })

  it('sponsors-mentors keeps club aggregates only, drops personal Name', () => {
    const r = parseDistrictReport(
      ID.sponsors,
      readFixture('sponsors-mentors.html')
    )
    expect(r.reportType).toBe('sponsors-mentors')
    expect(Object.keys(r.rows[0]).sort()).toEqual(
      ['charterDate', 'club', 'clubName', 'code', 'status'].sort()
    )
  })

  it('coaches keeps begin date + status, drops personal Name', () => {
    const r = parseDistrictReport(ID.coaches, readFixture('coaches.html'))
    expect(r.reportType).toBe('coaches')
    expect(Object.keys(r.rows[0]).sort()).toEqual(
      ['beginDate', 'club', 'clubName', 'code', 'status'].sort()
    )
  })
})

describe('parseDistrictReport — Education Achievements de-identified aggregation', () => {
  it('aggregates to per-club/area counts by award type, no member rows', () => {
    const r = parseDistrictReport(
      ID.education,
      readFixture('education-achievements.html')
    )
    expect(r.reportType).toBe('education-achievements')
    // 40 raw achievements collapse to 33 distinct (club, award) groups.
    expect(r.rows).toHaveLength(33)
    const total = r.rows.reduce((s, row) => s + row.achievementCount, 0)
    expect(total).toBe(40)
    const row = r.rows[0]
    expect(Object.keys(row).sort()).toEqual(
      [
        'area',
        'award',
        'club',
        'achievementCount',
        'division',
        'location',
        'name',
      ].sort()
    )
    expect(typeof row.achievementCount).toBe('number')
    // No member field, no personal value anywhere.
    expect(Object.keys(row)).not.toContain('member')
  })

  // #1080 — pin RAW activity semantics. DCP education credit counts DISTINCT
  // MEMBERS per award tier (sourced from clubPerformance "Level 1s"/"Level 2s"/…
  // via dcpGoals.ts); this daily-report metric deliberately does NOT dedup —
  // it can't, because the personal Member column is dropped before aggregation.
  it('counts two same-member same-award rows as achievementCount 2 (raw activity — DCP would credit 1)', () => {
    const html = `
      <table>
        <tr><th>Club</th><th>Division</th><th>Area</th><th>Award</th><th>Date</th><th>Member</th><th>Name</th><th>Location</th></tr>
        <tr><td>1234</td><td>A</td><td>1</td><td>PM1</td><td>7/15/2025</td><td>Same Member</td><td>Club X</td><td>Town</td></tr>
        <tr><td>1234</td><td>A</td><td>1</td><td>PM1</td><td>8/20/2025</td><td>Same Member</td><td>Club X</td><td>Town</td></tr>
      </table>`
    const r = parseDistrictReport(ID.education, html)
    expect(r.reportType).toBe('education-achievements')
    // One group (same club + award), raw activity count 2 — NOT member-deduped.
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({
      club: '1234',
      award: 'PM1',
      achievementCount: 2,
    })
  })
})

// #1592 — distinct members with ≥1 award per club, counted from the raw
// Member column INSIDE the parser. Only the count leaves; the Member value is
// never projected, stored or hashed (privacy backstop above walks the whole
// result, including clubMembers).
describe('parseDistrictReport — Education Achievements distinct members per club', () => {
  const table = (rows: string[][]) => `
    <table>
      <tr><th>Club</th><th>Division</th><th>Area</th><th>Award</th><th>Date</th><th>Member</th><th>Name</th><th>Location</th></tr>
      ${rows
        .map(
          ([club, award, member]) =>
            `<tr><td>${club}</td><td>A</td><td>1</td><td>${award}</td><td>7/15/2026</td><td>${member}</td><td>Club ${club}</td><td>Town</td></tr>`
        )
        .join('')}
    </table>`

  it('counts distinct members per club on the recorded fixture', () => {
    const r = parseDistrictReport(
      ID.education,
      readFixture('education-achievements.html')
    )
    if (r.reportType !== 'education-achievements') throw new Error('type')
    // Expected values computed independently (a one-off script over the
    // fixture) with the #1599 identity rule — number prefix stripped, name
    // before the first comma, `Name unavailable` rows keyed by member number —
    // over counted awards only (Pathways L1–L5 + DTM). The fixture's numbered
    // rows are all `Name unavailable` with distinct numbers, and its one
    // Pathways Mentor row belongs to a member with counted awards, so the
    // counts match the pre-#1599 raw-string result.
    expect(r.clubMembers).toEqual([
      { club: '1009147', membersWithAward: 8 },
      { club: '1036983', membersWithAward: 8 },
      { club: '1099641', membersWithAward: 2 },
    ])
  })

  it('a member with several awards counts once; the same name in two clubs counts in each', () => {
    const r = parseDistrictReport(
      ID.education,
      table([
        ['1234', 'PM1', 'Pat Doe'],
        ['1234', 'PM2', 'Pat Doe'],
        ['1234', 'PM1', 'Sam Roe'],
        ['5678', 'VC1', 'Pat Doe'],
      ])
    )
    if (r.reportType !== 'education-achievements') throw new Error('type')
    expect(r.clubMembers).toEqual([
      { club: '1234', membersWithAward: 2 },
      { club: '5678', membersWithAward: 1 },
    ])
  })

  it('ignores blank Member cells and surrounding whitespace', () => {
    const r = parseDistrictReport(
      ID.education,
      table([
        ['1234', 'PM1', '  Pat Doe '],
        ['1234', 'PM2', 'Pat Doe'],
        ['1234', 'PM3', ''],
      ])
    )
    if (r.reportType !== 'education-achievements') throw new Error('type')
    expect(r.clubMembers).toEqual([{ club: '1234', membersWithAward: 1 }])
  })

  // #1599 — defensive: real TI numbered rows are `NNNNNNNN - Name unavailable`
  // (suppressed names), but should a numbered row ever carry a name, it keys
  // on that name, so it and a designation-suffixed row of the same name merge.
  it('defensively treats a numbered and a named rendering of the same name as one member', () => {
    const r = parseDistrictReport(
      ID.education,
      table([
        ['1234', 'PM1Presentation Mastery Level 1', 'Pat Doe, PM5'],
        ['1234', 'PM2Presentation Mastery Level 2', '00012345 - Pat Doe'],
      ])
    )
    if (r.reportType !== 'education-achievements') throw new Error('type')
    expect(r.clubMembers).toEqual([{ club: '1234', membersWithAward: 1 }])
  })

  it('designation variants of one member count once', () => {
    const r = parseDistrictReport(
      ID.education,
      table([
        ['1234', 'PM5Presentation Mastery Level 5', 'Pat Doe, PM5'],
        ['1234', 'DTMDistinguished Toastmaster', 'Pat Doe, DTM'],
      ])
    )
    if (r.reportType !== 'education-achievements') throw new Error('type')
    expect(r.clubMembers).toEqual([{ club: '1234', membersWithAward: 1 }])
  })

  it('case and inner-whitespace variants of one member count once', () => {
    const r = parseDistrictReport(
      ID.education,
      table([
        ['1234', 'PM1Presentation Mastery Level 1', 'Pat Doe'],
        ['1234', 'PM2Presentation Mastery Level 2', 'PAT   doe, PM2'],
        ['1234', 'PM3Presentation Mastery Level 3', '00012345 -  pat\u00a0Doe'],
      ])
    )
    if (r.reportType !== 'education-achievements') throw new Error('type')
    expect(r.clubMembers).toEqual([{ club: '1234', membersWithAward: 1 }])
  })

  it('`Name unavailable` rows are told apart by member number', () => {
    const r = parseDistrictReport(
      ID.education,
      table([
        [
          '1234',
          'PM1Presentation Mastery Level 1',
          '00011111 - Name unavailable',
        ],
        [
          '1234',
          'PM2Presentation Mastery Level 2',
          '00022222 - Name unavailable',
        ],
        [
          '5678',
          'PM1Presentation Mastery Level 1',
          '00033333 - Name unavailable',
        ],
        [
          '5678',
          'PM2Presentation Mastery Level 2',
          '00033333 - Name unavailable',
        ],
      ])
    )
    if (r.reportType !== 'education-achievements') throw new Error('type')
    expect(r.clubMembers).toEqual([
      { club: '1234', membersWithAward: 2 },
      { club: '5678', membersWithAward: 1 },
    ])
  })

  it('a member whose only award is not a counted award (Pathways Mentor) is not counted', () => {
    const r = parseDistrictReport(
      ID.education,
      table([
        ['1234', 'PM1Presentation Mastery Level 1', 'Pat Doe'],
        ['1234', 'PWMENTORPGMPathways Mentor Program', 'Sam Roe, PM3'],
      ])
    )
    if (r.reportType !== 'education-achievements') throw new Error('type')
    expect(r.clubMembers).toEqual([{ club: '1234', membersWithAward: 1 }])
  })

  it('a club whose rows are all non-counted awards is absent, not zero', () => {
    const r = parseDistrictReport(
      ID.education,
      table([
        ['1234', 'PM1Presentation Mastery Level 1', 'Pat Doe'],
        ['5678', 'PWMENTORPGMPathways Mentor Program', 'Sam Roe'],
      ])
    )
    if (r.reportType !== 'education-achievements') throw new Error('type')
    expect(r.clubMembers).toEqual([{ club: '1234', membersWithAward: 1 }])
  })

  it('never emits a Member value — only club + count', () => {
    const r = parseDistrictReport(
      ID.education,
      table([['1234', 'PM1', 'Pat Doe']])
    )
    expect(JSON.stringify(r)).not.toContain('Pat Doe')
  })
})

// #1599 — the pure identity rule behind the distinct-member count.
describe('memberIdentityKey', () => {
  it.each([
    ['Pat Doe', 'pat doe'],
    ['Pat Doe, PM5', 'pat doe'],
    ['Pat Doe, DTM', 'pat doe'],
    ['00012345 - Pat Doe', 'pat doe'],
    ['00012345-Pat Doe, PM5', 'pat doe'],
    ['  PAT \t  doe  ', 'pat doe'],
    ['Pat\u00a0Doe', 'pat doe'], // NFKC folds the no-break space
    ['\uff30at Doe', 'pat doe'], // NFKC folds a fullwidth letter
  ])('%j ⇒ %j', (raw, key) => {
    expect(memberIdentityKey(raw)).toBe(key)
  })

  it('falls back to the member number when the name is unavailable or empty', () => {
    expect(memberIdentityKey('00011111 - Name unavailable')).toBe('id:00011111')
    expect(memberIdentityKey('00011111 - NAME  UNAVAILABLE')).toBe(
      'id:00011111'
    )
    expect(memberIdentityKey('00011111 - ')).toBe('id:00011111')
  })

  it('returns null when there is neither a name nor a number', () => {
    expect(memberIdentityKey('')).toBeNull()
    expect(memberIdentityKey('   ')).toBeNull()
    expect(memberIdentityKey('Name unavailable')).toBeNull()
    expect(memberIdentityKey(', PM5')).toBeNull()
  })
})

// #1592 security review — a table that HAS rows but lacks the Club or Member
// header must yield "not available" (undefined), never [] (which would read as
// "every club has 0 members"). One stderr line names only the missing header.
describe('parseDistrictReport — Education Achievements missing header ⇒ clubMembers unavailable', () => {
  let errorSpy: MockInstance<typeof console.error>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  const withoutColumn = (drop: 'Member' | 'Club' | 'Award') => {
    const headers = [
      'Club',
      'Division',
      'Area',
      'Award',
      'Date',
      'Member',
      'Name',
      'Location',
    ]
    const cells = [
      '1234',
      'A',
      '1',
      'PM1',
      '7/15/2026',
      'Pat Doe',
      'Club 1234',
      'Town',
    ]
    const keep = headers.map(h => h !== drop)
    const th = headers.filter((_, i) => keep[i]).map(h => `<th>${h}</th>`)
    const td = cells.filter((_, i) => keep[i]).map(c => `<td>${c}</td>`)
    return `<table><tr>${th.join('')}</tr><tr>${td.join('')}</tr></table>`
  }

  // Award is required too since #1599: only counted awards are counted.
  it.each(['Member', 'Club', 'Award'] as const)(
    'rows present but no %s header ⇒ clubMembers undefined + one stderr line naming only that header',
    missing => {
      const r = parseDistrictReport(ID.education, withoutColumn(missing))
      if (r.reportType !== 'education-achievements') throw new Error('type')
      expect(r.clubMembers).toBeUndefined()
      expect(errorSpy).toHaveBeenCalledTimes(1)
      const msg = String(errorSpy.mock.calls[0]?.[0])
      expect(msg).toContain(missing)
      // Never a cell value in the log.
      for (const cell of ['Pat Doe', '1234', 'PM1', 'Club 1234', 'Town']) {
        expect(msg).not.toContain(cell)
      }
    }
  )

  it.each([
    ['an empty body', ''],
    ['a header-less empty table', '<table></table>'],
  ])(
    '%s (no rows) ⇒ clubMembers [] (nothing to count, not a missing header) and no stderr',
    (_label, html) => {
      const r = parseDistrictReport(ID.education, html)
      if (r.reportType !== 'education-achievements') throw new Error('type')
      expect(r.clubMembers).toEqual([])
      expect(errorSpy).not.toHaveBeenCalled()
    }
  )
})

describe('parseDistrictReport — triple crown collapses to non-personal cols', () => {
  it('keeps only Count + Award (no club, no member)', () => {
    const r = parseDistrictReport(
      ID.tripleCrown,
      readFixture('triple-crown.html')
    )
    expect(r.reportType).toBe('triple-crown')
    expect(r.rows.length).toBeGreaterThan(0)
    expect(Object.keys(r.rows[0]).sort()).toEqual(['award', 'count'].sort())
    expect(Object.keys(r.rows[0])).not.toContain('member')
  })
})

describe('parseDistrictReport — Education Achievement Archive (prior-PY backfill, #1146)', () => {
  it('parses a populated prior-PY archive into de-identified per-(club, award) counts', () => {
    const r = parseDistrictReport(
      ID.archive,
      readFixture('education-archive-2024-2025.html')
    )
    expect(r.reportType).toBe('education-archive')
    // Lesson 153 pinning: 40 raw achievement rows collapse to 32 distinct
    // (club, award) groups, and the counts sum back to the raw total — this
    // catches both a failed collapse (every count stuck at 1) and silent loss.
    expect(r.rows).toHaveLength(32)
    expect(r.rows.reduce((s, row) => s + row.achievementCount, 0)).toBe(40)
    // Same de-identified record shape as the daily educationAchievements
    // section. The per-row Date is dropped before aggregation (Lesson 153) and
    // the live archive has no Member column at all (verified 2026-06-12).
    expect(Object.keys(r.rows[0]).sort()).toEqual(
      [
        'achievementCount',
        'area',
        'award',
        'club',
        'division',
        'location',
        'name',
      ].sort()
    )
  })

  // The live archive emits NO Member column (verified across PYs 2019-2020 …
  // 2024-2025). Defensive guard: if TI ever adds one, the KEEP-only projection
  // must drop it by construction — a personal value must not survive.
  it('defensively drops a Member column if the archive ever grows one', () => {
    const html = `
      <table>
        <tr><th>Club</th><th>Division</th><th>Area</th><th>Award</th><th>Date</th><th>Member</th><th>Name</th><th>Location</th></tr>
        <tr><td>1234</td><td>A</td><td>1</td><td>PM1</td><td>7/15/2024</td><td>Injected Person, DTM</td><td>Club X</td><td>Town</td></tr>
        <tr><td>1234</td><td>A</td><td>1</td><td>PM1</td><td>8/20/2024</td><td>Other Person, EC3</td><td>Club X</td><td>Town</td></tr>
      </table>`
    const r = parseDistrictReport(ID.archive, html)
    expect(r.reportType).toBe('education-archive')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({
      club: '1234',
      award: 'PM1',
      achievementCount: 2,
    })
    const blob = flattenValues(r)
    expect(blob).not.toContain('Injected Person')
    expect(blob).not.toContain('Other Person')
    // Date is dropped pre-aggregation (it varies per row — keeping it would
    // shatter every group to count 1 and defeat the de-identification, L153).
    expect(blob).not.toContain('7/15/2024')
  })
})

describe('parseDistrictReport — edge cases', () => {
  it('tolerates the empty-body archive report (no <table>) without throwing', () => {
    const r = parseDistrictReport(
      ID.archive,
      readFixture('education-archive-empty.html')
    )
    expect(r.reportType).toBe('education-archive')
    expect(r.rows).toEqual([])
  })

  it('throws on an unknown tableId', () => {
    expect(() =>
      parseDistrictReport('not-a-real-guid', '<table></table>')
    ).toThrow(/unknown/i)
  })
})
