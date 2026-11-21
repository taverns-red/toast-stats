import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gitEnv } from './gitEnv'

/*
 * A child git that inherits the pre-push hook's GIT_DIR works on the shared
 * repository, not its cwd, and can rewrite .git/config. Reads hit the wrong
 * repository too, so there is no read-only exception.
 * Sees only a literal "git" first argument; a launched shell script must
 * unset GIT_* itself. Data strings opt out: `// not-a-git-spawn: <reason>`.
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
    if (/\/\/ not-a-git-spawn: \S/.test(line)) continue
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
      findGitSpawnsWithoutCleanEnv("execFileSync('git', ['init'])") // not-a-git-spawn: sample input
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
    expect(
      findGitSpawnsWithoutCleanEnv(
        'exec' + "Sync('git push') // not-a-git-spawn"
      )
    ).toHaveLength(1)
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
