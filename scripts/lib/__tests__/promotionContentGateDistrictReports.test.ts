/**
 * The content gate reads the daily-reports sidecars (#1767, ADR-015 step 9,
 * D-16): `snapshots/<date>/district_<id>_reports.json`.
 *
 * Until #1767 they reached prod through a mirror step after the gate had run,
 * so they were never content-checked; and as plain `json` the gate would only
 * have parsed them. They are now a kind of their own, checked like the
 * frontend reads them (fetchCdnDistrictReports drops a file that fails
 * DistrictReportsDatasetSchema, silently): the schema, the district its path
 * names, the program year of its logical date, and no link, email or
 * meeting credential in a place-text field (#2097).
 *
 * The fixture is a real prod sidecar (D61, 2026-10-20), each section cut to
 * its first two records: recorded, not invented.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  checkObject,
  classifyObject,
  planContentChecks,
  planManifestChecks,
  type CheckContext,
  type StoredObject,
} from '../promotionContentGate.js'

const FIXTURE = path.join(
  process.cwd(),
  'scripts/lib/__tests__/fixtures/district-reports/district_61_reports.json'
)
const recorded = (): Record<string, unknown> =>
  JSON.parse(readFileSync(FIXTURE, 'utf-8')) as Record<string, unknown>

const PATH = 'snapshots/2026-10-20/district_61_reports.json'
const ctx: CheckContext = {
  latestSnapshotDate: null,
  availableDates: [],
  clubHistoryShards: { staging: [], prod: [] },
}
const stored = (value: unknown): StoredObject => ({
  bytes: gzipSync(Buffer.from(JSON.stringify(value))),
  contentEncoding: 'gzip',
})
const check = (value: unknown, p = PATH) =>
  checkObject({ path: p, kind: 'district-reports' }, stored(value), null, ctx)

describe('classifyObject — daily-reports sidecars (#1767)', () => {
  it('a sidecar under its date is district-reports', () => {
    expect(classifyObject(PATH)).toBe('district-reports')
    expect(classifyObject('snapshots/2026-06-30/district_F_reports.json')).toBe(
      'district-reports'
    )
  })

  it('the district snapshot and the reports rollup keep their kinds', () => {
    expect(classifyObject('snapshots/2026-10-20/district_61.json')).toBe('json')
    expect(classifyObject('snapshots/2026-10-20/reports-rollups.json')).toBe(
      'reports-rollups'
    )
  })
})

describe('checkObject — district-reports (#1767)', () => {
  it('passes the recorded prod sidecar', () => {
    expect(check(recorded())).toBeNull()
  })

  it('holds a file the frontend would drop: schema failure', () => {
    const v = recorded()
    delete v.generatedAt
    expect(check(v)).toMatch(/schema validation failed/)
    const w = recorded()
    const sections = w.sections as Record<string, { records: unknown[] }>
    sections.officerList!.records = [{ club: '123' }]
    expect(check(w)).toMatch(/schema validation failed/)
  })

  it('holds a sidecar served under another district', () => {
    expect(
      check(recorded(), 'snapshots/2026-10-20/district_F_reports.json')
    ).toMatch(/districtId is "61", but its path names district F/)
  })

  it('holds a program year that is not its logical date’s', () => {
    const v = { ...recorded(), programYear: '2025-2026' }
    expect(check(v)).toMatch(/programYear is "2025-2026".*2026-2027/)
  })

  it('a June close collected in July is its June date’s program year', () => {
    const v = { ...recorded(), programYear: '2025-2026' }
    expect(check(v, 'snapshots/2026-06-30/district_61_reports.json')).toBeNull()
  })

  it('holds a link or email in a place-text field (#2097)', () => {
    const v = recorded()
    const sections = v.sections as Record<
      string,
      { records: Array<Record<string, unknown>> }
    >
    sections.aprilDuesRenewal!.records[0]!.location =
      'Join us at https://zoom.us/j/123'
    expect(check(v)).toMatch(/place text/)
  })
})

describe('planning — sidecars are read', () => {
  it('every sidecar the run manifest lists is checked, hash and all', () => {
    const plan = planManifestChecks(
      [{ path: PATH, sha256: 'a'.repeat(64), date: '2026-10-20', stage: 's' }],
      []
    )
    expect(plan.checks).toEqual([
      { path: PATH, kind: 'district-reports', expectedSha256: 'a'.repeat(64) },
    ])
  })

  it('a changed sidecar the run did not write is in the sampled set', () => {
    const plan = planContentChecks([{ name: PATH, size: 1 }], {
      random: () => 0,
    })
    expect(plan.checks.map(c => c.kind)).toEqual(['district-reports'])
  })
})
