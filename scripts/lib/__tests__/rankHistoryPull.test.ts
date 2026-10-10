/**
 * Rank-history pull (#1733, plan E2-3).
 *
 * The old `Generate CDN manifests` loop ran one `gcloud storage cp` per date
 * (~206 in sequence, ~4 min) and swallowed every failure with `|| true`, so
 * a failed download silently dropped a date from every district's history.
 * The replacement is one listing plus one bounded-concurrency download.
 *
 * The equivalence test runs BOTH against the same fixture bucket — the old
 * loop through the gcloud shim with the 588 pin's download semantics (one
 * gzip layer inflated), the new pull through a fake of the
 * `@google-cloud/storage` 8.2.0 surface it uses — and then runs the
 * workflow's own rank-history builder (extracted from data-pipeline.yml, not
 * copied) over each. The `v1/rank-history/*.json` outputs must be identical.
 *
 * Fake SDK shapes, observed read-only against staging on 2026-10-10:
 *  - `getFiles({ prefix, matchGlob })` resolved to a 3-tuple whose first
 *    element held 206 File objects carrying `.name`;
 *  - `file(name).download({ destination })` wrote the decompressed JSON,
 *    byte-identical (`cmp`) to `gcloud storage cp` of the same
 *    Content-Encoding: gzip object.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import {
  RANKINGS_MATCH_GLOB,
  pullRankHistory,
  rankingsDate,
  type RankHistoryBucket,
} from '../rankHistoryPull.js'

const REPO = process.cwd()
const WORKFLOW = path.join(REPO, '.github/workflows/data-pipeline.yml')
const SHIM_DIR = path.join(REPO, 'scripts/lib/__tests__/fixtures/gcloud-shim')
const BUCKET = 'test-bucket'

/**
 * The loop this change removes, as it stood on main at d2985d3d. One edit:
 * `grep -oP '\d{4}-…'` → `grep -oE '[0-9]{4}-…'` (same match for ASCII
 * digits), because macOS grep has no -P.
 */
const LEGACY_PULL = `
set -uo pipefail
mkdir -p "\${SRC}"
gcloud storage ls "gs://\${GCS_BUCKET}/snapshots/*/all-districts-rankings.json" \\
  2>/dev/null | while IFS= read -r gcs_path; do
  DATE_DIR=$(echo "\${gcs_path}" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')
  if [ -n "\${DATE_DIR}" ]; then
    gcloud storage cp "\${gcs_path}" \\
      "\${SRC}/\${DATE_DIR}.json" 2>/dev/null || true
  fi
done
`

let tmp: string
let root: string

function putObject(objectPath: string, content: Buffer, gzip = false): void {
  const obj = path.join(root, BUCKET, objectPath)
  fs.mkdirSync(path.dirname(obj), { recursive: true })
  fs.writeFileSync(obj, gzip ? zlib.gzipSync(content) : content)
  const meta = path.join(root, '.meta', BUCKET, objectPath)
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  fs.writeFileSync(meta, gzip ? 'content-encoding=gzip\n' : '')
}

function rankings(date: string, offset: number): Buffer {
  const rows = ['61', '42', 'F'].map((id, i) => ({
    districtId: id,
    districtName: i === 1 && offset === 0 ? `District ${id}` : `D${id} Name`,
    aggregateScore: 100 - i * 10 + offset,
    clubsRank: i + 1,
    paymentsRank: ((i + offset) % 3) + 1,
    distinguishedRank: 3 - i,
    ...(i === 2 ? {} : { overallRank: i + 1 }),
  }))
  return Buffer.from(
    JSON.stringify(
      {
        metadata: {
          snapshotId: date,
          sourceCsvDate: date,
          totalDistricts: rows.length,
        },
        rankings: rows,
      },
      null,
      2
    )
  )
}

