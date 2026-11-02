/**
 * Cloud-session wiring (#2454, Phase 1).
 *
 * `.claude/settings.json` is committed, so it applies to Ron's local sessions
 * too. Both hooks must therefore do nothing unless `CLAUDE_CODE_REMOTE=true`:
 * local sessions already get the global Stop hook, and must not pay for an
 * `npm ci` on every start.
 *
 * Runs the real scripts with a stub `npm` on PATH that records each call.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = process.cwd()
const SETTINGS = resolve(ROOT, '.claude/settings.json')
const SETUP = resolve(ROOT, 'scripts/cloud-session-setup.sh')
const STOP = resolve(ROOT, 'scripts/cloud-session-stop-check.sh')

interface HookCommand {
  type: string
  command: string
  timeout?: number
}
interface HookGroup {
  matcher?: string
  hooks: HookCommand[]
}
interface Settings {
  permissions?: { allow?: string[]; deny?: string[] }
  hooks?: Record<string, HookGroup[]>
  env?: unknown
}

let dir: string
let stubBin: string
let npmLog: string

/** Env for a spawned hook: stub npm first on PATH, no inherited REMOTE flag. */
function hookEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: `${stubBin}:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin`,
    HOME: dir,
    NPM_LOG: npmLog,
    GIT_CONFIG_NOSYSTEM: '1',
    ...extra,
  }
}

function run(script: string, cwd: string, env: NodeJS.ProcessEnv) {
  return spawnSync('bash', [script], { cwd, env, encoding: 'utf8' })
}

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', args, { cwd, env: hookEnv(), encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cloud-session-'))
  stubBin = join(dir, 'bin')
  npmLog = join(dir, 'npm.log')
  mkdirSync(stubBin)
  const stub = join(stubBin, 'npm')
  writeFileSync(stub, '#!/usr/bin/env bash\necho "npm $*" >> "$NPM_LOG"\n')
  chmodSync(stub, 0o755)
  writeFileSync(
    join(dir, '.gitconfig'),
    '[user]\n\tname = Test\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n'
  )
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('.claude/settings.json', () => {
  it('parses and wires SessionStart and Stop to the cloud scripts', () => {
    const settings = JSON.parse(readFileSync(SETTINGS, 'utf8')) as Settings

    const start = settings.hooks?.SessionStart ?? []
    expect(start).toHaveLength(1)
    expect(start[0]?.matcher).toBe('startup|resume')
    expect(start[0]?.hooks[0]?.command).toBe(
      '"$CLAUDE_PROJECT_DIR"/scripts/cloud-session-setup.sh'
    )
    expect(start[0]?.hooks[0]?.timeout).toBeGreaterThanOrEqual(300)

    const stop = settings.hooks?.Stop ?? []
    expect(stop).toHaveLength(1)
    expect(stop[0]?.hooks[0]?.command).toBe(
      '"$CLAUDE_PROJECT_DIR"/scripts/cloud-session-stop-check.sh'
    )
    expect(stop[0]?.hooks[0]?.timeout).toBe(5)
  })

  it('only adds allow rules: no deny, no env block', () => {
    const settings = JSON.parse(readFileSync(SETTINGS, 'utf8')) as Settings
    expect(settings.permissions?.allow).toContain('Bash(gh api *)')
    expect(settings.permissions?.deny).toBeUndefined()
    expect(settings.env).toBeUndefined()
  })

  it('points at scripts that exist and are executable', () => {
    for (const script of [SETUP, STOP]) {
      expect(existsSync(script)).toBe(true)
      expect(statSync(script).mode & 0o111).not.toBe(0)
    }
  })
})

describe('hooks outside a cloud session', () => {
  it.each([
    ['setup', SETUP],
    ['stop check', STOP],
  ])('%s exits 0 silently without running npm', (_name, script) => {
    for (const remote of [undefined, 'false']) {
      const env = hookEnv(
        remote === undefined ? {} : { CLAUDE_CODE_REMOTE: remote }
      )
      const r = run(script, ROOT, env)
      expect(r.status).toBe(0)
      expect(r.stdout).toBe('')
      expect(r.stderr).toBe('')
    }
    expect(existsSync(npmLog)).toBe(false)
  })
})

describe('setup in a cloud session', () => {
  it('runs npm ci then the workspace builds from CLAUDE_PROJECT_DIR', () => {
    const r = run(
      SETUP,
      dir,
      hookEnv({ CLAUDE_CODE_REMOTE: 'true', CLAUDE_PROJECT_DIR: dir })
    )
    expect(r.status).toBe(0)
    const calls = readFileSync(npmLog, 'utf8').trim().split('\n')
    expect(calls[0]).toBe('npm ci')
    expect(calls.slice(1, 3)).toEqual([
      'npm run build:shared-contracts',
      'npm run build:analytics-core',
    ])
  })

  it('fails loudly when a step fails', () => {
    writeFileSync(
      join(stubBin, 'npm'),
      '#!/usr/bin/env bash\necho "npm $*" >> "$NPM_LOG"\n[[ "$*" == *analytics-core* ]] && exit 7\nexit 0\n'
    )
    const r = run(
      SETUP,
      dir,
      hookEnv({ CLAUDE_CODE_REMOTE: 'true', CLAUDE_PROJECT_DIR: dir })
    )
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/build:analytics-core/)
  })
})

