/**
 * Byte parity with the retired inline generators (#1743, plan P3-3).
 *
 * Until #1743, data-pipeline.yml built v1/latest.json, v1/dates.json,
 * v1/rankings.json, v1/rank-history/*.json and
 * config/district-snapshot-index.json with `node -e "…"` scripts inside
 * double-quoted bash strings: untestable, and once already broken by a
 * backtick in a comment (#1549).
 *
 * fixtures/expected/ was produced by running those ORIGINAL blocks, cut from
 * the workflow at the pre-change commit, against fixtures/input/
 * (fixtures/generate-expected.mjs, Date frozen at FROZEN_NOW). Nothing in
 * expected/ is hand-written. The inputs are trimmed captures of live prod
 * objects (2026-10-08..10): rankings files, a `gcloud storage ls` listing
 * and the live snapshot index. Edge files (a corrupt one, one without
 * rankings, one without metadata, a duplicate row, a placeholder
 * "District 61" name) are jq edits of those captures.
 *
 * Two layers are pinned: the pure builders, and the CLIs the workflow calls,
 * run end to end with the same Date freeze.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  datesIndexJson,
  latestManifestJson,
  rankingsManifestJson,
} from '../cdnManifests'
import { buildRankHistory } from '../rankHistory'
import { mergeSnapshotIndex, snapshotIndexFromListing } from '../snapshotIndex'

const FROZEN_NOW = '2026-10-11T09:15:28.774Z'
const FIXTURES = join(__dirname, 'fixtures')
const INPUT = join(FIXTURES, 'input')
const EXPECTED = join(FIXTURES, 'expected')

const input = (name: string): string => readFileSync(join(INPUT, name), 'utf-8')
const expected = (name: string): string =>
  readFileSync(join(EXPECTED, name), 'utf-8')
/** The old block's console.log line, which the CLIs now send to stderr (R4). */
const oldLog = (dir: string): string => expected(`${dir}/stdout.txt`).trim()

describe('pure builders reproduce the inline output byte for byte', () => {
  it('v1/latest.json', () => {
    expect(latestManifestJson('2026-10-10', FROZEN_NOW)).toBe(
      expected('latest/latest.json')
    )
  })

  it('v1/dates.json', () => {
    const { json, count } = datesIndexJson(input('all-dates.txt'), FROZEN_NOW)
    expect(json).toBe(expected('dates/dates.json'))
    expect(count).toBe(4)
  })

  it('v1/rankings.json, date from metadata.sourceCsvDate', () => {
    const { json, count } = rankingsManifestJson(
      input('all-districts-rankings.json'),
      '2026-10-10',
      FROZEN_NOW
    )
    expect(json).toBe(expected('rankings/rankings.json'))
    expect(count).toBe(4)
  })

  it('v1/rankings.json, empty sourceCsvDate falls back to the latest date', () => {
    const { json } = rankingsManifestJson(
      input('all-districts-rankings.no-source-date.json'),
      '2026-10-10',
      FROZEN_NOW
    )
    expect(json).toBe(expected('rankings-no-source-date/rankings.json'))
  })

  it('v1/rank-history/{id}.json, including skipped and degenerate files', () => {
    const srcDir = join(INPUT, 'rank-history-src')
    const skipped: string[] = []
    const result = buildRankHistory(
      readdirSync(srcDir).map(name => ({
        name,
        read: () => readFileSync(join(srcDir, name), 'utf-8'),
      })),
      msg => skipped.push(msg)
    )
    const wanted = readdirSync(join(EXPECTED, 'rank-history'))
      .filter(f => f.endsWith('.json'))
      .sort()
    expect(result.entries.map(e => `${e.districtId}.json`).sort()).toEqual(
      wanted
    )
    for (const e of result.entries) {
      expect(e.json).toBe(expected(`rank-history/${e.districtId}.json`))
    }
    expect(result.summary).toBe(oldLog('rank-history'))
    // The corrupt file and the metadata-less file are skipped, not fatal.
    expect(skipped.map(s => s.split(':')[0]).sort()).toEqual([
      'Skipping 2026-10-05.json',
      'Skipping 2026-10-07.json',
    ])
  })

  it('config/district-snapshot-index.json regenerated from the listing', () => {
    const { json, summary } = snapshotIndexFromListing(
      input('snapshot-files.txt'),
      FROZEN_NOW
    )
    expect(json).toBe(
      expected('snapshot-index-from-listing/district-snapshot-index.json')
    )
    expect(summary).toBe(oldLog('snapshot-index-from-listing'))
  })

  it.each([
    ['snapshot-index-merge', 'district-snapshot-index.json'],
    [
      'snapshot-index-merge-legacy-flat',
      'district-snapshot-index.legacy-flat.json',
    ],
  ])(
    'config/district-snapshot-index.json daily merge (%s)',
    (dir, existing) => {
      const { json, summary } = mergeSnapshotIndex(
        input(existing),
        '2026-10-11',
        '60, 61,F,U',
        FROZEN_NOW
      )
      expect(json).toBe(expected(`${dir}/district-snapshot-index.json`))
      expect(summary).toBe(oldLog(dir))
    }
  )
})

