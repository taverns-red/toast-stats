/**
 * Workflow contract: daily persists its raw Find-A-Club fetch (ADR-015 P2,
 * #1758, audit D-1).
 *
 * The FAC JSON used to live only on the daily runner, so every re-derivation
 * of a date (rebuild, rescrape) could only produce an unenriched snapshot.
 * Daily now uploads `./cache/find-a-club/<snapshotDate>/` to staging
 * `raw-fac/<snapshotDate>/` before the merge (since #1765 inside the
 * runner's daily mode, scripts/pipeline/daily-fac-fetch.sh), and
 * process-dates.sh merges it back in the other modes (processDates.test.ts). The copy is internal: plain (no `-Z`, nothing
 * reads it through the CDN), staging only, and never promoted.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import { prodWriteReasons, type Workflow } from '../prodWriteGuard.js'
import { PROMOTED_PREFIXES } from '../promotionContentGate.js'
import { classifyPromotionPath } from '../manifestPromotion.js'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)
const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as Workflow
const steps = workflow.jobs.pipeline?.steps ?? []
const indexOf = (pred: (s: (typeof steps)[number]) => boolean) =>
  steps.findIndex(pred)

// Since #1765 the fetch, persist and merge are stages of the runner's daily
// mode: scripts/pipeline/daily-fac-fetch.sh (fetch + persist) and
// daily-fac-merge.sh, called by process-dates.sh. Their behaviour runs for
// real against the shim in processDates.test.ts ("process-dates.sh daily");
// here the persist's shape and the wiring are pinned from the source.
const read = (rel: string) =>
  fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8')
const FETCH_SCRIPT = read('scripts/pipeline/daily-fac-fetch.sh')
const RUNNER = read('scripts/pipeline/process-dates.sh')
/** Shell text with comment lines dropped and continuations joined. */
const code = (text: string) =>
  text
    .split('\n')
    .filter(l => !/^\s*#/.test(l))
    .join('\n')
    .replace(/\\\n\s*/g, ' ')

describe('daily persists the raw FAC fetch to staging raw-fac/ (#1758)', () => {
  it('daily runs the fetch-and-persist script in its enrich stage (#1765)', () => {
    expect(code(RUNNER)).toMatch(/daily\) enrich_daily "\$\{actual\}" ;;/)
    expect(code(RUNNER)).toMatch(
      /"\$\{FAC_FETCH\[@\]\}" "\$\{BUCKET\}" "\$\{actual\}" "\$\{DISTRICTS\}"/
    )
  })

  it('uploads the snapshot date’s FAC directory under raw-fac/<snapshotDate>/', () => {
    expect(code(FETCH_SCRIPT)).toMatch(
      // Through gcs-upload.sh so the upload lands in the run manifest (#1762).
      /scripts\/pipeline\/gcs-upload\.sh" [\w-]+ rsync -r\s+"\$\{FRESH\}\/"\s+"gs:\/\/\$\{BUCKET\}\/raw-fac\/\$\{DATE\}\/"/
    )
    expect(FETCH_SCRIPT).toContain('FRESH="${CACHE_DIR}/find-a-club/${DATE}"')
  })

  it('uploads plain JSON (no -Z): the runner merges it back from disk', () => {
    expect(code(FETCH_SCRIPT)).not.toMatch(/\s-Z\b/)
  })

  it('writes to staging only (the #1755 prod-write guard sees no prod write)', () => {
    expect(prodWriteReasons(code(FETCH_SCRIPT))).toEqual([])
    expect(FETCH_SCRIPT).not.toMatch(
      /GCS_BUCKET_PRODUCTION|toast-stats-data-ca/
    )
  })

  it('no workflow step fetches, persists or merges FAC inline any more', () => {
    const inline = steps.filter(s =>
      /fetch-find-a-club|merge-find-a-club|daily-fac-merge\.sh|raw-fac\//.test(
        code(s.run ?? '')
      )
    )
    expect(inline.map(s => s.name)).toEqual([])
  })
})

describe('raw-fac/ is internal: never promoted (#1758)', () => {
  it('is not a promoted prefix', () => {
    expect(PROMOTED_PREFIXES.some(p => 'raw-fac/'.startsWith(p))).toBe(false)
  })

  it('the promote step never copies it', () => {
    const promote = steps.find(
      s => s.name === 'Promote run manifest to production (#1763)'
    )
    expect(promote, 'no promote step').toBeDefined()
    expect(promote!.run ?? '').not.toContain('raw-fac')
    // #1763: the promoter copies manifest paths under PROMOTED_PREFIXES only.
    expect(classifyPromotionPath('raw-fac/2026-10-10/61.json').kind).toBe(
      'excluded'
    )
  })
})

describe('daily FAC fails closed with a persisted fallback (#1770, D-10)', () => {
  it('the merge goes through daily-fac-merge.sh (fresh FAC, else the last persisted raw-fac/)', () => {
    expect(RUNNER).toContain(
      'read -r -a FAC_MERGE <<<"${DAILY_FAC_MERGE:-bash ${REPO}/scripts/pipeline/daily-fac-merge.sh}"'
    )
    expect(code(RUNNER)).toMatch(
      /if "\$\{FAC_MERGE\[@\]\}" "\$\{BUCKET\}" "\$\{actual\}"/
    )
  })

  it('the fetch may still fail: that is what the fallback is for (the script never fails the date)', () => {
    expect(code(FETCH_SCRIPT)).toMatch(
      /--compare-snapshot-dir [^\n]*\|\| status=\$\?/
    )
  })

  it('a failed merge fails the date before compute, the schema gate and the upload', () => {
    // enrich_daily leaves ENRICH=failed on a failed merge, and the enrich
    // case cleans up and returns before compute for anything but a success.
    const body = RUNNER.slice(
      RUNNER.indexOf('enrich_daily() {'),
      RUNNER.indexOf('# Merge the persisted Find-A-Club fetch')
    )
    expect(body).toMatch(/ENRICH=failed[\s\S]*ENRICH=enriched/)
    const loop = RUNNER.slice(RUNNER.indexOf('  # 7. enrich'))
    const failed = loop.indexOf('cleanup_date')
    const compute = loop.indexOf('compute-analytics')
    expect(failed).toBeGreaterThan(0)
    expect(compute).toBeGreaterThan(failed)
  })
})
