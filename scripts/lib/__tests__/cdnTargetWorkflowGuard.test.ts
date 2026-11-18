/**
 * Guard (#2974): every workflow step that runs a target-reading script
 * names its target explicitly (CDN_BASE_URL, BASE_URL, MANIFEST_URL as the
 * script needs). A step that relies on a script's old prod fallback, or on
 * an input that can be empty, fails here. The matching rules, per command
 * and per script, live in ../workflowTargetCheck.ts.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import { TARGET_SCRIPTS, targetProblems } from '../workflowTargetCheck.js'

interface Step {
  name?: string
  run?: string
  env?: Record<string, string>
}

const dir = path.resolve(process.cwd(), '.github/workflows')
const invocations: { file: string; step: Step }[] = []
for (const file of fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f))) {
  const wf = parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as {
    env?: Record<string, string>
    jobs?: Record<string, { env?: Record<string, string>; steps?: Step[] }>
  }
  for (const job of Object.values(wf.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      const run = step.run ?? ''
      if (TARGET_SCRIPTS.some(s => run.includes(`scripts/${s.file}`))) {
        invocations.push({
          file,
          step: { ...step, env: { ...wf.env, ...job.env, ...step.env } },
        })
      }
    }
  }
}

describe('workflows pass the target explicitly (#2974)', () => {
  it('finds the known invocations', () => {
    expect(invocations.length).toBeGreaterThanOrEqual(6)
  })

  it.each(invocations.map(i => [`${i.file}: ${i.step.name}`, i.step]))(
    '%s names the target of every script it runs',
    (_label, step) => {
      const { run, env } = step as Step
      // A bare `${{ inputs.x }}` can be empty, which the script refuses.
      expect(targetProblems(run ?? '', env ?? {})).toEqual([])
    }
  )
})
