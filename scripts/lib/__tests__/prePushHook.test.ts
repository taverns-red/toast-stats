import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'

/**
 * The pre-push hook caps vitest at 2 workers (#3121).
 *
 * Several builder worktrees pushing at once pushed load on the shared Mac
 * past 100. The hook still runs the whole `unit` project; only the worker
 * count is capped. CI is unaffected: it calls vitest directly.
 */

const root = path.resolve(__dirname, '../../..')
const hook = readFileSync(path.join(root, '.husky/pre-push'), 'utf-8')

// Lines that invoke test:unit, ignoring comments and echo messages.
const testUnitCalls = hook
  .split('\n')
  .map(line => line.trim())
  .filter(line => !line.startsWith('#') && !line.startsWith('echo'))
  .filter(line => line.includes('test:unit'))

describe('.husky/pre-push worker cap (#3121)', () => {
  it('invokes test:unit at least once', () => {
    expect(testUnitCalls.length).toBeGreaterThan(0)
  })

  it('passes --maxWorkers=2 on every test:unit call', () => {
    for (const line of testUnitCalls) {
      expect(line).toMatch(/\s--\s.*--maxWorkers=2(\s|$)/)
    }
  })
})
