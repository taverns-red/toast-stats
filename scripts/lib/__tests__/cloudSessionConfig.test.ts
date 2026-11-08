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
  symlinkSync,
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
  permissions?: { allow?: string[]; ask?: string[]; deny?: string[] }
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
  // Shadow the tools setup may install (#2467) so no test runs the real
  // pip or localedef: by default both already look present.
  const present: Record<string, string> = {
    yamllint: '',
    locale: 'printf "C\\nen_US.utf8\\n"',
    pip: 'exit 0',
    localedef: 'exit 0',
  }
  for (const [name, body] of Object.entries(present)) {
    writeFileSync(join(stubBin, name), `#!/usr/bin/env bash\n${body}\n`)
    chmodSync(join(stubBin, name), 0o755)
  }
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

  it('adds allow and ask rules only: no deny, no env block', () => {
    const settings = JSON.parse(readFileSync(SETTINGS, 'utf8')) as Settings
    expect(settings.permissions?.allow).toContain('Bash(gh api *)')
    expect(settings.permissions?.deny).toBeUndefined()
    expect(settings.env).toBeUndefined()
  })

  // #2532: `gh api *` is allowed, so without these a local agent could edit
  // the ruleset, protection, collaborators, secrets, variables, webhooks or
  // deploy keys with no prompt. ask beats allow (deny > ask > allow).
  it('asks before gh api admin paths and every PUT, PATCH and DELETE', () => {
    const settings = JSON.parse(readFileSync(SETTINGS, 'utf8')) as Settings
    const ask = settings.permissions?.ask ?? []
    const paths = [
      'protection',
      'rulesets',
      'collaborators',
      'actions/secrets',
      'actions/variables',
      'hooks',
      'keys',
    ]
    for (const path of paths) {
      expect(ask).toContain(`Bash(gh api *${path}*)`)
    }
    for (const method of ['DELETE', 'PUT', 'PATCH']) {
      expect(ask).toContain(`Bash(gh api *-X ${method}*)`)
      expect(ask).toContain(`Bash(gh api *--method ${method}*)`)
      expect(ask).toContain(`Bash(gh api *-X${method}*)`)
    }
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
 * Tool gaps the first cloud worker hit by hand (#2467): `yamllint` (the
 * pre-commit hook runs `npm run lint:yaml`) and a case-folding locale
 * (`lessonsIndexLocale.test.ts` needs one besides C/POSIX).
 *
 * These run with PATH = stubs only, so a yamllint installed on the host
 * (Homebrew, the CI runner image) can't leak in, and the real `pip` and
 * `localedef` never run.
 */
describe('setup provides yamllint and a case-folding locale (#2467)', () => {
  let toolLog: string

  function stub(name: string, body = ''): void {
    const file = join(stubBin, name)
    writeFileSync(
      file,
      `#!${BASH}\necho "${name} $*" >> "$TOOL_LOG"\n${body}\n`
    )
    chmodSync(file, 0o755)
  }

  const BASH = spawnSync('bash', ['-c', 'command -v bash'], {
    encoding: 'utf8',
  }).stdout.trim()

  function setupEnv(): NodeJS.ProcessEnv {
    return {
      PATH: stubBin,
      HOME: dir,
      NPM_LOG: npmLog,
      TOOL_LOG: toolLog,
      CLAUDE_CODE_REMOTE: 'true',
      CLAUDE_PROJECT_DIR: dir,
    }
  }

  function toolCalls(): string[] {
    return existsSync(toolLog)
      ? readFileSync(toolLog, 'utf8').trim().split('\n')
      : []
  }

  beforeEach(() => {
    toolLog = join(dir, 'tools.log')
    symlinkSync(BASH, join(stubBin, 'bash'))
    rmSync(join(stubBin, 'yamllint'))
    stub('pip')
    stub('localedef')
    stub('locale', 'printf "C\\nC.utf8\\nPOSIX\\n"')
  })

  it('installs yamllint with pip when it is missing', () => {
    const r = spawnSync(BASH, [SETUP], { cwd: dir, env: setupEnv() })
    expect(r.status).toBe(0)
    expect(toolCalls()).toContain('pip install --user --quiet yamllint')
  })

  it('generates en_US.UTF-8 when only byte-order locales exist', () => {
    const r = spawnSync(BASH, [SETUP], { cwd: dir, env: setupEnv() })
    expect(r.status).toBe(0)
    expect(toolCalls()).toContain('localedef -i en_US -f UTF-8 en_US.UTF-8')
  })

  it('is idempotent: skips both when already present', () => {
    stub('yamllint')
    stub('locale', 'printf "C\\nC.utf8\\nen_US.utf8\\nPOSIX\\n"')
    const r = spawnSync(BASH, [SETUP], { cwd: dir, env: setupEnv() })
    expect(r.status).toBe(0)
    const calls = toolCalls()
    expect(calls.some(c => c.startsWith('pip '))).toBe(false)
    expect(calls.some(c => c.startsWith('localedef '))).toBe(false)
  })

  it('fails loudly when the yamllint install fails', () => {
    stub('pip', 'exit 3')
    const r = spawnSync(BASH, [SETUP], {
      cwd: dir,
      env: setupEnv(),
      encoding: 'utf8',
    })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/yamllint/)
  })

  it('is documented in docs/cloud-sessions.md', () => {
    const md = readFileSync(resolve(ROOT, 'docs/cloud-sessions.md'), 'utf8')
    expect(md).toMatch(/yamllint/)
    expect(md).toMatch(/en_US\.UTF-8/)
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
