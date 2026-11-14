import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import * as path from 'node:path'

/**
 * firebase-tools is pinned (#2551).
 *
 * Every workflow that installs the Firebase CLI must install the one exact
 * version declared as a root devDependency, so Dependabot bumps it in a
 * reviewed PR and a floating `latest` can no longer change the deploy tool
 * under a green run. The workflows read that version from package.json.
 */

const root = path.resolve(__dirname, '../../..')
const workflowsDir = path.join(root, '.github/workflows')

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'))
const pinned: string | undefined = pkg.devDependencies?.['firebase-tools']

// Matches `npm install ... firebase-tools[@spec]` / `npm i` / `npx firebase-tools`.
const INSTALL =
  /\b(?:npm\s+(?:install|i)|npx)\b[^\n]*?\bfirebase-tools(@[^\n]*)?/g
const FROM_PACKAGE_JSON =
  /^@"\$\(jq -r '\.devDependencies\["firebase-tools"\]' package\.json\)"$/

describe('firebase-tools pin (#2551)', () => {
  it('declares one exact version as a root devDependency', () => {
    expect(pinned, 'root package.json devDependencies.firebase-tools').toMatch(
      /^\d+\.\d+\.\d+$/
    )
  })

  const files = readdirSync(workflowsDir).filter(f => /\.ya?ml$/.test(f))
  let installs = 0

  for (const file of files) {
    const source = readFileSync(path.join(workflowsDir, file), 'utf-8')
    for (const m of source.matchAll(INSTALL)) {
      installs++
      const line = source.slice(0, m.index).split('\n').length
      it(`${file}:${line} installs the version from package.json`, () => {
        expect((m[1] ?? '(no version)').trim(), `unpinned: ${m[0]}`).toMatch(
          FROM_PACKAGE_JSON
        )
      })
    }
  }

  it('finds every workflow install of firebase-tools (sweep is not vacuous)', () => {
    expect(installs).toBeGreaterThanOrEqual(4)
  })
})
