import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gitEnv } from './gitEnv'

/*
 * The pre-push hook exports GIT_DIR and friends. A child git that inherits
 * them works on the hook's repository, not its cwd, so a test's `git init`
 * or `git config` can rewrite the shared .git/config (core.bare=true and a
 * fake [user] in red-vote and RT Vote). Read-only spawns read the wrong
 * repository: the same defect, smaller blast radius, so no exception.
 *
 * Sees: a child_process call whose first argument is the literal "git".
 * Can't see: git reached through a variable or inside a launched shell
 * script; those scripts must unset GIT_* themselves. A line holding a
 * command string that is only data marks itself `// not-a-git-spawn`.
 */

const repoRoot = join(__dirname, '..', '..', '..')

const SPAWNER =
  /\b(execFileSync|execFile|spawnSync|spawn|execSync|exec)\(\s*(["'`])git[\s"'`]/g

function callText(source: string, open: number): string {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const c = source[i]
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) return source.slice(open, i + 1)
  }
  return source.slice(open)
}

export function findGitSpawnsWithoutCleanEnv(
  source: string
): { line: number; excerpt: string }[] {
  const findings: { line: number; excerpt: string }[] = []
  for (const m of source.matchAll(SPAWNER)) {
    const open = m.index! + m[1]!.length
    if (/\benv\s*:\s*gitEnv\(/.test(callText(source, open))) continue
    const lineEnd = source.indexOf('\n', m.index)
    const line = source.slice(
      source.lastIndexOf('\n', m.index) + 1,
      lineEnd === -1 ? undefined : lineEnd
    )
    if (line.includes('// not-a-git-spawn')) continue
    findings.push({
      line: source.slice(0, m.index).split('\n').length,
      excerpt: source.slice(m.index, m.index! + 60).split('\n')[0]!,
    })
  }
  return findings
}

function testFiles(): string[] {
  const out = execFileSync(
    'git',
    ['-C', repoRoot, 'ls-files', '-z', '--', 'scripts'],
    { encoding: 'utf8', env: gitEnv(), maxBuffer: 64 * 1024 * 1024 }
  )
  return out
    .split('\0')
    .filter(f => /\/__tests__\/.*\.(m|c)?ts$/.test(f))
    .filter(f => !f.includes('/fixtures/'))
}

describe('tests that spawn git pass an env without GIT_*', () => {
  it('scans a non-trivial population', () => {
    expect(testFiles().length).toBeGreaterThan(100)
  })

  it('every git spawn in a test passes env: gitEnv(...)', () => {
    const offences: string[] = []
    for (const file of testFiles()) {
      for (const f of findGitSpawnsWithoutCleanEnv(
        readFileSync(join(repoRoot, file), 'utf8')
      )) {
        offences.push(`${file}:${f.line}  ${f.excerpt}`)
      }
    }
    expect(
      offences,
      'pass env: gitEnv() from scripts/lib/__tests__/gitEnv.ts'
    ).toEqual([])
  })

  it('flags a bare spawn and accepts one with gitEnv', () => {
    expect(
      findGitSpawnsWithoutCleanEnv("execFileSync('git', ['init'])") // not-a-git-spawn
    ).toHaveLength(1)
    expect(
      findGitSpawnsWithoutCleanEnv(
        "execFileSync('git', ['init'], { env: gitEnv() })"
      )
    ).toEqual([])
    expect(
      findGitSpawnsWithoutCleanEnv(
        "`execSync('git push')`, // not-a-git-spawn: guard input"
      )
    ).toEqual([])
  })

  it('gitEnv drops every GIT_* variable and keeps the rest and the extras', () => {
    const saved = { d: process.env.GIT_DIR, w: process.env.GIT_WORK_TREE }
    process.env.GIT_DIR = '/nonexistent/.git'
    process.env.GIT_WORK_TREE = '/nonexistent'
    try {
      const env = gitEnv({ GIT_CONFIG_NOSYSTEM: '1' })
      expect(env.GIT_DIR).toBeUndefined()
      expect(env.GIT_WORK_TREE).toBeUndefined()
      expect(env.GIT_CONFIG_NOSYSTEM).toBe('1')
      expect(env.PATH).toBe(process.env.PATH)
    } finally {
      if (saved.d === undefined) delete process.env.GIT_DIR
      else process.env.GIT_DIR = saved.d
      if (saved.w === undefined) delete process.env.GIT_WORK_TREE
      else process.env.GIT_WORK_TREE = saved.w
    }
  })

  it('gitEnv strips GIT_* from a given base env too', () => {
    const env = gitEnv({}, { PATH: '/bin', GIT_INDEX_FILE: '/x' })
    expect(env).toEqual({ PATH: '/bin' })
  })
})
