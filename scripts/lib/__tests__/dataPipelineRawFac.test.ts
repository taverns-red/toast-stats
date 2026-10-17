/**
 * Workflow contract: daily persists its raw Find-A-Club fetch (ADR-015 P2,
 * #1758, audit D-1).
 *
 * The FAC JSON used to live only on the daily runner, so every re-derivation
 * of a date (rebuild, rescrape) could only produce an unenriched snapshot.
 * Daily now uploads `./cache/find-a-club/<snapshotDate>/` to staging
 * `raw-fac/<snapshotDate>/` before the merge, and process-dates.sh merges it
 * back (processDates.test.ts). The copy is internal: plain (no `-Z`, nothing
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

const PERSIST = '[daily] Persist raw Find-A-Club'
const persist = steps.find(s => s.name === PERSIST)

describe('daily persists the raw FAC fetch to staging raw-fac/ (#1758)', () => {
  it('has a persist step that runs on every daily: a partial fetch (exit 1) persists what it fetched (#1770)', () => {
    expect(persist, 'no persist step').toBeDefined()
    expect(persist!.if).toBe("steps.mode.outputs.mode == 'daily'")
  })

  it('uploads the snapshot date’s FAC directory under raw-fac/<snapshotDate>/', () => {
    // Shell continuations joined.
    const run = (persist?.run ?? '').replace(/\\\n\s*/g, ' ')
    expect(run).toMatch(
      // Through gcs-upload.sh so the upload lands in the run manifest (#1762).
      /scripts\/pipeline\/gcs-upload\.sh [\w-]+ rsync -r\s+"\.\/cache\/find-a-club\/\$\{SNAPSHOT_DATE\}\/"\s+"gs:\/\/\$\{GCS_BUCKET\}\/raw-fac\/\$\{SNAPSHOT_DATE\}\/"/
    )
  })

  it('uploads plain JSON (no -Z): the runner merges it back from disk', () => {
    expect(persist?.run ?? '').not.toMatch(/\s-Z\b/)
  })

  it('runs after the fetch and before the merge', () => {
    const fetch = indexOf(s => s.id === 'daily-fac-fetch')
    const at = indexOf(s => s.name === PERSIST)
    const merge = indexOf(s => s.id === 'daily-fac-merge')
    expect(fetch).toBeGreaterThanOrEqual(0)
    expect(at).toBeGreaterThan(fetch)
    expect(merge).toBeGreaterThan(at)
  })

  it('writes to staging only (the #1755 prod-write guard sees no prod write)', () => {
    expect(prodWriteReasons(persist?.run ?? '')).toEqual([])
    expect(persist?.run ?? '').not.toMatch(
      /GCS_BUCKET_PRODUCTION|toast-stats-data-ca/
    )
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
  type Step = (typeof steps)[number] & { 'continue-on-error'?: boolean }
  const merge = steps.find(s => s.id === 'daily-fac-merge') as Step | undefined
  const fetch = steps.find(s => s.id === 'daily-fac-fetch') as Step | undefined

  it('the merge runs on every daily, whatever the fetch did', () => {
    expect(merge, 'no merge step').toBeDefined()
    expect(merge!.if).toBe("steps.mode.outputs.mode == 'daily'")
  })

  it('the merge is not continue-on-error: a failed merge fails the run before upload', () => {
    expect(merge!['continue-on-error']).toBeUndefined()
  })

  it('the merge goes through daily-fac-merge.sh (fresh FAC, else the last persisted raw-fac/)', () => {
    const run = (merge?.run ?? '').replace(/\\\n\s*/g, ' ')
    expect(run).toMatch(
      /bash scripts\/pipeline\/daily-fac-merge\.sh "\$\{GCS_BUCKET\}" "\$\{SNAPSHOT_DATE\}"/
    )
    expect(run).not.toContain('merge-find-a-club')
  })

  it('the fetch may still fail: that is what the fallback is for', () => {
    expect(fetch!['continue-on-error']).toBe(true)
  })

  it('merges before compute, the schema gate and the upload', () => {
    const at = indexOf(s => s.id === 'daily-fac-merge')
    const compute = indexOf(s => s.name === '[daily] Compute Analytics')
    const validate = indexOf(
      s => s.name === '[daily] Validate snapshots against shared contracts'
    )
    const upload = indexOf(s => s.name === '[daily] Upload to GCS')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(compute).toBeGreaterThan(at)
    expect(validate).toBeGreaterThan(at)
    expect(upload).toBeGreaterThan(at)
  })
})
