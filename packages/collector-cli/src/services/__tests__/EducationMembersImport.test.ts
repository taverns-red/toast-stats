import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DistrictReportsDatasetSchema,
  type DistrictReportsDataset,
} from '@taverns-red/shared-contracts'

import {
  formatReportAsOf,
  importEducationMembers,
  parseEducationExportCsv,
} from '../EducationMembersImport'

/**
 * #1603 — one-off import of a prior PY's distinct members per club from a TI
 * Education Achievements CSV export (the Archive has no Member column).
 * Every member value below is SYNTHETIC.
 */

const HEADER = 'Club,Division,Area,Award,Date,Member,Name,Location'
const TITLE = 'Education Achievements - District 61,,,,,,,'

// Synthetic member names — asserted absent from every output.
const ALICE = 'Zyxalice Qwertyson'
const BOB = 'Vbnbob Plokinsky'
const CARL = 'Mnbcarl Trewqvist'

const csvRow = (
  club: string,
  award: string,
  date: string,
  member: string
): string =>
  [club, 'A', 'A1', award, date, `"${member}"`, `Club ${club}`, 'Ottawa'].join(
    ','
  )

const SAMPLE_ROWS = [
  // Club 111: ALICE twice (designation variant) + BOB → 2 distinct
  csvRow('111', 'PM1Level 1 Completion', '07/15/2025', ALICE),
  csvRow('111', 'PM2Level 2 Completion', '09/01/2025', `${ALICE}, PM1`),
  csvRow('111', 'DL1Level 1 Completion', '06/30/2026', BOB),
  // Club 222: CARL counted; a non-counted award for BOB → 1
  csvRow('222', 'DTMDistinguished Toastmaster', '07/01/2025', CARL),
  csvRow('222', 'PWMENTORPGMPathways Mentor Program', '01/10/2026', BOB),
  // Club 333: only non-counted awards → absent, not zero
  csvRow('333', 'PWMENTORPGMPathways Mentor Program', '02/02/2026', ALICE),
]

const sampleCsv = (rows: string[] = SAMPLE_ROWS, title = TITLE): string =>
  ['﻿' + title, HEADER, ...rows].join('\r\n') + '\r\n'

const existingDataset = (): DistrictReportsDataset => ({
  districtId: '61',
  programYear: '2025-2026',
  generatedAt: '2026-10-01T00:00:00.000Z',
  sections: {
    educationAchievements: {
      sources: [
        {
          reportType: 'education-archive',
          tableId: 'a30b93f3-081e-42c8-9a36-137acb24be69',
          asOf: '',
        },
      ],
      records: [
        {
          club: '111',
          division: 'A',
          area: 'A1',
          name: 'Club 111',
          location: 'Ottawa',
          award: 'PM1Level 1 Completion',
          achievementCount: 3,
        },
      ],
    },
    tripleCrown: { sources: [], summary: { achieverCount: 2 } },
  },
})

describe('parseEducationExportCsv', () => {
  it('skips a leading title row (and BOM) and finds the header row', () => {
    const table = parseEducationExportCsv(sampleCsv())
    expect(table.headers).toEqual(HEADER.split(','))
    expect(table.rows).toHaveLength(SAMPLE_ROWS.length)
    expect(table.rows[0]?.[0]).toBe('111')
  })

  it('accepts a file with no title row', () => {
    const text = [HEADER, ...SAMPLE_ROWS].join('\n')
    expect(parseEducationExportCsv(text).rows).toHaveLength(SAMPLE_ROWS.length)
  })

  it('fails naming only the missing required header', () => {
    const text = sampleCsv().replace('Member,', 'Person,')
    expect(() => parseEducationExportCsv(text)).toThrow(/"Member"/)
    try {
      parseEducationExportCsv(text)
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).not.toContain(ALICE)
      expect(msg).not.toMatch(/"Club"|"Award"/)
    }
  })

  it('fails when no header row exists at all', () => {
    expect(() => parseEducationExportCsv('just,a,title\n1,2,3\n')).toThrow(
      /header/i
    )
  })
})

describe('formatReportAsOf', () => {
  it('renders an ISO date in the TI "Updated:" format used by other sources', () => {
    expect(formatReportAsOf('2026-07-01')).toBe('July 01, 2026')
  })

  it('rejects a non-ISO / impossible date', () => {
    expect(() => formatReportAsOf('07/01/2026')).toThrow()
    expect(() => formatReportAsOf('2026-02-31')).toThrow()
  })
})

