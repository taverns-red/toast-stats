/**
 * Guard for #2957: no tracked file outside tasks/lessons/archive may link to a
 * tasks/lessons/ path that does not exist. The lessons archive (#2950) moved
 * every lesson, so a flat path like tasks/lessons/087-foo.md is a dead link.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gitEnv } from './gitEnv'

const ROOT = resolve(__dirname, '../../..')
const SELF = 'scripts/lib/__tests__/lessonLinks.test.ts'
const TEXT_EXT = /\.(md|ts|tsx|js|mjs|cjs|json|ya?ml|html|css|sh|txt)$/

// Test fixtures that name made-up lesson files to exercise path matching.
const FIXTURE_FILES = new Set([
  'scripts/lib/__tests__/changedFilesGate.test.ts',
  'scripts/lib/__tests__/previewPaths.test.ts',
])

function trackedTextFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    env: gitEnv(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out
    .split('\0')
    .filter(
      f =>
        f &&
        TEXT_EXT.test(f) &&
        !f.startsWith('tasks/lessons/archive/') &&
        f !== SELF &&
        !FIXTURE_FILES.has(f)
    )
}

describe('links into tasks/lessons/ (#2957)', () => {
  it('every tasks/lessons/ path named outside the archive exists', () => {
    const pathRe = /tasks\/lessons\/[A-Za-z0-9_./-]*/g
    const broken: string[] = []
    for (const file of trackedTextFiles()) {
      if (!existsSync(join(ROOT, file))) continue
      const text = readFileSync(join(ROOT, file), 'utf8')
      for (const m of text.matchAll(pathRe)) {
        const target = m[0].replace(/[.,;:)]+$/, '')
        if (!existsSync(join(ROOT, target))) broken.push(`${file}: ${target}`)
      }
    }
    expect(broken).toEqual([])
  })
})
