import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'

/**
 * Fresh worktrees must not skip git hooks (#3124).
 *
 * `core.hooksPath` is `.husky/_`, a relative path git resolves inside each
 * worktree. husky creates that folder only on `npm install`, so a worktree
 * made with plain `git worktree add` had no hooks and git ran none, silently.
 *
 * The fix tracks husky's own dispatcher files for the hooks we use, so every
 * checkout has them. The hooks then refuse to run without `node_modules`,
 * telling the builder to run `npm install`, instead of passing or failing on
 * a confusing error.
 */

const root = path.resolve(__dirname, '../../..')
const TRACKED = ['.husky/_/h', '.husky/_/pre-commit', '.husky/_/pre-push']
// husky 9 writes this exact stub for every hook (node_modules/husky/index.js).
const HUSKY_STUB = '#!/usr/bin/env sh\n. "$(dirname "$0")/h"'

function indexEntries(): Map<string, string> {
  const out = execFileSync('git', ['ls-files', '-s', '--', '.husky/_'], {
    cwd: root,
    encoding: 'utf-8',
  })
  const modes = new Map<string, string>()
  for (const line of out.split('\n').filter(Boolean)) {
    const [meta, file] = line.split('\t')
    modes.set(file as string, (meta as string).split(' ')[0] as string)
  }
  return modes
}

function tracked(file: string): string {
  return execFileSync('git', ['show', `HEAD:${file}`], {
    cwd: root,
    encoding: 'utf-8',
  })
}

describe('husky dispatcher is tracked so fresh worktrees run hooks (#3124)', () => {
  it('tracks h, pre-commit and pre-push under .husky/_', () => {
    const entries = indexEntries()
    for (const file of TRACKED) {
      expect(entries.has(file), `${file} is not tracked`).toBe(true)
    }
  })

  it('tracks the hook stubs as executable', () => {
    const entries = indexEntries()
    expect(entries.get('.husky/_/pre-commit')).toBe('100755')
    expect(entries.get('.husky/_/pre-push')).toBe('100755')
  })

  // Read the committed content, not the working copy: `npm ci` runs husky
  // before tests and rewrites the files on disk, which would hide drift.
  it('matches what the installed husky writes, so npm install leaves no diff', () => {
    const huskyDir = path.join(root, 'node_modules/husky')
    const installedH = readFileSync(path.join(huskyDir, 'husky'), 'utf-8')
    expect(tracked('.husky/_/h')).toBe(installedH)

    // husky's index.js holds the stub as a template literal.
    const huskyIndex = readFileSync(path.join(huskyDir, 'index.js'), 'utf-8')
    expect(huskyIndex).toContain(
      '`#!/usr/bin/env sh\\n. "\\$(dirname "\\$0")/h"`'
    )
    for (const hook of ['pre-commit', 'pre-push']) {
      expect(tracked(`.husky/_/${hook}`)).toBe(HUSKY_STUB)
    }
  })
})

describe('hooks stop loudly in a worktree without node_modules (#3124)', () => {
  for (const hook of ['pre-commit', 'pre-push']) {
    it(`${hook} exits non-zero and says to run npm install`, () => {
      const dir = mkdtempSync(path.join(tmpdir(), '3124-hook-'))
      try {
        const result = spawnSync(
          'sh',
          ['-e', path.join(root, '.husky', hook)],
          {
            cwd: dir,
            input: '',
            encoding: 'utf-8',
            timeout: 20000,
            env: { ...process.env, npm_config_offline: 'true' },
          }
        )
        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('npm install')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})
