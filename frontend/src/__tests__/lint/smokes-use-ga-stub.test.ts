import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/* #1979: every Playwright smoke must run under the shared GA stub fixture
 * (e2e/fixtures/test.ts), or a smoke run against prod sends real GA hits.
 * The fixture is only in force when a smoke takes `test` from it, so no
 * smoke may import from '@playwright/test' directly.
 */

const E2E_DIR = resolve(__dirname, '../../../e2e')
const smokes = readdirSync(E2E_DIR).filter(f => f.endsWith('.smoke.ts'))

describe('Playwright smokes use the GA stub fixture (#1979)', () => {
  it('finds the smoke files', () => {
    expect(smokes.length).toBeGreaterThan(10)
  })

  it('no smoke imports from @playwright/test directly', () => {
    const direct = smokes.filter(f =>
      /from\s*['"]@playwright\/test['"]/.test(
        readFileSync(resolve(E2E_DIR, f), 'utf8')
      )
    )
    expect(direct).toEqual([])
  })

  it('every smoke imports from ./fixtures/test', () => {
    const missing = smokes.filter(
      f =>
        !/from\s*['"]\.\/fixtures\/test['"]/.test(
          readFileSync(resolve(E2E_DIR, f), 'utf8')
        )
    )
    expect(missing).toEqual([])
  })
})
