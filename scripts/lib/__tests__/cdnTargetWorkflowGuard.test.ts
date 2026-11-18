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
import {
  TARGET_SCRIPTS,
  buildTargetProblems,
  targetProblems,
} from '../workflowTargetCheck.js'

interface Step {
  name?: string
  run?: string
  env?: Record<string, string>
}

const dir = path.resolve(process.cwd(), '.github/workflows')
const invocations: { file: string; step: Step }[] = []
const builds: { file: string; step: Step }[] = []
for (const file of fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f))) {
  const wf = parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as {
    env?: Record<string, string>
    jobs?: Record<string, { env?: Record<string, string>; steps?: Step[] }>
  }
  for (const job of Object.values(wf.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      const run = step.run ?? ''
      const withEnv = { ...step, env: { ...wf.env, ...job.env, ...step.env } }
      if (/\bnpm run build:frontend\b/.test(run)) {
        builds.push({ file, step: withEnv })
      }
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

describe('every frontend build names its CDN target (#2982)', () => {
  it('finds the known build steps', () => {
    // ci.yml, deploy.yml, lighthouse-ci.yml, pr-preview.yml
    expect(builds.length).toBeGreaterThanOrEqual(4)
  })

  it.each(builds.map(i => [`${i.file}: ${i.step.name}`, i.step]))(
    '%s sets VITE_CDN_BASE_URL to a literal URL',
    (_label, step) => {
      const { run, env } = step as Step
      expect(buildTargetProblems(run ?? '', env ?? {})).toEqual([])
    }
  )

  it.each([
    'npm run-script build:frontend',
    'npm --prefix . run build:frontend',
    'npm --prefix=. run-script build:frontend',
    'npm run build:frontend --workspace=frontend',
    'npm run --silent build:frontend',
    'npm run-script --prefix . build:frontend',
    'npm -s run build:frontend',
    'CI=true npm run build:frontend',
  ])('flags `%s` with no target (#2987)', cmd => {
    expect(buildTargetProblems(cmd, {})).toHaveLength(1)
    expect(
      buildTargetProblems(`VITE_CDN_BASE_URL=https://x.example ${cmd}`, {})
    ).toEqual([])
    expect(
      buildTargetProblems(cmd, { VITE_CDN_BASE_URL: 'https://x.example' })
    ).toEqual([])
  })

  it('does not flag other npm commands (#2987)', () => {
    for (const cmd of [
      'npm run build --workspace=frontend',
      'npm run build:analytics-core',
      'echo build:frontend',
    ]) {
      expect(buildTargetProblems(cmd, {})).toEqual([])
    }
  })

  it('flags a build step with no target', () => {
    expect(buildTargetProblems('npm run build:frontend', {})).toHaveLength(1)
    expect(
      buildTargetProblems('npm run build:frontend', {
        VITE_CDN_BASE_URL: '${{ vars.CDN }}',
      })
    ).toHaveLength(1)
    expect(
      buildTargetProblems(
        'VITE_CDN_BASE_URL=https://cdn-staging.taverns.red npm run build:frontend',
        {}
      )
    ).toEqual([])
  })
})
