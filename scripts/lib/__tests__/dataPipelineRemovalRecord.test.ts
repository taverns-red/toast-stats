/**
 * Workflow contract: the prod removal record and the run mode (#2856).
 *
 * The pipeline job publishes runs/<id>/prod-removed.jsonl (what the promoter
 * removed from prod on purpose); both restore jobs read it into the plan; and
 * every restore decision step is told the run mode, so execute can be limited
 * to daily and rebuild. This pins the wiring; the logic is unit-tested in
 * dataRestorePlanDeletions, dataAutoRestoreRunMode and promoteRunManifest.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  env?: Record<string, string>
}
interface Job {
  steps?: Step[]
}

const workflow = parse(
  fs.readFileSync(
    path.resolve(process.cwd(), '.github/workflows/data-pipeline.yml'),
    'utf-8'
  )
) as { env: Record<string, string>; jobs: Record<string, Job> }

const pipeline = workflow.jobs['pipeline']!.steps ?? []
const decide = workflow.jobs['data-auto-restore-decide']!.steps ?? []
const execute = workflow.jobs['data-auto-restore-execute']!.steps ?? []
const idx = (steps: Step[], id: string) => steps.findIndex(s => s.id === id)

describe('the pipeline job records and publishes its prod removals (#2856)', () => {
  it('names the record file once, for the promoter', () => {
    expect(workflow.env['PROD_REMOVALS_FILE']).toMatch(/prod-removed\.jsonl$/)
  })

  const publish = pipeline.find(s =>
    /prod-removed\.jsonl/.test(s.run ?? '')
  ) as Step | undefined

  it('publishes it to the run folder in STAGING, after both promoters', () => {
    expect(publish).toBeDefined()
    expect(publish!.run).toMatch(
      /gs:\/\/\$\{GCS_BUCKET\}\/runs\/\$\{GITHUB_RUN_ID\}\/prod-removed\.jsonl/
    )
    expect(publish!.run).not.toMatch(/GCS_BUCKET_PRODUCTION/)
    const at = pipeline.indexOf(publish!)
    expect(at).toBeGreaterThan(idx(pipeline, 'promotemanifest'))
    expect(at).toBeGreaterThan(idx(pipeline, 'prunepromote'))
  })

  it('runs after a failed promote too, since the record is written before each removal', () => {
    expect(publish!.if).toMatch(/!cancelled\(\)/)
  })

  it('publishes only when something was removed', () => {
    expect(publish!.run).toMatch(/-s "\$\{PROD_REMOVALS_FILE\}"/)
  })

  it('names the record by attempt, so a re-run does not overwrite it (#2903)', () => {
    expect(publish!.run).toMatch(
      /runs\/\$\{GITHUB_RUN_ID\}\/prod-removed-a\$\{GITHUB_RUN_ATTEMPT\}\.jsonl/
    )
  })
})

describe('the promote-reports job publishes its own record (#2903)', () => {
  const steps = workflow.jobs['promote-reports']!.steps ?? []
  const publish = steps.find(s => /prod-removed/.test(s.run ?? '')) as
    Step | undefined

  it('has a publish step after its promote, even after a failed one', () => {
    expect(publish).toBeDefined()
    expect(steps.indexOf(publish!)).toBeGreaterThan(
      steps.findIndex(s => /promote-run-manifest\.ts/.test(s.run ?? ''))
    )
    expect(publish!.if).toMatch(/!cancelled\(\)/)
  })

  it('publishes to STAGING, by attempt, only when something was removed', () => {
    expect(publish!.run).toMatch(
      /gs:\/\/\$\{GCS_BUCKET\}\/runs\/\$\{GITHUB_RUN_ID\}\/prod-removed-reports-a\$\{GITHUB_RUN_ATTEMPT\}\.jsonl/
    )
    expect(publish!.run).not.toMatch(/GCS_BUCKET_PRODUCTION/)
    expect(publish!.run).toMatch(/-s "\$\{PROD_REMOVALS_FILE\}"/)
  })
})

describe('the og-cards job cannot remove from prod without a record (#2903)', () => {
  const steps = workflow.jobs['og-cards']!.steps ?? []
  const text = steps.map(s => s.run ?? '').join('\n')

  it('uploads only under og/v1/district/ unless it also publishes a removal record', () => {
    // Its manifest holds og/v1/district/<id>.png only. Dated paths
    // (snapshots/<date>/...) are what a gap or prune removal acts on; if the
    // job ever writes them, it must publish its record like the other jobs.
    const uploads = [
      ...text.matchAll(/gcs-upload\.sh[^\n]*\n(?:[^\n]*\\\n)*[^\n]*/g),
    ].map(m => m[0])
    expect(uploads.length).toBeGreaterThan(0)
    const dated = uploads.some(u =>
      /gs:\/\/\$\{GCS_BUCKET\}\/(?!og\/v1\/district\/)/.test(u)
    )
    const publishes = /prod-removed/.test(text)
    expect(dated && !publishes).toBe(false)
  })

  it('the guard itself catches a dated upload with no publish step', () => {
    const sample =
      'bash scripts/pipeline/gcs-upload.sh og-cards cp \\\n  x.png "gs://${GCS_BUCKET}/snapshots/${DATE}/"'
    expect(/gs:\/\/\$\{GCS_BUCKET\}\/(?!og\/v1\/district\/)/.test(sample)).toBe(
      true
    )
  })
})

describe('both restore jobs read the record into the plan (#2856)', () => {
  const stepsOf = (job: string) => (job === 'decide' ? decide : execute)
  const planSteps = [
    ['decide', 'enumerate'],
    ['execute', 'plan'],
  ]
  const planStep = (job: string, id: string) =>
    stepsOf(job)[idx(stepsOf(job), id)]!

  it.each(planSteps)(
    '%s job: reads it and passes it to the planner',
    (job, id) => {
      const s = planStep(job!, id!)
      expect(s.run).toMatch(
        /read-prod-removals\.sh[^\n]*\$\{W\}\/removed\.jsonl/
      )
      expect(s.run).toMatch(/plan-data-restore\.ts[^]*--removals/)
    }
  )

  it.each(planSteps)(
    '%s job: a record that exists but cannot be read stops the plan',
    (job, id) => {
      // Absent is an empty record; a read failure is not (it would turn a
      // deliberate removal into an unexplained, restorable one).
      // The reading, and the absent-versus-unreadable rule, are in
      // scripts/pipeline/read-prod-removals.sh (readProdRemovals.test.ts).
      expect(planStep(job!, id!).run).toMatch(/read-prod-removals\.sh/)
    }
  )

  it('the execute step re-plans with the same record', () => {
    const s = execute[idx(execute, 'execute')]!
    expect(s.run).toMatch(/--execute[^]*--removals/)
  })
})

describe('every restore decision step is told the run mode (#2856)', () => {
  it.each([
    ['decide', 'intent'],
    ['execute', 'decide'],
    ['execute', 'report'],
  ])('%s job step %s gets RUN_MODE from the pipeline job', (job, id) => {
    const steps = job === 'decide' ? decide : execute
    expect(steps[idx(steps, id!)]!.env?.['RUN_MODE']).toBe(
      '${{ needs.pipeline.outputs.mode }}'
    )
  })
})
