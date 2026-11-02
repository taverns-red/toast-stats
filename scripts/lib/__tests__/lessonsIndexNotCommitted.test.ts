/**
 * #2455: tasks/lessons/INDEX.md is generated at read time, not committed.
 *
 * Every lesson PR used to regenerate the committed index, so any two open PRs
 * that each added a lesson conflicted on it (all three open PRs on 2026-11-01,
 * #2445/#2446/#2450). A union merge driver would only swap the conflict for an
 * out-of-order index on main, which the drift gate then fails. With the file
 * out of git there is nothing to conflict on; the loader regenerates it each
 * time it hands the catalog over, so it can never be stale either.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const ROOT = process.cwd()
const INDEX = 'tasks/lessons/INDEX.md'

const git = (...args: string[]) =>
  spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })

describe('lessons INDEX.md is generated, not committed (#2455)', () => {
  it('is not tracked by git', () => {
    const tracked = execFileSync('git', ['ls-files', '--', INDEX], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    expect(tracked.trim()).toBe('')
  })

  it('is ignored, so a regenerated copy cannot be committed by accident', () => {
    // --no-index: answer from the ignore rules alone, tracked or not.
    expect(git('check-ignore', '-q', '--no-index', INDEX).status).toBe(0)
  })

  it('relevant-lessons.sh generates the catalog when none exists on disk', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ts-lessons-2455-'))
    try {
      mkdirSync(path.join(dir, 'lessons'))
      for (let i = 1; i <= 20; i++) {
        const n = String(i).padStart(2, '0')
        writeFileSync(
          path.join(dir, 'lessons', `lesson-${n}.md`),
          `---\ndate: 2026-01-${n}\ntier: lesson\nsummary: s${n}\n---\n`
        )
      }
      const bodyFile = path.join(dir, 'body.txt')
      writeFileSync(bodyFile, 'chore: no manifest\n')
      const res = spawnSync(
        'bash',
        [path.join(ROOT, 'scripts/relevant-lessons.sh'), '999'],
        {
          cwd: ROOT,
          encoding: 'utf8',
          env: { ...process.env, LESSONS_DIR: dir, ISSUE_BODY_FILE: bodyFile },
        }
      )
      expect(res.status, res.stderr).toBe(0)
      const indexPath = path.join(dir, 'INDEX.md')
      expect(res.stdout.split('\n')).toContain(indexPath)
      expect(existsSync(indexPath)).toBe(true)
      const expected = execFileSync(
        'bash',
        [path.join(ROOT, 'scripts/lessons-index.sh'), '--stdout'],
        {
          cwd: ROOT,
          encoding: 'utf8',
          env: { ...process.env, LESSONS_DIR: dir },
        }
      )
      expect(readFileSync(indexPath, 'utf8')).toBe(expected)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
