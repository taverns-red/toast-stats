/**
 * Workflow contract: the run manifest (#1762, ADR-015 P5, migration step 4).
 *
 * Every staging upload in the pipeline job goes through
 * scripts/pipeline/gcs-upload.sh (or a script that uses it), so it lands in
 * `runs/<github_run_id>/written.jsonl`; the content and completeness gates
 * read that manifest; prune keeps `runs/` to 90 days. Sourced from the
 * workflow YAML so the glue cannot drift from the tested scripts.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import { prodWriteReasons } from '../prodWriteGuard.js'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  env?: Record<string, string>
}

const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
  env?: Record<string, string>
  jobs: Record<string, { steps?: Step[] }>
}
const steps = workflow.jobs.pipeline?.steps ?? []
const byName = (name: string) => steps.find(s => s.name === name)
const indexOf = (pred: (s: Step) => boolean) => steps.findIndex(pred)

/** `gcloud storage cp|rsync|mv` commands in a run body, continuations joined. */
function storageWrites(run: string): string[] {
  return run
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => !l.startsWith('#'))
    .flatMap(l => {
      const m = /gcloud\s+storage\s+(cp|rsync|mv)\b.*/.exec(l)
      return m ? [m[0].split(/\s(?:\|\||&&|\||;|\d?>>?|<)\s?/)[0]!.trim()] : []
    })
}

/** The destination token of one storage command. */
const destination = (cmd: string) => cmd.split(/\s+/).pop() ?? ''

const STAGING_DEST = /^"?gs:\/\/\$\{GCS_BUCKET\}\//

describe('data-pipeline run manifest (#1762)', () => {
  it('names one manifest file for the whole job', () => {
    expect(workflow.env?.RUN_MANIFEST_FILE).toMatch(/written\.jsonl$/)
  })

  it('names one removals file beside it, which the promoter reads and the run publishes (#2232)', () => {
    const removals = workflow.env?.RUN_REMOVALS_FILE ?? ''
    expect(removals).toMatch(/removed\.jsonl$/)
    expect(path.dirname(removals)).toBe(
      path.dirname(workflow.env?.RUN_MANIFEST_FILE ?? '')
    )
    const publish = byName('Publish run manifest (#1762)')?.run ?? ''
    expect(publish).toMatch(
      /"\$\{RUN_REMOVALS_FILE\}" "gs:\/\/\$\{GCS_BUCKET\}\/runs\/\$\{GITHUB_RUN_ID\}\/removed\.jsonl"/
    )
    // Published even when the run wrote nothing (L2).
    expect(publish.indexOf('removed.jsonl')).toBeLessThan(
      publish.indexOf('nothing to publish')
    )
  })

  it('purges the CDN when the promotion removed objects, not only when it copied (#2232)', () => {
    const purge = steps.find(s => /invalidate-cdn-cache/.test(s.run ?? ''))
    expect(purge?.if).toMatch(/objects_removed/)
  })

  it('no step in the pipeline job uploads to staging with a raw gcloud call: every write is recorded', () => {
    // The one exemption: publishing the manifest itself, which is not an
    // object the run produced for promotion.
    const raw = steps.flatMap(s =>
      storageWrites(s.id === 'runmanifest' ? '' : (s.run ?? ''))
        .filter(c => STAGING_DEST.test(destination(c)))
        .map(c => `${s.name}: ${c}`)
    )
    expect(raw).toEqual([])
  })

  // Daily uploads through process-dates.sh (#1765): the runner and its FAC
  // persist record every object through gcs-upload.sh; processDates.test.ts
  // compares what the shim wrote with the manifest.
  it('[daily] uploads only through the runner, which records through gcs-upload.sh', () => {
    const step = byName('[daily] Scrape, enrich, compute and publish the date')
    expect(step?.run).toMatch(
      /scripts\/pipeline\/process-dates\.sh "\$\{GCS_BUCKET\}" daily /
    )
    for (const script of ['process-dates.sh', 'daily-fac-fetch.sh']) {
      expect(
        fs.readFileSync(
          path.join(process.cwd(), 'scripts/pipeline', script),
          'utf-8'
        )
      ).toMatch(/scripts\/pipeline\/gcs-upload\.sh/)
    }
  })

  it.each([
    '[backfill] Build global-totals.json one date at a time',
    '[rescrape-historical] Upload upserted stores and raw-csv',
    'Generate CDN manifests',
    'Generate global-history manifest',
    'Update district-snapshot-index',
    'Generate club-index',
    'Generate divisions-areas index',
  ])('%s records its uploads through gcs-upload.sh', name => {
    expect(byName(name)?.run).toMatch(/scripts\/pipeline\/gcs-upload\.sh/)
  })

  describe('publishing the manifest', () => {
    const publishIndex = indexOf(s => s.id === 'runmanifest')
    const publish = steps[publishIndex]

    it('uploads it to runs/<github_run_id>/written.jsonl in staging', () => {
      expect(publish?.run).toContain(
        '"gs://${GCS_BUCKET}/runs/${GITHUB_RUN_ID}/written.jsonl"'
      )
      expect(publish?.run).toContain('RUN_MANIFEST_FILE')
    })

    it('runs whenever the job got that far, even after a failed step', () => {
      expect(publish?.if).toContain('!cancelled()')
    })

    it('is a staging write, never a prod write', () => {
      expect(prodWriteReasons(publish?.run ?? '')).toEqual([])
    })

    it('runs before the gates that read it', () => {
      expect(publishIndex).toBeGreaterThanOrEqual(0)
      expect(indexOf(s => s.id === 'contentgate')).toBeGreaterThan(publishIndex)
    })
  })

  it('the completeness gate takes its dates from the manifest, not a side file', () => {
    const gate = steps.find(s => s.id === 'completenessgate')
    expect(gate?.env?.GATE_DATES).toBeUndefined()
    expect(workflow.env?.TOUCHED_DATES_FILE).toBeUndefined()
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/date-completeness-gate.ts'),
      'utf-8'
    )
    expect(src).toContain('RUN_MANIFEST_FILE')
    expect(src).not.toContain('TOUCHED_DATES_FILE')
  })

  it('the content gate reads the manifest', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/promotion-content-gate.ts'),
      'utf-8'
    )
    expect(src).toContain('RUN_MANIFEST_FILE')
  })

  describe('prune retention (ADR-015 Consequences)', () => {
    const step = byName('[prune] Expire run manifests older than 90 days')

    it('runs in prune mode and respects dry_run', () => {
      expect(step?.if).toContain("steps.mode.outputs.mode == 'prune'")
      expect(step?.run).toContain('DRY_RUN')
    })

    it('selects with the tested module and deletes only runs/ prefixes in staging', () => {
      expect(step?.run).toContain('scripts/expire-run-manifests.ts')
      const deletes = (step?.run ?? '')
        .split('\n')
        .filter(l => /gcloud\s+storage\s+rm\b/.test(l))
      expect(deletes.length).toBeGreaterThan(0)
      for (const d of deletes) {
        expect(d).toContain('gs://${GCS_BUCKET}/${PREFIX}')
        expect(d).not.toContain('PRODUCTION')
      }
      expect(prodWriteReasons(step?.run ?? '')).toEqual([])
    })
  })
})
