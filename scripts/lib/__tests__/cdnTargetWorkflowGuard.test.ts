/**
 * Guard (#2974): every workflow step that runs a CDN-reading script sets
 * its target explicitly. A step that relies on the script's old prod
 * fallback, or on an input that can be empty, fails here.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const SCRIPTS = [
  'check-cdn-schema.ts',
  'hosting-smoke.ts',
  'cdn-compression-check.ts',
]

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
      if (SCRIPTS.some(s => new RegExp(`scripts/${s}`).test(run))) {
        invocations.push({
          file,
          step: { ...step, env: { ...wf.env, ...job.env, ...step.env } },
        })
      }
    }
  }
}

describe('workflows pass the CDN target explicitly (#2974)', () => {
  it('finds the known invocations', () => {
    expect(invocations.length).toBeGreaterThanOrEqual(5)
  })

  it.each(invocations.map(i => [`${i.file}: ${i.step.name}`, i.step]))(
    '%s sets CDN_BASE_URL to a literal URL or a literal fallback',
    (_label, step) => {
      const run = (step as Step).run ?? ''
      const v = (step as Step).env?.['CDN_BASE_URL']
      const inline =
        /CDN_BASE_URL=https?:\/\//.test(run) || /--base\s+https?:\/\//.test(run)
      // A bare `${{ inputs.x }}` can be empty, which the script refuses.
      expect(
        inline ||
          /^https?:\/\//.test(v ?? '') ||
          /\|\|\s*'https?:\/\//.test(v ?? '')
      ).toBe(true)
    }
  )
})
