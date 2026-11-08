/**
 * Cloud-session guard: a whole-command allow list (#2547), ported from the
 * red-rostrum#75 template (d34b15a).
 *
 * A blocklist over shell can't be sound: shell keywords, grouping, brace
 * expansion and substitutions each voided rules the earlier guard had
 * (`{cat,/etc/passwd}`, `if true; then …; fi`). So in a cloud session a Bash
 * call is allowed only when it is one simple command of literal words, or
 * an `&&` chain of them, matching an exact shape. Every deny entry in
 * scripts/fixtures/guard-bypass-corpus.json must exit 2 and every allow
 * entry exit 0, run against a fixture repository on the session branch
 * with planted symlinks, secret-shaped files and gitignored files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync, execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = process.cwd()
const GUARD = resolve(ROOT, 'scripts/cloud-session-guard.sh')
const REPO = 'taverns-red/toast-stats'
const BRANCH = 'feat/2547-session'

const corpus = JSON.parse(
  readFileSync(
    resolve(ROOT, 'scripts/fixtures/guard-bypass-corpus.json'),
    'utf8'
  )
) as {
  deny: string[]
  allow: string[]
  writeDeny: string[]
  writeAllow: string[]
}

const fill = (s: string) =>
  s.replaceAll('{{REPO}}', REPO).replaceAll('{{BRANCH}}', BRANCH)

let F = '' // fixture repository on the session branch, the session root

function run(command: string, remote = 'true', cwd = F) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: homedir(),
    CLAUDE_PROJECT_DIR: F,
  }
  if (remote !== '') env.CLAUDE_CODE_REMOTE = remote
  return spawnSync('bash', [GUARD], {
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command },
      cwd,
    }),
    cwd,
    env,
    encoding: 'utf8',
  })
}

beforeAll(() => {
  F = realpathSync(mkdtempSync(join(tmpdir(), 'guard-2547-corpus-')))
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', F, ...a], {
      stdio: 'pipe',
      env: { PATH: process.env.PATH ?? '', GIT_CONFIG_NOSYSTEM: '1' },
    })
  git('init', '-q', '-b', BRANCH)
  git(
    '-c',
    'user.name=T',
    '-c',
    'user.email=t@e.x',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'base'
  )
  git('remote', 'add', 'origin', `https://github.com/${REPO}.git`)
  const put = (p: string, text = 'x\n') => {
    mkdirSync(join(F, p, '..'), { recursive: true })
    writeFileSync(join(F, p), text)
  }
  put('.gitignore', 'node_modules/\ndist/\ncoverage/\nnotes-private.txt\n')
  for (const p of [
    'README.md',
    'CLAUDE.md',
    'package.json',
    'pr-body.md',
    'report.md',
    'comment.json',
    'src/a.ts',
    'sub/x.ts',
    'docs/x.md',
    'scripts/x.ts',
    'frontend/src/x.ts',
    '.env',
    '.env.local',
    'sub/.env.production',
    'key.pem',
    'id.key',
    'notes-private.txt',
    'node_modules/pkg/index.js',
    'dist/a.js',
    'coverage/lcov.info',
  ])
    put(p)
  symlinkSync('/etc/passwd', join(F, 'link'))
  symlinkSync(homedir(), join(F, 'homelink'))
  symlinkSync(join(F, '.git'), join(F, 'gitlink'))
})

afterAll(() => rmSync(F, { recursive: true, force: true }))

describe('the bypass corpus (scripts/fixtures/guard-bypass-corpus.json)', () => {
  it('keeps the template cases and ours', () => {
    expect(corpus.deny.length).toBeGreaterThanOrEqual(370)
    expect(corpus.allow.length).toBeGreaterThanOrEqual(130)
  })

  it.each(corpus.deny.map(c => [JSON.stringify(c), c]))(
    'denies %s',
    (_label, command) => {
      const r = run(fill(command))
      expect(r.status, `${command}\n${r.stderr}`).toBe(2)
      expect(r.stderr).toMatch(/Ron/)
    }
  )

  it.each(corpus.allow.map(c => [JSON.stringify(c), c]))(
    'allows %s',
    (_label, command) => {
      const r = run(fill(command))
      expect(r.stderr, command).toBe('')
      expect(r.status, command).toBe(0)
    }
  )
})

function fileTool(tool: string, path: string) {
  return spawnSync('bash', [GUARD], {
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: tool,
      tool_input: {
        file_path: join(F, path),
        content: 'x',
        old_string: 'a',
        new_string: 'b',
      },
      cwd: F,
    }),
    cwd: F,
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: homedir(),
      CLAUDE_PROJECT_DIR: F,
      CLAUDE_CODE_REMOTE: 'true',
    },
    encoding: 'utf8',
  })
}

describe('file tools: secret-shaped files and config other tools act on', () => {
  const tools = ['Write', 'Edit', 'MultiEdit']
  it.each(corpus.writeDeny.flatMap(p => tools.map(t => [t, p])))(
    'refuses %s of %s',
    (tool, path) => {
      const r = fileTool(tool, path)
      expect(r.status, `${tool} ${path}\n${r.stderr}`).toBe(2)
      expect(r.stderr).toMatch(/Ron/)
    }
  )
  it.each(corpus.writeAllow.flatMap(p => tools.map(t => [t, p])))(
    'allows %s of %s',
    (tool, path) => {
      const r = fileTool(tool, path)
      expect(r.stderr, `${tool} ${path}`).toBe('')
      expect(r.status).toBe(0)
    }
  )
})

describe('around the corpus', () => {
  it('pushes only from the repository root', () => {
    expect(run(`git push origin HEAD:${BRANCH}`).status).toBe(0)
    expect(
      run(`git push origin HEAD:${BRANCH}`, 'true', join(F, 'sub')).status
    ).toBe(2)
  })

  it('refuses a command over the size cap', () => {
    expect(run(`echo ${'a'.repeat(5000)}`).status).toBe(2)
  })

  it.each([
    'cat /etc/passwd',
    'env',
    '{cat,/etc/passwd}',
    'git push origin HEAD:main',
  ])('is a no-op outside a cloud session: %s', command => {
    for (const remote of ['', 'false']) {
      const r = run(command, remote)
      expect(r.status).toBe(0)
      expect(r.stderr).toBe('')
    }
  })
})
