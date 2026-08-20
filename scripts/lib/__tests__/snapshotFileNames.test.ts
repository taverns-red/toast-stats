/**
 * Canonical district-snapshot file naming (#1428).
 *
 * `collector-cli fetch-daily-reports` writes
 * `snapshots/{date}/district_{id}_reports.json` alongside the base snapshot.
 * Four call sites each carried their own copy of "what a district file looks
 * like", and every copy matched that sidecar:
 *
 *   - scripts/lib/snapshotPublishGate.ts  /^district_(.+)\.json$/  → gate FAILS
 *   - scripts/backfill-snapshot-index.ts  district_(\w+)          → phantom id
 *   - scripts/build-divisions-areas-index.ts  startsWith          → noisy log
 *   - scripts/detect-snapshot-anomalies.ts    startsWith          → silent skip
 *
 * These tests pin the shared matcher AND the four call sites to it, so the
 * pattern (not a `_reports` special case) is what stays correct.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  districtIdFromSnapshotFileName,
  indexDistrictSnapshotObjects,
  isDistrictSnapshotFile,
  parseDistrictSnapshotObjectName,
} from '../snapshotFileNames.js'

const ROOT = process.cwd()

/** Every district id shape that actually ships. */
const REAL_DISTRICT_IDS = ['61', '1', '01', '107', 'F', 'U', '203', '231']

describe('isDistrictSnapshotFile / districtIdFromSnapshotFileName', () => {
  it('matches every real district id shape, numeric and lettered', () => {
    for (const id of REAL_DISTRICT_IDS) {
      const fileName = `district_${id}.json`
      expect(isDistrictSnapshotFile(fileName)).toBe(true)
      expect(districtIdFromSnapshotFileName(fileName)).toBe(id)
    }
  })

  it('rejects the daily-reports sidecar', () => {
    expect(isDistrictSnapshotFile('district_61_reports.json')).toBe(false)
    expect(
      districtIdFromSnapshotFileName('district_61_reports.json')
    ).toBeNull()
    expect(districtIdFromSnapshotFileName('district_F_reports.json')).toBeNull()
  })

  it('rejects ANY sidecar, not just the literal _reports one', () => {
    for (const name of [
      'district_61_foo.json',
      'district_61_reports_v2.json',
      'district_203_education.json',
      'district_61.reports.json',
    ]) {
      expect(isDistrictSnapshotFile(name)).toBe(false)
    }
  })

  it('rejects non-district files and near-misses', () => {
    for (const name of [
      'metadata.json',
      'manifest.json',
      'all-districts-rankings.json',
      'district_.json',
      'district_61.txt',
      'district_61.json.bak',
      'xdistrict_61.json',
    ]) {
      expect(isDistrictSnapshotFile(name)).toBe(false)
    }
  })
})

describe('parseDistrictSnapshotObjectName', () => {
  it('resolves a snapshot object name to its date and district', () => {
    expect(
      parseDistrictSnapshotObjectName('snapshots/2026-08-20/district_61.json')
    ).toEqual({ snapshotDate: '2026-08-20', districtId: '61' })
    expect(
      parseDistrictSnapshotObjectName('snapshots/2026-08-20/district_F.json')
    ).toEqual({ snapshotDate: '2026-08-20', districtId: 'F' })
  })

  it('returns null for sidecars, other prefixes and config objects', () => {
    for (const name of [
      'snapshots/2026-08-20/district_61_reports.json',
      'snapshots/2026-08-20/metadata.json',
      'config/district-snapshot-index.json',
      'time-series/district_61.json',
      'snapshots/2026-8-20/district_61.json',
    ]) {
      expect(parseDistrictSnapshotObjectName(name)).toBeNull()
    }
  })
})

/**
 * The issue's acceptance criterion for the index side:
 * `config/district-snapshot-index.json` must contain `61` and NOT
 * `61_reports`. The old `district_(\w+)` captured the sidecar because `\w`
 * includes `_`, publishing a phantom district the frontend then fetched.
 */
describe('indexDistrictSnapshotObjects (#1428 phantom district)', () => {
  const objects = [
    'snapshots/2026-08-19/district_61.json',
    'snapshots/2026-08-19/district_61_reports.json',
    'snapshots/2026-08-20/district_61.json',
    'snapshots/2026-08-20/district_61_reports.json',
    'snapshots/2026-08-20/district_F.json',
    'snapshots/2026-08-20/district_203.json',
    'snapshots/2026-08-20/metadata.json',
    'config/district-snapshot-index.json',
  ]

  it('indexes 61 and never the phantom 61_reports', () => {
    const { districts } = indexDistrictSnapshotObjects(objects)
    expect(Object.keys(districts).sort()).toEqual(['203', '61', 'F'])
    expect(districts['61_reports']).toBeUndefined()
    expect(Object.keys(districts).some(id => id.includes('_'))).toBe(false)
  })

  it('collects sorted dates and counts only real snapshots', () => {
    const { districts, fileCount } = indexDistrictSnapshotObjects(objects)
    expect(districts['61']).toEqual(['2026-08-19', '2026-08-20'])
    expect(districts['F']).toEqual(['2026-08-20'])
    // 61 x2, F, 203 — the two sidecars and metadata do not count.
    expect(fileCount).toBe(4)
  })
})

