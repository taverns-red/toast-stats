#!/usr/bin/env node
/**
 * Regenerates fixtures/expected/ by running the ORIGINAL inline `node -e`
 * generators from data-pipeline.yml against fixtures/input/ (#1743, P3-3).
 *
 * The expected bytes are never hand-written. This script:
 *   1. reads data-pipeline.yml at BASE_SHA, the last commit where the six
 *      generators were still inline,
 *   2. cuts each `node -e "…"` block out exactly as the workflow has it,
 *   3. runs it through bash (so bash performs the same `${VAR}` expansion
 *      and double-quote processing the runner does), with `/tmp/` rewritten
 *      to a scratch directory and `Date` frozen via a --require preload,
 *   4. copies the files the block wrote, plus its stdout, into expected/.
 *
 * The ported TypeScript in scripts/manifests/ must reproduce these bytes.
 * Re-run only if the fixture INPUTS change:
 *   node scripts/manifests/__tests__/fixtures/generate-expected.mjs
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_SHA = 'f23bd70b7bca8d86d834526c56a323e73e942ae1'
export const FROZEN_NOW = '2026-10-11T09:15:28.774Z'

const here = dirname(fileURLToPath(import.meta.url))
const input = join(here, 'input')
const expected = join(here, 'expected')

const workflow = execFileSync(
  'git',
  ['show', `${BASE_SHA}:.github/workflows/data-pipeline.yml`],
  { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }
).split('\n')

/** Every `node -e "` block: opener line through the lone closing quote. */
function inlineBlocks() {
  const blocks = []
  for (let i = 0; i < workflow.length; i++) {
    if (!/^\s*node -e "\s*$/.test(workflow[i])) continue
    let end = i + 1
    while (!/^\s*"\s*$/.test(workflow[end])) end++
    blocks.push(workflow.slice(i, end + 1).join('\n'))
  }
  return blocks
}

const blocks = inlineBlocks()
function block(marker) {
  const hits = blocks.filter(b => b.includes(marker))
  if (hits.length !== 1) {
    throw new Error(`expected exactly one block containing ${marker}`)
  }
  return hits[0]
}

const BLOCKS = {
  latest: block("type: 'manifest'"),
  dates: block("type: 'dates-index'"),
  rankings: block("type: 'rankings'"),
  rankHistory: block("const srcDir = '/tmp/rank-history-src'"),
  snapshotIndexFromListing: block('/tmp/snapshot-files.txt'),
  snapshotIndexMerge: block('Normalize: old flat format'),
}

const freeze = join(mkdtempSync(join(tmpdir(), 'p33-freeze-')), 'freeze.cjs')
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

/**
 * Run one block in a fresh scratch dir. `vars` become bash variables
 * (exactly as the workflow step defines them); `setup` stages inputs.
 */
function run(name, script, vars, setup, collect) {
  const work = mkdtempSync(join(tmpdir(), `p33-${name}-`))
  setup(work)
  const body = script.split('/tmp/').join(`${work}/`)
  const assigns = Object.entries(vars)
    .map(
      ([k, v]) => `${k}=${JSON.stringify(v.split('/tmp/').join(`${work}/`))}`
    )
    .join('\n')
  const sh = join(work, 'run.sh')
  writeFileSync(sh, `set -e\n${assigns}\n${body}\n`)
  const stdout = execFileSync('bash', [sh], {
    encoding: 'utf-8',
    env: { ...process.env, NODE_OPTIONS: `--require ${freeze}` },
  })
  const out = join(expected, name)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'stdout.txt'), stdout)
  collect(work, out)
  rmSync(work, { recursive: true, force: true })
}

const copy = (from, to) => cpSync(from, to)

run(
  'latest',
  BLOCKS.latest,
  { LATEST_DATE: '2026-10-10' },
  () => {},
  (w, o) => copy(join(w, 'latest.json'), join(o, 'latest.json'))
)

run(
  'dates',
  BLOCKS.dates,
  {},
  w => copy(join(input, 'all-dates.txt'), join(w, 'all-dates.txt')),
  (w, o) => copy(join(w, 'dates.json'), join(o, 'dates.json'))
)

for (const [name, src] of [
  ['rankings', 'all-districts-rankings.json'],
  ['rankings-no-source-date', 'all-districts-rankings.no-source-date.json'],
]) {
  run(
    name,
    BLOCKS.rankings,
    { LATEST_DATE: '2026-10-10', RANKINGS_SRC: '/tmp/src.json' },
    w => copy(join(input, src), join(w, 'src.json')),
    (w, o) => copy(join(w, 'rankings.json'), join(o, 'rankings.json'))
  )
}

run(
  'rank-history',
  BLOCKS.rankHistory,
  {},
  w => {
    cpSync(join(input, 'rank-history-src'), join(w, 'rank-history-src'), {
      recursive: true,
    })
    mkdirSync(join(w, 'rank-history-out'))
  },
  (w, o) => {
    for (const f of readdirSync(join(w, 'rank-history-out'))) {
      copy(join(w, 'rank-history-out', f), join(o, f))
    }
  }
)

run(
  'snapshot-index-from-listing',
  BLOCKS.snapshotIndexFromListing,
  {},
  w => copy(join(input, 'snapshot-files.txt'), join(w, 'snapshot-files.txt')),
  (w, o) =>
    copy(
      join(w, 'district-snapshot-index.json'),
      join(o, 'district-snapshot-index.json')
    )
)

for (const [name, existing] of [
  ['snapshot-index-merge', 'district-snapshot-index.json'],
  [
    'snapshot-index-merge-legacy-flat',
    'district-snapshot-index.legacy-flat.json',
  ],
]) {
  run(
    name,
    BLOCKS.snapshotIndexMerge,
    { DATE: '2026-10-11', DISTRICT_LIST: '60, 61,F,U' },
    w => copy(join(input, existing), join(w, 'district-snapshot-index.json')),
    (w, o) =>
      copy(
        join(w, 'district-snapshot-index.json'),
        join(o, 'district-snapshot-index.json')
      )
  )
}

console.error(`Regenerated ${expected} from ${BASE_SHA}`)
