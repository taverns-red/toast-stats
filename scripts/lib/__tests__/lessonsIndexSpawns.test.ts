/**
 * lessons-index.sh must not fork per lesson (#1748).
 *
 * The drift-gate tests run the generator over the real `tasks/lessons` tree.
 * When the generator spawned `awk` three times plus `basename` per lesson
 * (~5 forks/file, ~1,200 per run at 247 lessons) a single run took ~3s idle
 * and crossed the test timeout under parallel load — and got slower with every
 * lesson added. A wall-clock assertion would be flaky in its own right, so
 * this pins the cause instead: the number of external processes the script
 * spawns must not grow with the number of lessons. relevant-lessons.sh had the
 * same per-lesson `fm` fork in its newest-lesson pick (its 600-lesson #1667
 * test hit ~13s under parallel load), so it is pinned here too.
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
const INDEX_SCRIPT = path.join(ROOT, 'scripts/lessons-index.sh')
const LOADER_SCRIPT = path.join(ROOT, 'scripts/relevant-lessons.sh')

/** Every external the script could plausibly reach for, per lesson or not. */
const SHIMMED = [
  'awk',
  'basename',
  'dirname',
  'sort',
  'find',
  'cat',
  'sed',
  'grep',
  'wc',
  'tr',
]

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
  writeFileSync(path.join(dir, 'INDEX.md'), '# index\n')
  for (let i = 0; i < n; i++) {
    const day = String((i % 28) + 1).padStart(2, '0')
    writeFileSync(
      path.join(dir, 'lessons', `lesson-${String(i).padStart(3, '0')}.md`),
      `---\ndate: 2026-01-${day}\ntier: lesson\nsummary: lesson ${i}\n---\n\n# ${i}\n`
    )
  }
  return dir
}

const bodyFile = path.join(work, 'body.txt')
writeFileSync(bodyFile, 'chore: no manifest\n')

const spawnsFor = (script: string, args: string[], lessonsDir: string) => {
  writeFileSync(spawnLog, '')
  execFileSync('bash', [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      LESSONS_DIR: lessonsDir,
      ISSUE_BODY_FILE: bodyFile,
      PATH: `${shimDir}:${process.env.PATH}`,
    },
  })
  return readFileSync(spawnLog, 'utf8').split('\n').filter(Boolean).length
}

describe('lesson scripts spawn a corpus-size-independent process count (#1748)', () => {
  it('lessons-index.sh spawns the same for 5 lessons as for 40', () => {
    const small = spawnsFor(INDEX_SCRIPT, ['--stdout'], corpus(5))
    const large = spawnsFor(INDEX_SCRIPT, ['--stdout'], corpus(40))
    expect(small).toBeGreaterThan(0) // the shims are actually on PATH
    expect(large, `5 lessons: ${small} spawns, 40 lessons: ${large}`).toBe(
      small
    )
  })

  it('relevant-lessons.sh (large-corpus path) spawns the same for 20 as for 60', () => {
    // Both above SMALL_CORPUS (15), so both take the newest-by-date pick.
    const small = spawnsFor(LOADER_SCRIPT, ['999'], corpus(20))
    const large = spawnsFor(LOADER_SCRIPT, ['999'], corpus(60))
    expect(small).toBeGreaterThan(0)
    expect(large, `20 lessons: ${small} spawns, 60 lessons: ${large}`).toBe(
      small
    )
  })
})