/** Every regular file under `dir`, relative path → bytes. */
function tree(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!e.isFile()) continue
    const abs = path.join(e.parentPath, e.name)
    out.set(path.relative(dir, abs), fs.readFileSync(abs))
  }
  return new Map([...out.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

/** The fake `@google-cloud/storage` bucket, reading the shim's tree. */
function fakeBucket(
  opts: {
    failDownload?: string
    failList?: boolean
    silentDownload?: boolean
    queries?: Record<string, unknown>[]
  } = {}
): RankHistoryBucket {
  const base = path.join(root, BUCKET)
  return {
    async getFiles(query) {
      opts.queries?.push(query)
      if (opts.failList) throw new Error('HTTP 503: Service Unavailable')
      // matchGlob `*` does not cross `/`.
      const re = new RegExp(
        '^' +
          String(query.matchGlob)
            .split('*')
            .map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
            .join('[^/]*') +
          '$'
      )
      const names = [...tree(base).keys()].filter(n => re.test(n))
      return [names.map(name => ({ name })), null, {}]
    },
    file(name) {
      return {
        async download({ destination }) {
          if (opts.failDownload && name.includes(opts.failDownload)) {
            throw new Error(`HTTP 503 downloading ${name}`)
          }
          if (opts.silentDownload) return [Buffer.alloc(0)]
          const bytes = fs.readFileSync(path.join(base, name))
          const meta = fs.readFileSync(
            path.join(root, '.meta', BUCKET, name),
            'utf-8'
          )
          // SDK default decompress: true inflates one Content-Encoding layer.
          const body = meta.includes('content-encoding=gzip')
            ? zlib.gunzipSync(bytes)
            : bytes
          fs.writeFileSync(destination, body)
          return [Buffer.alloc(0)]
        },
      }
    },
  }
}

/** The workflow's rank-history builder, extracted verbatim from the YAML. */
function workflowBuilder(srcDir: string, outDir: string): string {
  const lines = fs.readFileSync(WORKFLOW, 'utf-8').split('\n')
  const at = lines.findIndex(l =>
    l.includes("const srcDir = '/tmp/rank-history-src';")
  )
  expect(at, 'rank-history builder not found in data-pipeline.yml').toBe(
    lines.findLastIndex(l =>
      l.includes("const srcDir = '/tmp/rank-history-src';")
    )
  )
  expect(at).toBeGreaterThan(0)
  let start = at
  while (start > 0 && lines[start]!.trim() !== 'node -e "') start--
  let end = at
  while (end < lines.length && lines[end]!.trim() !== '"') end++
  return lines
    .slice(start + 1, end)
    .join('\n')
    .replace("'/tmp/rank-history-src'", JSON.stringify(srcDir))
    .replace("'/tmp/rank-history-out'", JSON.stringify(outDir))
}

function build(srcDir: string, outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true })
  const r = spawnSync('node', ['-e', workflowBuilder(srcDir, outDir)], {
    encoding: 'utf-8',
  })
  expect(r.status, r.stderr).toBe(0)
}