/**
 * Static guard across the four call sites (#1428). Each must source the
 * matcher from ./snapshotFileNames, not re-derive it — a re-introduced
 * `startsWith('district_')` or `district_(\w+)` silently resurrects the bug.
 *
 * Scoped to the four owned call sites on purpose: `data-pipeline.yml` carries
 * a fifth copy owned by a concurrent change, and
 * `scripts/validate-vs-ceo-report.ts` reads a local cache tree that never
 * holds sidecars — both are tracked separately on #1428.
 */
describe('call sites use the shared matcher', () => {
  const CALL_SITES = [
    'scripts/lib/snapshotPublishGate.ts',
    'scripts/backfill-snapshot-index.ts',
    'scripts/build-divisions-areas-index.ts',
    'scripts/detect-snapshot-anomalies.ts',
  ]

  /** Strip block + line comments so prose about the old bug doesn't trip us. */
  const codeOf = (relPath: string): string =>
    readFileSync(join(ROOT, relPath), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[^\n]*?\/\/[^\n]*$/gm, '')

  it.each(CALL_SITES)('%s imports the shared matcher', relPath => {
    expect(codeOf(relPath)).toMatch(/from '\.{1,2}\/(lib\/)?snapshotFileNames/)
  })

  it.each(CALL_SITES)('%s re-derives no district pattern', relPath => {
    const code = codeOf(relPath)
    expect(code).not.toMatch(/startsWith\(\s*'district_'/)
    expect(code).not.toMatch(/district_\(\\w\+\)/)
    expect(code).not.toMatch(/district_\(\.\+\)/)
  })
})

/**
 * End-to-end for the divisions/areas call site: run the real runner against a
 * snapshot directory holding BOTH file kinds.
 *
 * The sidecar is well-formed JSON, so the `Skipping corrupt file` log the
 * issue names only fires on a truncated write — the substantive defect is
 * that the sidecar reaches `buildDivisionsAreasIndex` at all. A
 * `DistrictReportsDataset` is a BARE payload carrying `districtId`, so the
 * builder registers it as a district with zero divisions: a sidecar for a
 * district whose base snapshot is absent (its scrape failed) publishes a
 * phantom empty district into config/divisions-areas-index.json.
 */
describe('build-divisions-areas-index.ts against a mixed snapshot dir', () => {
  let workDir = ''

  /** A DistrictReportsDataset — bare payload, `districtId`, no divisions. */
  const sidecar = (districtId: string): string =>
    JSON.stringify({
      districtId,
      programYear: '2025-2026',
      generatedAt: '2026-08-20T06:12:00.000Z',
      sections: {},
    })

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'divisions-areas-1428-'))
    cpSync(
      join(ROOT, 'scripts/lib/__tests__/fixtures/divisions-areas'),
      workDir,
      {
        recursive: true,
      }
    )
    // 61 has a base snapshot in the fixture set; 99 does not — the phantom.
    writeFileSync(join(workDir, 'district_61_reports.json'), sidecar('61'))
    writeFileSync(join(workDir, 'district_99_reports.json'), sidecar('99'))
  })

  afterAll(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true })
  })

  it('indexes only real districts — no phantom from a sidecar', () => {
    const outFile = join(workDir, 'index.json')
    const run = spawnSync(
      'npx',
      [
        'tsx',
        'scripts/build-divisions-areas-index.ts',
        '--src',
        workDir,
        '--out',
        outFile,
        '--snapshot-date',
        '2026-08-20',
      ],
      { cwd: ROOT, encoding: 'utf-8' }
    )

    expect(run.status).toBe(0)
    // The misleading log the issue names (only fires on malformed JSON).
    expect(run.stderr).not.toContain('Skipping corrupt file')
    // R4: the runner logs to stderr, stdout stays clean.
    expect(run.stdout).toBe('')

    const index = JSON.parse(readFileSync(outFile, 'utf-8')) as {
      districts: Record<string, unknown>
    }
    expect(Object.keys(index.districts).sort()).toEqual(['01', '04', '61'])
    expect(index.districts['99']).toBeUndefined()
  })
})
