/**
 * lessons-index.sh must not fork per lesson (#1748).
 *
 * The drift-gate tests run the generator over the real `tasks/lessons` tree.
 * When the generator spawned `awk` three times plus `basename` per lesson
 * (~5 forks/file, ~1,200 per run at 247 lessons) a single run took ~3s idle
 * and crossed the test timeout under parallel load — and got slower with every
 * lesson added. A wall-clock assertion would be flaky in its own right, so
 * this pins the cause instead: the number of external processes the script
 * spawns must not grow with the number of lessons.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const ROOT = process.cwd()
const SCRIPT = path.join(ROOT, 'scripts/lessons-index.sh')

/** Every external the script could plausibly reach for, per lesson or not. */
const SHIMMED = ['awk', 'basename', 'dirname', 'sort', 'find', 'cat', 'sed']

const work = mkdtempSync(path.join(os.tmpdir(), 'ts-lessons-spawns-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))

const realPath = (cmd: string): string =>
  execFileSync('bash', ['-c', `command -v ${cmd}`], {
    encoding: 'utf8',
  }).trim()

/** A PATH dir of wrappers that log their name, then exec the real binary. */
const shimDir = path.join(work, 'shims')
const spawnLog = path.join(work, 'spawns.log')
mkdirSync(shimDir)
for (const cmd of SHIMMED) {
  const shim = path.join(shimDir, cmd)
  writeFileSync(
    shim,
    `#!/bin/bash\necho ${cmd} >> "${spawnLog}"\nexec "${realPath(cmd)}" "$@"\n`
  )
  chmodSync(shim, 0o755)
}

const corpus = (n: number): string => {
  const dir = path.join(work, `corpus-${n}`)
  mkdirSync(path.join(dir, 'lessons'), { recursive: true })
  for (let i = 0; i < n; i++) {
    const day = String((i % 28) + 1).padStart(2, '0')
    writeFileSync(
      path.join(dir, 'lessons', `lesson-${String(i).padStart(3, '0')}.md`),
      `---\ndate: 2026-01-${day}\ntier: lesson\nsummary: lesson ${i}\n---\n\n# ${i}\n`
    )
  }
  return dir
}

const spawnsFor = (lessonsDir: string): number => {
  writeFileSync(spawnLog, '')
  execFileSync('bash', [SCRIPT, '--stdout'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      LESSONS_DIR: lessonsDir,
      PATH: `${shimDir}:${process.env.PATH}`,
    },
  })
  return readFileSync(spawnLog, 'utf8').split('\n').filter(Boolean).length
}

describe('lessons-index.sh spawn count is independent of corpus size (#1748)', () => {
  it('spawns the same number of processes for 5 lessons as for 40', () => {
    const small = spawnsFor(corpus(5))
    const large = spawnsFor(corpus(40))
    expect(small).toBeGreaterThan(0) // the shims are actually on PATH
    expect(large, `5 lessons: ${small} spawns, 40 lessons: ${large}`).toBe(
      small
    )
  })
})