/**
 * VM tooling (#2464). The VM image ships only byte-order locales (so the
 * lessons-index locale test, #1372, has no case-folding locale to compare)
 * and no yamllint (so the pre-commit `lint:yaml` exits 127).
 *
 * These runs use PATH = the stub dir only, so whatever is installed on the
 * machine running the tests can't decide the outcome. The script therefore
 * has to stick to bash builtins plus the commands stubbed here.
 */
describe('setup in a cloud session: VM tooling (#2464)', () => {
  let toolLog: string

  function stub(name: string, body: string) {
    const file = join(stubBin, name)
    writeFileSync(file, `#!/bin/bash\n${body}\n`)
    chmodSync(file, 0o755)
  }

  /** `locale -a` printing these names; every other tool call is logged. */
  function stubTools(locales: string[], { yamllint = false } = {}) {
    toolLog = join(dir, 'tools.log')
    // The shared npm stub's `#!/usr/bin/env bash` needs bash on PATH.
    stub('npm', 'echo "npm $*" >> "$NPM_LOG"')
    stub('locale', `printf '%s\\n' ${locales.map(l => `'${l}'`).join(' ')}`)
    stub('localedef', `echo "localedef $*" >> "${toolLog}"`)
    stub('python3', `echo "python3 $*" >> "${toolLog}"`)
    if (yamllint) stub('yamllint', 'exit 0')
  }

  function runIsolated() {
    return spawnSync('/bin/bash', [SETUP], {
      cwd: dir,
      env: {
        PATH: stubBin,
        HOME: dir,
        NPM_LOG: npmLog,
        CLAUDE_CODE_REMOTE: 'true',
        CLAUDE_PROJECT_DIR: dir,
      },
      encoding: 'utf8',
    })
  }

  const toolCalls = () =>
    existsSync(toolLog) ? readFileSync(toolLog, 'utf8').trim().split('\n') : []

  it('generates en_US.UTF-8 when only byte-order locales exist', () => {
    stubTools(['C', 'C.utf8', 'POSIX'], { yamllint: true })
    const r = runIsolated()
    expect(r.status).toBe(0)
    expect(toolCalls()).toEqual(['localedef -i en_US -f UTF-8 en_US.UTF-8'])
  })

  it('leaves the locales alone when en_US.UTF-8 is installed', () => {
    stubTools(['C', 'C.utf8', 'en_US.utf8', 'POSIX'], { yamllint: true })
    const r = runIsolated()
    expect(r.status).toBe(0)
    expect(toolCalls()).toEqual([])
  })

  it('installs yamllint for the user when it is missing', () => {
    stubTools(['C', 'en_US.utf8'])
    const r = runIsolated()
    expect(r.status).toBe(0)
    expect(toolCalls()).toEqual(['python3 -m pip install --user yamllint'])
  })

  it('fails loudly when a tool install fails', () => {
    stubTools(['C'], { yamllint: true })
    stub('localedef', 'exit 4')
    const r = runIsolated()
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/en_US\.UTF-8/)
    expect(existsSync(npmLog)).toBe(false)
  })
})

describe('stop check in a cloud session', () => {
  function cloneWithUpstream(): string {
    const bare = join(dir, 'remote.git')
    const work = join(dir, 'work')
    git(dir, 'init', '--bare', '-b', 'main', bare)
    git(dir, 'clone', bare, work)
    git(work, 'commit', '--allow-empty', '-m', 'base')
    git(work, 'push', '-u', 'origin', 'main')
    return work
  }

  it('reports unpushed commits', () => {
    const work = cloneWithUpstream()
    git(work, 'commit', '--allow-empty', '-m', 'local only')
    const r = run(STOP, work, hookEnv({ CLAUDE_CODE_REMOTE: 'true' }))
    expect(r.status).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({
      systemMessage: '⚠️  git: main has 1 unpushed commit(s)',
    })
  })

  it('reports a branch with no upstream', () => {
    const work = cloneWithUpstream()
    git(work, 'checkout', '-b', 'feature')
    const r = run(STOP, work, hookEnv({ CLAUDE_CODE_REMOTE: 'true' }))
    expect(r.status).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({
      systemMessage:
        '⚠️  git: feature has no upstream — did you forget to push?',
    })
  })

  it('stays silent when in sync', () => {
    const work = cloneWithUpstream()
    const r = run(STOP, work, hookEnv({ CLAUDE_CODE_REMOTE: 'true' }))
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })
})

describe('CLAUDE.md', () => {
  it('carries the rules every session must follow', () => {
    const md = readFileSync(resolve(ROOT, 'CLAUDE.md'), 'utf8')
    expect(md.includes('## Rules for every session (local and cloud)')).toBe(
      true
    )
    expect(md.includes('docs/cloud-sessions.md')).toBe(true)
  })
})
