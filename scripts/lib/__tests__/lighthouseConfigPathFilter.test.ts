/**
 * Workflow contract: every Lighthouse config triggers the gate that runs it
 * (#1994).
 *
 * A workflow with a `pull_request.paths` filter only runs when a changed file
 * matches. `lighthouserc.mobile.js` was not in `pr-preview.yml`'s filter, so a
 * PR that changed only the mobile budgets (#1991) merged without the gate
 * ever evaluating them. This test reads the YAML so the guard cannot drift:
 * - every `lighthouserc*.js` at the repo root is run by some workflow, and
 * - each workflow that runs a config (`configPath`) lists it in its paths, and
 * - each repo file the config's `startServerCommand` starts is in those paths
 *   too (#2000: `scripts/lighthouse-cdn-server.mjs` was not).
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import * as fs from 'node:fs'
import * as path from 'node:path'
import picomatch from 'picomatch'
import { parse } from 'yaml'

const ROOT = process.cwd()
const WORKFLOWS = path.join(ROOT, '.github/workflows')

interface Step {
  with?: Record<string, unknown>
}
interface Workflow {
  on?: { pull_request?: { paths?: string[] } }
  jobs?: Record<string, { steps?: Step[] }>
}

const configs = fs
  .readdirSync(ROOT)
  .filter(f => /^lighthouserc.*\.js$/.test(f))
  .sort()

const workflows = fs
  .readdirSync(WORKFLOWS)
  .filter(f => /\.ya?ml$/.test(f))
  .map(f => ({
    file: f,
    wf: parse(fs.readFileSync(path.join(WORKFLOWS, f), 'utf-8')) as Workflow,
  }))

/** Config files a workflow runs via a step's `with.configPath`. */
function configsRunBy(wf: Workflow): string[] {
  return Object.values(wf.jobs ?? {})
    .flatMap(j => j.steps ?? [])
    .map(s => s.with?.['configPath'])
    .filter((p): p is string => typeof p === 'string')
    .map(p => path.posix.normalize(p))
}

interface LhciConfig {
  ci?: { collect?: { startServerCommand?: string } }
}

/** Repo files named in a config's `startServerCommand`. */
function filesStartedBy(config: string): string[] {
  const req = createRequire(path.join(ROOT, config))
  const cfg = req(path.join(ROOT, config)) as LhciConfig
  const cmd = cfg.ci?.collect?.startServerCommand
  if (!cmd) return []
  return cmd
    .split(/\s+/)
    .map(t => path.posix.normalize(t))
    .filter(t => !t.startsWith('-') && !t.startsWith('/'))
    .filter(t => fs.existsSync(path.join(ROOT, t)))
    .filter(t => fs.statSync(path.join(ROOT, t)).isFile())
}

function triggers(wf: Workflow, file: string): boolean {
  const paths = wf.on?.pull_request?.paths
  if (!paths) return true // no filter: runs on every PR
  return paths.some(glob => picomatch(glob, { dot: true })(file))
}

describe('Lighthouse config path filters (#1994)', () => {
  it('finds the Lighthouse configs', () => {
    expect(configs).toContain('lighthouserc.js')
    expect(configs).toContain('lighthouserc.mobile.js')
  })

  it.each(configs)('%s is run by at least one workflow', config => {
    const runners = workflows.filter(w => configsRunBy(w.wf).includes(config))
    expect(runners.map(r => r.file)).not.toEqual([])
  })

  it.each(configs)('%s triggers every workflow that runs it', config => {
    const missing = workflows
      .filter(w => configsRunBy(w.wf).includes(config))
      .filter(w => !triggers(w.wf, config))
      .map(w => w.file)
    expect(missing).toEqual([])
  })

  it('lighthouserc.js starts the CDN fixture server', () => {
    expect(filesStartedBy('lighthouserc.js')).toEqual([
      'scripts/lighthouse-cdn-server.mjs',
    ])
  })

  it.each(configs)(
    'files %s starts trigger every workflow that runs it (#2000)',
    config => {
      const started = filesStartedBy(config)
      const missing = workflows
        .filter(w => configsRunBy(w.wf).includes(config))
        .flatMap(w =>
          started.filter(f => !triggers(w.wf, f)).map(f => `${w.file}: ${f}`)
        )
      expect(missing).toEqual([])
    }
  )

  it('every workflow that runs a Lighthouse config triggers on its own changes', () => {
    const missing = workflows
      .filter(w => configsRunBy(w.wf).length > 0)
      .filter(w => !triggers(w.wf, `.github/workflows/${w.file}`))
      .map(w => w.file)
    expect(missing).toEqual([])
  })
})