describe('importEducationMembers', () => {
  let cacheDir: string
  let reportsPath: string

  const seed = async (dataset: unknown = existingDataset()) => {
    const dir = join(cacheDir, 'snapshots', '2026-06-30')
    await mkdir(dir, { recursive: true })
    await writeFile(reportsPath, JSON.stringify(dataset, null, 2), 'utf-8')
  }

  const run = (
    overrides: Partial<Parameters<typeof importEducationMembers>[0]> = {}
  ) =>
    importEducationMembers({
      cacheDir,
      districtId: '61',
      programYear: '2025-2026',
      csvText: sampleCsv(),
      asOf: '2026-07-01',
      ...overrides,
    })

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'edu-members-'))
    reportsPath = join(
      cacheDir,
      'snapshots',
      '2026-06-30',
      'district_61_reports.json'
    )
  })

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true })
  })

  it('writes per-club distinct counted members with the daily rules', async () => {
    await seed()
    const result = await run()

    const written = DistrictReportsDatasetSchema.parse(
      JSON.parse(await readFile(reportsPath, 'utf-8'))
    )
    expect(written.sections.educationMembers).toEqual({
      sources: [
        {
          reportType: 'education-achievements',
          tableId: 'c757d313-f815-4b22-93dc-b839d04cec7b',
          asOf: 'July 01, 2026',
        },
      ],
      records: [
        { club: '111', membersWithAward: 2 },
        { club: '222', membersWithAward: 1 },
      ],
    })
    expect(result).toMatchObject({
      districtId: '61',
      programYear: '2025-2026',
      snapshotDate: '2026-06-30',
      rowsRead: 6,
      rowsCounted: 4,
      clubs: 2,
      membersWithAward: 3,
    })
  })

  it('leaves every other section and top-level field untouched', async () => {
    await seed()
    await run()
    const written = JSON.parse(await readFile(reportsPath, 'utf-8'))
    const { educationMembers: _added, ...otherSections } = written.sections
    const before = existingDataset()
    expect(otherSections).toEqual(before.sections)
    expect({ ...written, sections: undefined }).toEqual({
      ...before,
      sections: undefined,
    })
  })

  it('is idempotent — a re-run replaces the section, byte-identical', async () => {
    await seed()
    await run()
    const first = await readFile(reportsPath, 'utf-8')
    await run()
    expect(await readFile(reportsPath, 'utf-8')).toBe(first)
  })

  it('fails when a row Date falls outside the program year', async () => {
    await seed()
    const before = await readFile(reportsPath, 'utf-8')
    const rows = [
      ...SAMPLE_ROWS,
      csvRow('111', 'PM1Level 1', '07/01/2026', BOB),
    ]
    await expect(run({ csvText: sampleCsv(rows) })).rejects.toThrow(
      /outside program year 2025-2026/
    )
    expect(await readFile(reportsPath, 'utf-8')).toBe(before)
  })

  it('fails on an unparseable Date', async () => {
    await seed()
    const rows = [...SAMPLE_ROWS, csvRow('111', 'PM1Level 1', '', BOB)]
    await expect(run({ csvText: sampleCsv(rows) })).rejects.toThrow(/Date/)
  })

  it('fails when the title names a different district', async () => {
    await seed()
    await expect(
      run({
        csvText: sampleCsv(SAMPLE_ROWS, 'Education Achievements - District 42'),
      })
    ).rejects.toThrow(/district 42/i)
  })

  it('fails when a District column disagrees', async () => {
    await seed()
    const text = [
      'District,' + HEADER,
      ...SAMPLE_ROWS.map(r => '42,' + r),
    ].join('\n')
    await expect(run({ csvText: text })).rejects.toThrow(/district/i)
  })

  it('fails (and creates nothing) when the PY-end reports file is missing', async () => {
    await expect(run()).rejects.toThrow(/not found/i)
    await expect(readFile(reportsPath, 'utf-8')).rejects.toThrow()
  })

  it('fails when the existing file carries another program year', async () => {
    await seed({ ...existingDataset(), programYear: '2024-2025' })
    await expect(run()).rejects.toThrow(/program year/i)
  })

  it('rejects an invalid district id before touching the filesystem', async () => {
    await expect(run({ districtId: '../61' })).rejects.toThrow()
  })

  it('never writes or returns a member value (privacy)', async () => {
    await seed()
    const result = await run()
    const bytes = await readFile(reportsPath, 'utf-8')
    const summary = JSON.stringify(result)
    for (const name of [ALICE, BOB, CARL, 'zyxalice', 'vbnbob', 'mnbcarl']) {
      expect(bytes.toLowerCase()).not.toContain(name.toLowerCase())
      expect(summary.toLowerCase()).not.toContain(name.toLowerCase())
    }
  })
})
