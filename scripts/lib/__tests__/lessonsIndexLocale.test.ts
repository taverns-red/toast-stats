/**
 * Lessons INDEX locale determinism (#1372).
 *
 * `scripts/lessons-index.sh` sorts lesson rows by date descending. Lessons that
 * share a date fall through to a secondary comparison — and if that comparison
 * is not pinned, `sort` uses the ambient locale's collation. Byte order
 * (`LC_ALL=C`) puts `IA-…` before `ia-…`; a normal UTF-8 locale folds case and
 * puts `ia-…` first. The committed INDEX.md is therefore correct on whichever
 * machine generated it and stale everywhere else, and the drift gate in
 * `lessonsModel.test.ts` goes red on `main` for every PR.
 *
 * A test that just runs `--check` once cannot catch this: it passes on the
 * generating machine. These tests assert the generator is *locale-invariant*
 * and that its tie-break is an explicit contract rather than a side effect of
 * whole-line comparison.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const ROOT = process.cwd()
const SCRIPT = path.join(ROOT, 'scripts/lessons-index.sh')

/** Locales worth trying. `C`/`POSIX`/`C.UTF-8` collate by byte; the rest fold case. */
const CANDIDATE_LOCALES = [
  'C',
  'POSIX',
  'C.UTF-8',
  'en_US.UTF-8',
  'en_CA.UTF-8',
  'en_GB.UTF-8',
  'de_DE.UTF-8',
  'fr_FR.UTF-8',
]

/** Byte order for the probe; anything else means the locale folds case. */
const BYTE_ORDER_PROBE = 'IA-x\nIB-z\nia-y\n'

const collationProbe = (locale: string): string | null => {
  try {
    return execFileSync('sort', [], {
      input: 'IA-x\nia-y\nIB-z\n',
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: locale },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch {
    return null // locale not installed on this machine
  }
}

/** Locales actually installed here, split by how they collate. */
const availableLocales: string[] = []
const caseFoldingLocales: string[] = []
for (const locale of CANDIDATE_LOCALES) {
  const probe = collationProbe(locale)
  if (probe === null) continue
  availableLocales.push(locale)
  if (probe !== BYTE_ORDER_PROBE) caseFoldingLocales.push(locale)
}

/**
 * A corpus whose date group collides on case: byte order is
 * `IA-tab`, `IB-beta`, `ia-alpha`; case-folding order is
 * `IA-tab`, `ia-alpha`, `IB-beta`. Plus a newer lesson, so the test also
 * proves the date key still outranks the tie-break.
 */
const FIXTURE_LESSONS: [string, string, string][] = [
  ['ia-alpha.md', '2026-05-22', 'lower-case i, alpha'],
  ['IA-tab.md', '2026-05-22', 'upper-case I, tab strip'],
  ['IB-beta.md', '2026-05-22', 'upper-case I, beta'],
  ['zz-newer.md', '2026-06-01', 'a newer lesson, sorts first by date'],
]

let fixtureDir = ''

const generate = (lessonsDir: string, locale?: string): string =>
  execFileSync('bash', [SCRIPT, '--stdout'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      LESSONS_DIR: lessonsDir,
      ...(locale ? { LC_ALL: locale } : {}),
    },
  })

beforeAll(() => {
  fixtureDir = mkdtempSync(path.join(os.tmpdir(), 'ts-lessons-locale-'))
  mkdirSync(path.join(fixtureDir, 'lessons'), { recursive: true })
  for (const [file, date, summary] of FIXTURE_LESSONS) {
    writeFileSync(
      path.join(fixtureDir, 'lessons', file),
      `---\ndate: ${date}\ntier: lesson\nsummary: ${summary}\n---\n\n# ${file}\n`
    )
  }
})

afterAll(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true })
})

describe('lessons-index.sh is locale-deterministic (#1372)', () => {
  it('has at least one byte-order and one case-folding locale to compare', () => {
    // Not the guard itself — a canary so a locale-starved machine reports
    // reduced coverage instead of silently passing a one-locale comparison.
    expect(availableLocales).toContain('C')
    expect(
      caseFoldingLocales.length,
      `no case-folding locale installed; tried ${CANDIDATE_LOCALES.join(', ')}`
    ).toBeGreaterThan(0)
  })

  it('generates byte-identical output under every installed locale', () => {
    const baseline = generate(fixtureDir, 'C')
    for (const locale of availableLocales) {
      expect(generate(fixtureDir, locale), `LC_ALL=${locale} diverged`).toBe(
        baseline
      )
    }
    // And with nothing pinned — the ambient environment a contributor runs in.
    expect(generate(fixtureDir), 'ambient locale diverged').toBe(baseline)
  })

  it('breaks date ties on filename in byte order, whatever the ambient locale', () => {
    const lines = generate(fixtureDir)
      .split('\n')
      .filter(l => l.startsWith('- `'))
      .map(l => l.slice(3, l.indexOf('`', 3)))

    expect(lines).toEqual([
      'zz-newer.md', // newer date always wins over the tie-break
      'IA-tab.md', // 0x49 'I' …
      'IB-beta.md', // … then 'IB' by byte order …
      'ia-alpha.md', // … then 0x69 'i' (a case-folding locale would hoist this)
    ])
  })

  it('keeps the committed INDEX.md in sync under a case-folding locale too', () => {
    // The real CI failure: `--check` passes under the locale that generated the
    // file and fails under any other.
    for (const locale of caseFoldingLocales.slice(0, 1)) {
      expect(() =>
        execFileSync('bash', [SCRIPT, '--check'], {
          cwd: ROOT,
          env: { ...process.env, LESSONS_DIR: 'tasks/lessons', LC_ALL: locale },
        })
      ).not.toThrow()
    }
  })
})
