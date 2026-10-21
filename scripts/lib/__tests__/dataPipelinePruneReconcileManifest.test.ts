/**
 * Workflow contract: the prune reconcile promotes through the manifest
 * (#1767, ADR-015 P6, migration step 9).
 *
 * The reconcile used to be its own prod writer: `gcloud storage rm -r` on
 * the prod-only dated prefixes, then a whole-prefix rsync of `v1/` and
 * `config/`, with no content gate. Now:
 *
 * - the plan (`[prune] Plan prod reconciliation`, read-only) is the
 *   manifest of the deletes, `/tmp/prod-reconcile-paths.txt`;
 * - the regenerated indexes are already in the run manifest (every shared
 *   manifest step uploads through gcs-upload.sh);
 * - the content and completeness gates read them, as in any promoting run;
 * - scripts/promote-run-manifest.ts --execute copies the indexes and only
 *   then deletes the prefixes, so prod's index never names a deleted date.
 *
 * No step writes prod with its own `gcloud storage` command except the two
 * reports-mirror steps still listed below (the reports half of #1767).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  findProdWriteSteps,
  topLevelConjuncts,
  SKIP_CLAUSE_SAME_JOB,
  type Workflow,
} from '../prodWriteGuard.js'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  env?: Record<string, string>
}

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)
const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as Workflow & {
  jobs: Record<string, { steps?: Step[] }>
}
const steps = (workflow.jobs.pipeline?.steps ?? []) as Step[]
const indexOf = (pred: (s: Step) => boolean) => steps.findIndex(pred)
const byId = (id: string) => steps.find(s => s.id === id)
const byName = (name: string) => steps.find(s => s.name === name)

const PLAN_STEP = '[prune] Plan prod reconciliation'
const DELETES_FILE = '/tmp/prod-reconcile-paths.txt'
const PROMOTING =
  "steps.mode.outputs.mode != 'prune' || steps.mode.outputs.prune_reconcile == 'true'"

describe('no direct gcloud writes into production (#1767 AC)', () => {
  it('no step writes prod with its own gcloud command', () => {
    // The two reports mirrors were the last; they now promote through the
    // manifest too (dataPipelineReportSidecarManifest.test.ts).
    const direct = findProdWriteSteps(workflow)
      .filter(s => s.reasons.some(r => r.startsWith('gcloud storage ')))
      .map(s => `${s.job} / ${s.step}`)
    expect(direct).toEqual([])
  })

  it('has no step that deletes from or rsyncs into prod on its own', () => {
    expect(byName('[prune] Reconcile production')).toBeUndefined()
    for (const s of steps) {
      const body = (s.run ?? '').replace(/\\\r?\n/g, ' ')
      expect(body, s.name).not.toMatch(
        /gcloud storage (rm|rsync)\b[^\n]*GCS_BUCKET_PRODUCTION/
      )
    }
  })
})

describe('the mode step derives prune_reconcile once (#1767)', () => {
  const run = byId('mode')?.run ?? ''

  it('is true only for a non-dry-run prune that reconciles prod', () => {
    expect(run).toMatch(/echo "prune_reconcile=\$\{PRUNE_RECONCILE\}"/)
    expect(run).toMatch(
      /if \[ "\$\{MODE\}" = "prune" \] && \[ "\$\{RECONCILE_PROD:-false\}" = "true" \] && \[ "\$\{DRY_RUN:-false\}" != "true" \]; then\s+PRUNE_RECONCILE="true"/
    )
  })

  it('is computed after the schedule override, which forces reconcile on', () => {
    expect(run.indexOf('PRUNE_RECONCILE="true"')).toBeGreaterThan(
      run.indexOf('RECONCILE_PROD="true"')
    )
  })
})

describe('a prune reconcile runs the gates and the plan (#1767)', () => {
  it.each(['contentgate', 'completenessgate', 'promoteplan'])(
    '%s runs in every promoting mode and on a prune reconcile',
    id => {
      expect(byId(id)?.if).toBe(PROMOTING)
    }
  )

  it('the plan previews the deletes on a prune', () => {
    expect(byId('promoteplan')?.env?.PROD_DELETES_FILE).toBe(
      `\${{ steps.mode.outputs.mode == 'prune' && '${DELETES_FILE}' || '' }}`
    )
  })

  it('the delete plan is still built read-only from both listings', () => {
    const plan = byName(PLAN_STEP)
    expect(plan?.run).toContain('scripts/prune-prod-reconcile.ts')
    expect(plan?.run).toContain(`> ${DELETES_FILE}`)
    expect(findProdWriteSteps(workflow).map(s => s.step)).not.toContain(
      PLAN_STEP
    )
  })
})

describe('[prune] Promote prod reconciliation (#1767)', () => {
  const idx = indexOf(s => s.id === 'prunepromote')
  const step = steps[idx]

  it('runs the manifest promoter with the delete manifest', () => {
    expect(step?.name).toBe('[prune] Promote prod reconciliation (#1767)')
    expect(step?.run).toMatch(/scripts\/promote-run-manifest\.ts --execute/)
    expect(step?.env?.PROD_DELETES_FILE).toBe(DELETES_FILE)
    expect(step?.env?.COMPLETENESS_GATE_FILE).toBe(
      byId('completenessgate')?.env?.COMPLETENESS_GATE_FILE
    )
  })

  it('runs only on a prune reconcile, never under skip_promotion', () => {
    const c = topLevelConjuncts(step?.if ?? '')
    for (const clause of [
      "steps.mode.outputs.mode == 'prune'",
      "steps.mode.outputs.prune_reconcile == 'true'",
      "steps.completenessgate.outputs.completeness_promote != ''",
      SKIP_CLAUSE_SAME_JOB,
    ]) {
      expect(c, clause).toContain(clause)
    }
  })

  it('refuses, loudly, when the content gate did not pass', () => {
    expect(step?.env?.CONTENT_PROMOTE).toBe(
      '${{ steps.contentgate.outputs.content_promote }}'
    )
    const run = step?.run ?? ''
    expect(run).toMatch(/if \[ "\$\{CONTENT_PROMOTE\}" != "true" \]; then/)
    expect(run.indexOf('exit 1')).toBeGreaterThan(-1)
    expect(run.indexOf('exit 1')).toBeLessThan(
      run.indexOf('promote-run-manifest.ts')
    )
  })

  it('runs after the regenerated indexes, the delete plan, both gates and the plan', () => {
    for (const before of [
      'Generate CDN manifests',
      'Generate global-history manifest',
      'Update district-snapshot-index',
      'Generate club-index',
      'Generate divisions-areas index',
      PLAN_STEP,
    ]) {
      expect(idx, before).toBeGreaterThan(indexOf(s => s.name === before))
    }
    for (const id of ['contentgate', 'completenessgate', 'promoteplan']) {
      expect(idx, id).toBeGreaterThan(indexOf(s => s.id === id))
    }
  })

  it('is covered by the skip_promotion contract', () => {
    const found = findProdWriteSteps(workflow).find(s => s.step === step?.name)
    expect(found?.reasons).toEqual(['manifest promotion → production'])
    expect(found?.guarded).toBe(true)
  })
})
