/**
 * Workflow contract: `skip_promotion` (#1754) makes a dispatch staging-only.
 * The run goes through the count, value and content gates, reports them,
 * and then writes nothing to production. Every prod-writing step, found by
 * what its `run:` body does (scripts/lib/prodWriteGuard.ts), must carry the
 * skip clause. A new prod-writing step without it fails this file.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  findProdWriteSteps,
  prodWriteReasons,
  topLevelConjuncts,
  SKIP_CLAUSE_SAME_JOB,
  type Workflow,
} from '../prodWriteGuard.js'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)
const source = fs.readFileSync(WORKFLOW_PATH, 'utf-8')
const workflow = parse(source) as Workflow & {
  on: { workflow_dispatch: { inputs: Record<string, Record<string, unknown>> } }
  jobs: Record<string, { outputs?: Record<string, string> }>
}
const steps = workflow.jobs.pipeline?.steps ?? []
const byName = (name: string) => steps.find(s => s.name === name)

describe('prodWriteGuard sentinels (#1754)', () => {
  it('flags a copy, sync, move, remove or update INTO prod', () => {
    for (const run of [
      'gcloud storage rsync -r "gs://${GCS_BUCKET}/v1/" "gs://${GCS_BUCKET_PRODUCTION}/v1/"',
      'gcloud storage cp \\\n  -Z \\\n  /tmp/x/*.json \\\n  "gs://${GCS_BUCKET_PRODUCTION}/snapshots/d/"',
      'gcloud storage mv gs://a/b gs://toast-stats-data-ca/b',
      'gcloud storage rm -r "gs://${GCS_BUCKET_PRODUCTION}/${P}/" || true',
      'gcloud storage objects update gs://toast-stats-data-ca/v1/x.json --cache-control=no-store',
    ]) {
      expect(prodWriteReasons(run), run).not.toEqual([])
    }
  })

  it('flags a CDN invalidation and the promotion-held issue writes', () => {
    expect(
      prodWriteReasons('gcloud compute url-maps invalidate-cdn-cache m')
    ).toEqual(['CDN invalidation'])
    expect(
      prodWriteReasons('gh issue create --label promotion-held --title t')
    ).toEqual(['promotion-held issue flow'])
  })

  it('does not flag reads from prod or writes to staging', () => {
    for (const run of [
      'gcloud storage ls "gs://${GCS_BUCKET_PRODUCTION}/snapshots/" > /tmp/ls.txt',
      'gcloud storage cat "gs://${GCS_BUCKET_PRODUCTION}/v1/dates.json" | jq .',
      'gcloud storage cp "gs://${GCS_BUCKET_PRODUCTION}/v1/dates.json" /tmp/d.json',
      'gcloud storage rsync -r ./cache "gs://${GCS_BUCKET}/snapshots/"',
      '# gcloud storage rm -r "gs://${GCS_BUCKET_PRODUCTION}/x/"',
    ]) {
      expect(prodWriteReasons(run), run).toEqual([])
    }
  })

  it('accepts the clause only as a top-level && conjunct', () => {
    expect(topLevelConjuncts(`a == 'x' && ${SKIP_CLAUSE_SAME_JOB}`)).toContain(
      SKIP_CLAUSE_SAME_JOB
    )
    expect(
      topLevelConjuncts(`(a == 'x' || b) && ${SKIP_CLAUSE_SAME_JOB}`)
    ).toContain(SKIP_CLAUSE_SAME_JOB)
    expect(
      topLevelConjuncts(`a == 'x' || ${SKIP_CLAUSE_SAME_JOB}`)
    ).not.toContain(SKIP_CLAUSE_SAME_JOB)
    expect(
      topLevelConjuncts(`(a == 'x' && ${SKIP_CLAUSE_SAME_JOB}) || b`)
    ).not.toContain(SKIP_CLAUSE_SAME_JOB)
  })

  it('reports a new prod-writing step without the clause as unguarded', () => {
    const synthetic: Workflow = {
      jobs: {
        pipeline: {
          steps: [
            {
              name: 'Guarded promote',
              if: `steps.diff.outputs.promote == 'true' && ${SKIP_CLAUSE_SAME_JOB}`,
              run: 'gcloud storage rsync -r gs://s/v1/ "gs://${GCS_BUCKET_PRODUCTION}/v1/"',
            },
            {
              name: 'New unguarded prod write',
              if: "steps.mode.outputs.mode == 'rebuild'",
              run: 'gcloud storage cp /tmp/a.json "gs://${GCS_BUCKET_PRODUCTION}/v1/a.json"',
            },
          ],
        },
      },
    }
    const found = findProdWriteSteps(synthetic)
    expect(found.map(f => [f.step, f.guarded])).toEqual([
      ['Guarded promote', true],
      ['New unguarded prod write', false],
    ])
  })
})

describe('data-pipeline skip_promotion contract (#1754)', () => {
  it('declares skip_promotion as a boolean dispatch input, default false', () => {
    const input = workflow.on.workflow_dispatch.inputs.skip_promotion
    expect(input?.type).toBe('boolean')
    expect(input?.default).toBe(false)
  })

  it('normalises it to a step-output string in the mode step (#1133)', () => {
    const run = steps.find(s => s.id === 'mode')?.run ?? ''
    expect(run).toContain('${{ inputs.skip_promotion }}')
    expect(run).toMatch(/skip_promotion=\$\{SKIP_PROMOTION:-false\}/)
  })

  it('exposes it to downstream jobs', () => {
    expect(workflow.jobs.pipeline.outputs?.skip_promotion).toBe(
      '${{ steps.mode.outputs.skip_promotion }}'
    )
  })

  const prodSteps = findProdWriteSteps(workflow)

  it('finds the known prod-writing steps (the detector is not blind)', () => {
    const names = prodSteps.map(s => s.step)
    for (const expected of [
      '[prune] Reconcile production',
      'Promote staging to production',
      'Invalidate CDN cache after promotion (#1294)',
      'Ensure promotion-held label exists',
      'File or refresh promotion-held issue',
      'Auto-close promotion-held issue on a promoting run',
      '[reports] Mirror placed datasets into prod',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('guards every prod-writing step with skip_promotion', () => {
    const unguarded = prodSteps
      .filter(s => !s.guarded)
      .map(s => `${s.job} / ${s.step}: ${s.reasons.join(', ')}`)
    expect(unguarded).toEqual([])
  })

  it('does not evaluate the promotion-held alert on an intentional skip', () => {
    expect(
      topLevelConjuncts(steps.find(s => s.id === 'promoalert')?.if ?? '')
    ).toContain(SKIP_CLAUSE_SAME_JOB)
  })

  it('does not report an intentional skip as a blocked promotion', () => {
    expect(topLevelConjuncts(byName('Promotion blocked')?.if ?? '')).toContain(
      SKIP_CLAUSE_SAME_JOB
    )
  })

  it('reports the skip and all three gate verdicts in the step summary', () => {
    const skip = steps.find(s => s.id === 'skippromotion')
    expect(skip?.if).toBe("steps.mode.outputs.skip_promotion == 'true'")
    const run = skip?.run ?? ''
    expect(run).toContain('promotion skipped (skip_promotion)')
    expect(run).toContain('GITHUB_STEP_SUMMARY')
    for (const verdict of [
      'steps.diff.outputs.promote',
      'steps.valuediff.outputs.value_promote',
      'steps.contentgate.outputs.content_promote',
    ]) {
      expect(run).toContain(verdict)
    }
  })

  it('reports promoted only when the promote step actually ran', () => {
    expect(workflow.jobs.pipeline.outputs?.promoted).toBe(
      "${{ steps.promote.outcome == 'success' }}"
    )
    expect(byName('Promote staging to production')?.id).toBe('promote')
  })
})