function runLegacy(src: string): void {
  const r = spawnSync('bash', ['-c', LEGACY_PULL], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${SHIM_DIR}:${process.env.PATH}`,
      SHIM_ROOT: root,
      SHIM_DOWNLOAD_DECOMPRESS: '1',
      GCS_BUCKET: BUCKET,
      SRC: src,
    },
  })
  expect(r.status, r.stderr).toBe(0)
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rank-history-'))
  root = path.join(tmp, 'gcs')
  fs.mkdirSync(path.join(root, BUCKET), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('rankingsDate', () => {
  it('maps a dated rankings object to its snapshot date', () => {
    expect(
      rankingsDate('snapshots/2026-10-09/all-districts-rankings.json')
    ).toBe('2026-10-09')
  })

  it('rejects anything that is not snapshots/{date}/all-districts-rankings.json', () => {
    for (const name of [
      'snapshots/latest/all-districts-rankings.json',
      'snapshots/2026-10-09/district_61.json',
      'snapshots/2026-10-09/x/all-districts-rankings.json',
      'other/2026-10-09/all-districts-rankings.json',
    ]) {
      expect(rankingsDate(name), name).toBeNull()
    }
  })
})

describe('pullRankHistory vs the legacy per-date cp loop (#1733)', () => {
  it('produces byte-identical source files and v1/rank-history output', async () => {
    putObject(
      'snapshots/2026-07-01/all-districts-rankings.json',
      rankings('2026-07-01', 0),
      true
    )
    putObject(
      'snapshots/2026-07-02/all-districts-rankings.json',
      rankings('2026-07-02', 1)
    )
    putObject(
      'snapshots/2026-07-03/all-districts-rankings.json',
      rankings('2026-07-03', 2),
      true
    )
    // Corrupt: the builder skips it — in both paths.
    putObject(
      'snapshots/2026-07-04/all-districts-rankings.json',
      Buffer.from('<html>error</html>')
    )
    // Neither path may pick these up.
    putObject(
      'snapshots/latest/all-districts-rankings.json',
      rankings('2026-07-09', 9)
    )
    putObject('snapshots/2026-07-01/district_61.json', Buffer.from('{}'), true)
    putObject(
      'snapshots/2026-07-02/nested/all-districts-rankings.json',
      rankings('2026-07-08', 8)
    )

    const oldSrc = path.join(tmp, 'old-src')
    const newSrc = path.join(tmp, 'new-src')
    runLegacy(oldSrc)
    const result = await pullRankHistory(fakeBucket(), newSrc)

    const oldFiles = tree(oldSrc)
    expect([...oldFiles.keys()]).toEqual([
      '2026-07-01.json',
      '2026-07-02.json',
      '2026-07-03.json',
      '2026-07-04.json',
    ])
    expect(tree(newSrc)).toEqual(oldFiles)
    expect(result).toEqual({ downloaded: 4 })

    const oldOut = path.join(tmp, 'old-out')
    const newOut = path.join(tmp, 'new-out')
    build(oldSrc, oldOut)
    build(newSrc, newOut)
    const outFiles = tree(oldOut)
    expect([...outFiles.keys()]).toEqual(['42.json', '61.json', 'F.json'])
    expect(tree(newOut)).toEqual(outFiles)
    // Three good dates landed in every district's history.
    const d61 = JSON.parse(outFiles.get('61.json')!.toString('utf-8'))
    expect(d61.history.map((p: { date: string }) => p.date)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ])
  })

  it('lists once, scoped to the rankings objects', async () => {
    putObject(
      'snapshots/2026-07-01/all-districts-rankings.json',
      rankings('2026-07-01', 0)
    )
    const queries: Record<string, unknown>[] = []
    await pullRankHistory(fakeBucket({ queries }), path.join(tmp, 'src'))
    expect(queries).toEqual([
      { prefix: 'snapshots/', matchGlob: RANKINGS_MATCH_GLOB },
    ])
  })
})

describe('pullRankHistory fails closed (#1733)', () => {
  beforeEach(() => {
    for (let d = 1; d <= 20; d++) {
      const date = `2026-07-${String(d).padStart(2, '0')}`
      putObject(
        `snapshots/${date}/all-districts-rankings.json`,
        rankings(date, d),
        d % 2 === 0
      )
    }
  })

  it('rejects when one download fails (the legacy loop swallowed it with `|| true`)', async () => {
    await expect(
      pullRankHistory(
        fakeBucket({ failDownload: '2026-07-13' }),
        path.join(tmp, 'src')
      )
    ).rejects.toThrow(/2026-07-13/)
  })

  it('rejects when the listing fails', async () => {
    await expect(
      pullRankHistory(fakeBucket({ failList: true }), path.join(tmp, 'src'))
    ).rejects.toThrow(/503/)
  })

  it('rejects when fewer files land on disk than were listed', async () => {
    await expect(
      pullRankHistory(
        fakeBucket({ silentDownload: true }),
        path.join(tmp, 'src')
      )
    ).rejects.toThrow(/0 of 20/)
  })

  it('downloads every listed date with bounded concurrency', async () => {
    const src = path.join(tmp, 'src')
    const result = await pullRankHistory(fakeBucket(), src, { concurrency: 3 })
    expect(result).toEqual({ downloaded: 20 })
    expect(tree(src).size).toBe(20)
  })
})

describe('pullRankHistory on an empty bucket', () => {
  it('is a no-op, as the legacy loop was', async () => {
    const src = path.join(tmp, 'src')
    expect(await pullRankHistory(fakeBucket(), src)).toEqual({ downloaded: 0 })
    expect(tree(src).size).toBe(0)
  })
})

describe('data-pipeline.yml rank-history step (#1733)', () => {
  const yml = fs.readFileSync(WORKFLOW, 'utf-8')
  const at = yml.indexOf('# v1/rank-history/{districtId}.json')
  const section = yml.slice(at, yml.indexOf('RANK_FILE_COUNT=', at))

  it('pulls through the tested script, not a per-date cp loop', () => {
    expect(at).toBeGreaterThan(0)
    expect(section).toContain(
      'npx tsx scripts/pull-rank-history.ts "${GCS_BUCKET}" /tmp/rank-history-src'
    )
    expect(section).not.toMatch(/gcloud storage (cp|ls)/)
    expect(section).not.toContain('|| true')
  })
})
