import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import * as path from 'node:path'

/**
 * firebase-tools is pinned and isolated (#2551).
 *
 * The Firebase CLI lives in its own package (tools/firebase-tools) with its
 * own lockfile, outside the root workspaces, so a plain `npm ci` never
 * installs it and the root lockfile is untouched. Workflows install it with
 * `npm ci --prefix tools/firebase-tools` (lockfile-verified), and Dependabot
 * bumps it through its own npm entry.
 */

const root = path.resolve(__dirname, '../../..')
const workflowsDir = path.join(root, '.github/workflows')
const toolDir = path.join(root, 'tools/firebase-tools')

const rootPkg = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf-8')
)

// Any workflow line that installs or runs firebase-tools through npm.
const INSTALL =
  /\b(?:npm\s+(?:install|i|ci)|npx)\b[^\n]*?\bfirebase-tools\b[^\n]*/g
const NPM_CI = /^\s*npm ci --prefix tools\/firebase-tools\s*$/

describe('firebase-tools pin (#2551)', () => {
  it('is an isolated package pinned to one exact version', () => {
    const pkgPath = path.join(toolDir, 'package.json')
    expect(existsSync(pkgPath), 'tools/firebase-tools/package.json').toBe(true)
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    expect(pkg.dependencies?.['firebase-tools']).toMatch(/^\d+\.\d+\.\d+$/)
    expect(
      existsSync(path.join(toolDir, 'package-lock.json')),
      'tools/firebase-tools/package-lock.json'
    ).toBe(true)
  })

  it('is not a root dependency and not a workspace', () => {
    expect(rootPkg.dependencies?.['firebase-tools']).toBeUndefined()
    expect(rootPkg.devDependencies?.['firebase-tools']).toBeUndefined()
    const globs: string[] = rootPkg.workspaces ?? []
    expect(globs.filter(g => g.startsWith('tools'))).toEqual([])
  })

  it('has its own Dependabot npm entry', () => {
    const yml = readFileSync(path.join(root, '.github/dependabot.yml'), 'utf-8')
    expect(yml).toMatch(
      /package-ecosystem:\s*"npm"\s*\n\s*directory:\s*"\/tools\/firebase-tools"/
    )
  })

  it('pr-preview.yml watches the tool directory', () => {
    const src = readFileSync(path.join(workflowsDir, 'pr-preview.yml'), 'utf-8')
    expect(src).toContain("'tools/firebase-tools/**'")
  })

  const files = readdirSync(workflowsDir).filter(f => /\.ya?ml$/.test(f))
  let installs = 0

  for (const file of files) {
    const source = readFileSync(path.join(workflowsDir, file), 'utf-8')
    for (const m of source.matchAll(INSTALL)) {
      const text = m[0]
      // Prose mentioning the tool in a comment is not an install.
      const lineStart = source.lastIndexOf('\n', m.index) + 1
      if (source.slice(lineStart, m.index).includes('#')) continue
      installs++
      const line = source.slice(0, m.index).split('\n').length
      it(`${file}:${line} installs from the isolated lockfile`, () => {
        expect(
          source
            .slice(lineStart, m.index + text.length)
            .replace(/^\s*run:\s*/, ''),
          `not 'npm ci --prefix tools/firebase-tools': ${text}`
        ).toMatch(NPM_CI)
      })
    }
  }

  it('finds every workflow install of firebase-tools (sweep is not vacuous)', () => {
    expect(installs).toBeGreaterThanOrEqual(4)
  })
})
