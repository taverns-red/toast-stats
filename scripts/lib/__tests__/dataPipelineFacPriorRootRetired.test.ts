/**
 * #2962 — the `fac_prior_root` rebuild input is retired. It let a rebuild read
 * the #2239 recovery bucket, which the pipeline's own identity (#2960) cannot
 * read, so a run that passed it would fail. The recovery work it supported is
 * finished. The workflow and the pipeline scripts must not name the input or
 * the bucket again.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const REPO = process.cwd()
const WORKFLOW = path.join(REPO, '.github/workflows/data-pipeline.yml')
const PIPELINE_DIR = path.join(REPO, 'scripts/pipeline')

const workflowText = fs.readFileSync(WORKFLOW, 'utf-8')
const workflow = parse(workflowText) as {
  on: { workflow_dispatch: { inputs: Record<string, unknown> } }
  jobs: Record<string, { steps?: { id?: string; env?: object }[] }>
}

describe('data-pipeline.yml: fac_prior_root is gone (#2962)', () => {
  it('is not a dispatch input', () => {
    expect(workflow.on.workflow_dispatch.inputs).not.toHaveProperty(
      'fac_prior_root'
    )
  })

  it('is not read, validated, passed on or logged anywhere in the workflow', () => {
    expect(workflowText).not.toMatch(/fac_prior_root|FAC_PRIOR_ROOT/i)
    expect(workflowText).not.toContain('fac-prior-root')
    expect(workflowText).not.toContain('fac-recovery-2239')
  })

  it('leaves the Determine-mode step with no free-text input env', () => {
    const mode = workflow.jobs['pipeline']?.steps?.find(s => s.id === 'mode')
    expect(mode).toBeDefined()
    expect(mode?.env).toBeUndefined()
  })
})

describe('the pipeline scripts no longer reach the recovery bucket (#2962)', () => {
  it('has no fac-prior-root.sh validator', () => {
    expect(fs.existsSync(path.join(PIPELINE_DIR, 'fac-prior-root.sh'))).toBe(
      false
    )
  })

  it('names neither the variable nor the recovery bucket in any script', () => {
    const scripts = fs
      .readdirSync(PIPELINE_DIR)
      .filter(f => f.endsWith('.sh') || f.endsWith('.ts'))
    expect(scripts).toContain('process-dates.sh')
    for (const f of scripts) {
      const text = fs.readFileSync(path.join(PIPELINE_DIR, f), 'utf-8')
      expect(text, f).not.toMatch(/fac[_-]prior[_-]root/i)
      expect(text, f).not.toContain('fac-recovery-2239')
    }
  })
})
