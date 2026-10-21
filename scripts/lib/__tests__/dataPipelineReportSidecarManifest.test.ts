/**
 * Workflow contract: one prod-write mechanism for the report sidecars
 * (#1767, ADR-015 step 9, D-16).
 *
 * Before: `place-reports` mirrored the sidecars straight to prod after the
 * content gate had run (`gcloud storage cp … gs://${GCS_BUCKET_PRODUCTION}`),
 * `education-rollup` did the same for reports-rollups.json, and two steps
 * ran carry-report-sidecars.sh, which copied bucket to bucket on its own.
 * None of it was content-checked.
 *
 * After: those writers record their staging uploads in the run manifest, and
 * the `promote-reports` job plans a sidecar manifest, content-checks it and
 * promotes it through scripts/promote-run-manifest.ts. The prod-write guard
 * pins it: no step outside the manifest promote copies into prod.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  DIRECT_PROD_WRITE_EXEMPT,
  directProdWriteSteps,
  findProdWriteSteps,
  topLevelConjuncts,
  SKIP_CLAUSE_DOWNSTREAM,
  type Workflow,
} from '../prodWriteGuard.js'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  env?: Record<string, string>
  uses?: string
  'continue-on-error'?: boolean
}
interface Job {
  if?: string
  needs?: string[] | string
  steps?: Step[]
}

const workflow = parse(
  fs.readFileSync(
    path.join(process.cwd(), '.github/workflows/data-pipeline.yml'),
    'utf-8'
  )
) as Workflow & { jobs: Record<string, Job> }

const JOB = 'promote-reports'
const steps = (job: string) => (workflow.jobs[job]?.steps ?? []) as Step[]
const step = (job: string, name: string) =>
  steps(job).find(s => s.name === name)
const index = (job: string, name: string) =>
  steps(job).findIndex(s => s.name === name)

const FETCH = '[reports] Fetch the run manifest'
const PLAN = '[reports] Plan the report sidecar manifest (#1767)'
const GATE = '[reports] Content gate the report sidecars (#1767)'
const PROMOTE = '[reports] Promote the report sidecars (#1767)'
const HOLD =
  '[reports] Hold only the dates whose sidecars fail the content gate (#2227)'
const ALERT = '[reports] Evaluate the report sidecar alert (#2227)'
const FILE_ALERT = '[reports] File or refresh the report sidecar alert (#2227)'
const CLOSE_ALERT = '[reports] Auto-close the report sidecar alert (#2227)'
const CHECK =
  '[reports] Completeness gate: promoted dates have their reports (#2144)'

describe('the prod-write guard (#1767): one mechanism', () => {
  it('no step copies into prod with gcloud storage outside the promote', () => {
    const direct = findProdWriteSteps(workflow).filter(s =>
      s.reasons.some(r => r.startsWith('gcloud storage '))
    )
    expect(direct.map(s => `${s.job} / ${s.step}`)).toEqual([])
  })

  it('every other prod data write is the manifest promote, or a pinned exemption', () => {
    const found = directProdWriteSteps(workflow)
    expect(
      found
        .filter(s => !(s.step in DIRECT_PROD_WRITE_EXEMPT))
        .map(s => `${s.job} / ${s.step}: ${s.reasons.join(', ')}`)
    ).toEqual([])
    // An exemption names a live step and the issue that retires it.
    for (const [name, why] of Object.entries(DIRECT_PROD_WRITE_EXEMPT)) {
      expect(
        found.some(s => s.step === name),
        name
      ).toBe(true)
      expect(why).toMatch(/#\d+/)
    }
  })

  it('directProdWriteSteps sees a direct copy and ignores the promote', () => {
    const wf: Workflow = {
      jobs: {
        a: {
          steps: [
            {
              name: 'direct',
              run: 'gcloud storage cp /tmp/x.json "gs://${GCS_BUCKET_PRODUCTION}/snapshots/d/"',
            },
            {
              name: 'promote',
              run: 'npx tsx scripts/promote-run-manifest.ts --execute',
            },
            { name: 'purge', run: 'bash scripts/invalidate-cdn-cache.sh' },
          ],
        },
      },
    }
    expect(directProdWriteSteps(wf).map(s => s.step)).toEqual(['direct'])
  })
})

describe('place-reports writes staging only, recorded (#1767)', () => {
  it('has no prod-writing step', () => {
    expect(
      findProdWriteSteps(workflow).filter(s => s.job === 'place-reports')
    ).toEqual([])
  })

  it('places through gcs-upload.sh, so the run manifest lists every sidecar', () => {
    const place = step(
      'place-reports',
      '[reports] Place datasets into the snapshot directory'
    )
    expect(place?.run).toContain(
      'bash scripts/pipeline/gcs-upload.sh place-reports cp'
    )
    expect(place?.run).not.toMatch(/^\s*gcloud storage cp[^\n]*-Z/m)
  })

  it('seeds the run manifest before placing and republishes it after', () => {
    const seed = index('place-reports', '[reports] Fetch the run manifest')
    const placeAt = index(
      'place-reports',
      '[reports] Place datasets into the snapshot directory'
    )
    const pub = index('place-reports', '[reports] Publish run manifest')
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(placeAt).toBeGreaterThan(seed)
    expect(pub).toBeGreaterThan(placeAt)
    const publish = steps('place-reports')[pub]!
    expect(publish.if).toContain("steps.seed.outputs.seeded == 'true'")
    expect(publish.run).toContain(
      'gs://${GCS_BUCKET}/runs/${GITHUB_RUN_ID}/written.jsonl'
    )
  })
})

describe('education-rollup writes no reports rollup to prod (#1767)', () => {
  it('has no reports-rollups mirror', () => {
    expect(
      steps('education-rollup').some(s =>
        /reports rollups into prod/.test(s.name ?? '')
      )
    ).toBe(false)
  })
})

describe('promote-reports job (#1767)', () => {
  const job = workflow.jobs[JOB]

  it('runs after every writer of the sidecars, in every mode that needs it', () => {
    expect(job, 'promote-reports job').toBeDefined()
    expect(([] as string[]).concat(job?.needs ?? [])).toEqual(
      expect.arrayContaining(['pipeline', 'place-reports', 'education-rollup'])
    )
    const c = topLevelConjuncts(job?.if ?? '')
    // `!cancelled()` collapses to a group placeholder in the parser.
    expect(c).toContain('!cancelled⟨group⟩')
    expect(c).toContain("needs.pipeline.result == 'success'")
    expect(c).toContain(SKIP_CLAUSE_DOWNSTREAM)
    expect(job?.if).toContain("needs.pipeline.outputs.promoted_dates != ''")
    expect(job?.if).toContain("needs.pipeline.outputs.snapshot_date != ''")
  })

  it('fetch → plan → content gate → promote, in that order', () => {
    const order = [FETCH, PLAN, GATE, PROMOTE].map(n => index(JOB, n))
    expect(
      order.every(i => i >= 0),
      JSON.stringify(order)
    ).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('plans from this run’s manifest and the promoted dates', () => {
    const plan = step(JOB, PLAN)
    expect(plan?.run).toContain('npx tsx scripts/plan-report-sidecars.ts')
    expect(plan?.env?.PROMOTED_DATES).toBe(
      '${{ needs.pipeline.outputs.promoted_dates }}'
    )
  })

  it('content-checks exactly the sidecar manifest', () => {
    const gate = step(JOB, GATE)
    expect(gate?.run).toContain(
      'npx tsx scripts/promotion-content-gate.ts --manifest-only'
    )
    expect(gate?.env?.RUN_MANIFEST_FILE).toBe(
      '${{ env.REPORT_SIDECAR_MANIFEST_FILE }}'
    )
    expect(gate?.if).toContain("steps.plan.outputs.objects != '0'")
  })

  it('promotes the dates that passed the gate, through the manifest promoter, holding the rest (#2227)', () => {
    const p = step(JOB, PROMOTE)
    expect(p?.run).toBe('npx tsx scripts/promote-run-manifest.ts --execute')
    const c = topLevelConjuncts(p?.if ?? '')
    // Not content_promote: one bad date must not hold the others (#2227).
    expect(p?.if ?? '').not.toContain('content_promote')
    expect(c).toContain("steps.contenthold.outputs.objects != ''")
    expect(c).toContain("steps.contenthold.outputs.objects != '0'")
    expect(p?.env?.RUN_MANIFEST_FILE).toBe(
      '${{ env.REPORT_SIDECAR_MANIFEST_FILE }}'
    )
    expect(p?.env?.COMPLETENESS_GATE_FILE).toBe(
      '${{ env.REPORT_SIDECAR_VERDICT_FILE }}'
    )
    expect(p?.['continue-on-error']).not.toBe(true)
    const found = findProdWriteSteps(workflow).find(
      s => s.job === JOB && s.step === PROMOTE
    )
    expect(found?.reasons).toEqual(['manifest promotion → production'])
    expect(found?.guarded).toBe(true)
  })

  it('applies the gate per date between the gate and the promote (#2227)', () => {
    const h = step(JOB, HOLD)
    expect(h?.id).toBe('contenthold')
    expect(h?.run).toBe(
      'npx tsx scripts/plan-report-sidecars.ts --apply-content-gate'
    )
    expect(h?.env?.CONTENT_GATE_FILE).toBe(
      step(JOB, GATE)?.env?.CONTENT_GATE_FILE
    )
    expect(h?.if).toContain("steps.plan.outputs.objects != '0'")
    expect(index(JOB, HOLD)).toBeGreaterThan(index(JOB, GATE))
    expect(index(JOB, HOLD)).toBeLessThan(index(JOB, PROMOTE))
  })

  it('a content hold no longer fails the job; it files an alert instead (#2227)', () => {
    expect(
      steps(JOB).some(
        s => /exit 1/.test(s.run ?? '') && /content_promote/.test(s.if ?? '')
      )
    ).toBe(false)
    const a = step(JOB, ALERT)
    expect(a?.id).toBe('sidecaralert')
    expect(a?.run).toBe('npx tsx scripts/promotion-alert.ts')
    expect(a?.if).toContain('!cancelled()')
    expect(a?.env).toMatchObject({
      ALERT_SCOPE: 'report-sidecars',
      CONTENT_PROMOTE: '${{ steps.contenthold.outputs.content_promote }}',
      CONTENT_GATE_FILE: step(JOB, GATE)?.env?.CONTENT_GATE_FILE,
      SCOPED_COMPLETE: '${{ steps.contenthold.outputs.content_promote }}',
      SCOPED_HELD_DATES: '${{ steps.contenthold.outputs.content_held_dates }}',
    })
    expect(index(JOB, ALERT)).toBeGreaterThan(index(JOB, PROMOTE))
  })

  it('files or refreshes only a report sidecar promotion-held issue (#2227)', () => {
    const f = step(JOB, FILE_ALERT)
    expect(f?.if).toContain("steps.sidecaralert.outputs.blocked == 'true'")
    expect(f?.run).toContain('--label promotion-held')
    expect(f?.run).toContain('Report sidecars held')
    expect(f?.run).toContain('steps.sidecaralert.outputs.body_file')
    expect(f?.env?.GH_TOKEN).toBe('${{ github.token }}')
  })

  it('auto-closes only the report sidecar issue, and only after a clean promote (#2227)', () => {
    const c = step(JOB, CLOSE_ALERT)
    expect(c?.if).toContain("steps.sidecaralert.outputs.promoted == 'true'")
    expect(c?.if).toContain("steps.promote.outcome == 'success'")
    expect(c?.run).toContain('Report sidecars held')
    expect(c?.run).toContain('gh issue close')
  })

  it('the main promotion’s alert steps leave the report sidecar issue alone (#2227)', () => {
    for (const name of [
      'File or refresh promotion-held issue',
      'Auto-close promotion-held issue on a promoting run',
    ]) {
      expect(step('pipeline', name)?.run, name).toContain(
        'Report sidecars held'
      )
    }
  })

  it('then gates completeness for the promoted dates, even after a failure', () => {
    const check = step(JOB, CHECK)
    expect(check?.run).toContain(
      'bash scripts/pipeline/check-report-sidecars.sh "${GCS_BUCKET}" "${GCS_BUCKET_PRODUCTION}" "${PROMOTED_DATES}"'
    )
    expect(check?.if).toContain('!cancelled()')
    expect(check?.if).toContain("needs.pipeline.outputs.promoted_dates != ''")
    expect(index(JOB, CHECK)).toBeGreaterThan(index(JOB, PROMOTE))
  })

  it('needs Node and the built contracts for the gate', () => {
    expect(steps(JOB).some(s => s.run === 'npm ci')).toBe(true)
    expect(
      steps(JOB).some(s =>
        (s.run ?? '').includes(
          'npm run build --workspace=@taverns-red/shared-contracts'
        )
      )
    ).toBe(true)
  })
})

describe('the old direct writers are gone (#1767)', () => {
  it('no step runs carry-report-sidecars.sh', () => {
    const all = Object.values(workflow.jobs).flatMap(j => j.steps ?? [])
    expect(all.some(s => (s.run ?? '').includes('carry-report-sidecars'))).toBe(
      false
    )
    expect(
      fs.existsSync(
        path.join(process.cwd(), 'scripts/pipeline/carry-report-sidecars.sh')
      )
    ).toBe(false)
  })
})