describe('the CLIs the workflow calls write the same bytes', () => {
  let dir: string
  let freeze: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'p33-cli-'))
    freeze = join(dir, 'freeze.cjs')
    writeFileSync(
      freeze,
      `const Real = Date
const NOW = Real.parse(${JSON.stringify(FROZEN_NOW)})
class Frozen extends Real {
  constructor(...a) { if (a.length) super(...a); else super(NOW) }
  static now() { return NOW }
}
globalThis.Date = Frozen
`
    )
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const run = (script: string, args: string[]) =>
    spawnSync('npx', ['tsx', resolve(__dirname, '..', script), ...args], {
      encoding: 'utf-8',
      cwd: process.cwd(),
      env: { ...process.env, NODE_OPTIONS: `--require ${freeze}` },
    })

  it('build-cdn-manifests.ts writes all four manifests in one start-up', () => {
    const out = join(dir, 'cdn')
    const rhOut = join(out, 'rank-history')
    cpSync(join(INPUT, 'rank-history-src'), join(dir, 'rh-src'), {
      recursive: true,
    })
    const r = run('build-cdn-manifests.ts', [
      '--latest-date',
      '2026-10-10',
      '--latest-out',
      join(out, 'latest.json'),
      '--dates-file',
      join(INPUT, 'all-dates.txt'),
      '--dates-out',
      join(out, 'dates.json'),
      '--rankings-src',
      join(INPUT, 'all-districts-rankings.json'),
      '--rankings-out',
      join(out, 'rankings.json'),
      '--rank-history-src',
      join(dir, 'rh-src'),
      '--rank-history-out',
      rhOut,
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe('')
    expect(readFileSync(join(out, 'latest.json'), 'utf-8')).toBe(
      expected('latest/latest.json')
    )
    expect(readFileSync(join(out, 'dates.json'), 'utf-8')).toBe(
      expected('dates/dates.json')
    )
    expect(readFileSync(join(out, 'rankings.json'), 'utf-8')).toBe(
      expected('rankings/rankings.json')
    )
    const written = readdirSync(rhOut).sort()
    expect(written).toEqual(
      readdirSync(join(EXPECTED, 'rank-history'))
        .filter(f => f.endsWith('.json'))
        .sort()
    )
    for (const f of written) {
      expect(readFileSync(join(rhOut, f), 'utf-8')).toBe(
        expected(`rank-history/${f}`)
      )
    }
    for (const d of ['latest', 'dates', 'rankings', 'rank-history']) {
      expect(r.stderr).toContain(oldLog(d))
    }
  })

  it('build-cdn-manifests.ts skips rankings and rank-history when not asked', () => {
    const out = join(dir, 'cdn-min')
    const r = run('build-cdn-manifests.ts', [
      '--latest-date',
      '2026-10-10',
      '--latest-out',
      join(out, 'latest.json'),
      '--dates-file',
      join(INPUT, 'all-dates.txt'),
      '--dates-out',
      join(out, 'dates.json'),
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(readdirSync(out).sort()).toEqual(['dates.json', 'latest.json'])
  })

  it('build-cdn-manifests.ts fails when the rankings source is unreadable', () => {
    const out = join(dir, 'cdn-bad')
    const bad = join(dir, 'bad-rankings.json')
    writeFileSync(bad, '{"rankings":')
    const r = run('build-cdn-manifests.ts', [
      '--latest-date',
      '2026-10-10',
      '--latest-out',
      join(out, 'latest.json'),
      '--dates-file',
      join(INPUT, 'all-dates.txt'),
      '--dates-out',
      join(out, 'dates.json'),
      '--rankings-src',
      bad,
      '--rankings-out',
      join(out, 'rankings.json'),
    ])
    expect(r.status).not.toBe(0)
  })

  it('build-snapshot-index.ts --from-listing', () => {
    const out = join(dir, 'idx-listing.json')
    const r = run('build-snapshot-index.ts', [
      '--from-listing',
      join(INPUT, 'snapshot-files.txt'),
      '--out',
      out,
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe('')
    expect(readFileSync(out, 'utf-8')).toBe(
      expected('snapshot-index-from-listing/district-snapshot-index.json')
    )
    expect(r.stderr).toContain(oldLog('snapshot-index-from-listing'))
  })

  it('build-snapshot-index.ts --merge rewrites the index in place', () => {
    const idx = join(dir, 'idx-merge.json')
    cpSync(join(INPUT, 'district-snapshot-index.json'), idx)
    const r = run('build-snapshot-index.ts', [
      '--merge',
      idx,
      '--date',
      '2026-10-11',
      '--districts',
      '60, 61,F,U',
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(readFileSync(idx, 'utf-8')).toBe(
      expected('snapshot-index-merge/district-snapshot-index.json')
    )
    expect(r.stderr).toContain(oldLog('snapshot-index-merge'))
  })
})
