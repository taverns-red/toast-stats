import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { writeStubExecutable } from './stubExecutable.js'

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

/**
 * The hook runs the suite through scripts/test-lock.sh (#3172, #3142), which
 * takes the repo lock and a machine slot when the machine has them. These run
 * the real hook with empty stdin, which always reaches run_gate, against a
 * stub `npm` on PATH and a stub test-lock.sh.
 */
describe('.husky/pre-push test-lock routing (#3142, #3172)', () => {
  const NPM_ARGS = 'run test:unit --workspace=frontend -- --maxWorkers=2'
  let dir: string
  let log: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'prepush-3142-'))
    log = path.join(dir, 'calls.log')
    mkdirSync(path.join(dir, 'node_modules'))
    mkdirSync(path.join(dir, 'bin'))
    writeStub(path.join(dir, 'bin', 'npm'), `echo "npm $*" >> "${log}"\nexit 0`)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function writeStub(file: string, body: string): void {
    writeStubExecutable(file, `${body}\n`)
  }

  function runHook(env: Record<string, string>, cwd = dir) {
    return spawnSync('sh', ['-e', path.join(root, '.husky/pre-push')], {
      cwd,
      input: '',
      encoding: 'utf-8',
      env: {
        PATH: `${path.join(dir, 'bin')}:/usr/bin:/bin`,
        HOME: dir,
        ...env,
      },
    })
  }

  function calls(): string[] {
    try {
      return readFileSync(log, 'utf-8').trim().split('\n')
    } catch {
      return []
    }
  }

  it('runs the suite through scripts/test-lock.sh, not the slot wrapper directly (#3172)', () => {
    mkdirSync(path.join(dir, 'scripts'))
    writeStub(
      path.join(dir, 'scripts/test-lock.sh'),
      `echo "lock $*" >> "${log}"\nexec "$@"`
    )

    const result = runHook({})

    expect(result.status).toBe(0)
    expect(calls()).toEqual([`lock npm ${NPM_ARGS}`, `npm ${NPM_ARGS}`])
  })

  it('fails the push when the lock times out (exit 75), never unthrottled', () => {
    mkdirSync(path.join(dir, 'scripts'))
    writeStub(
      path.join(dir, 'scripts/test-lock.sh'),
      `echo "test-slot: timed out" >&2\necho "lock $*" >> "${log}"\nexit 75`
    )

    const result = runHook({})

    expect(result.status).toBe(75)
    expect(result.stderr).toContain('test-slot: timed out')
    expect(calls()).toEqual([`lock npm ${NPM_ARGS}`])
  })

  it('still stops with the npm install message when node_modules is missing', () => {
    rmSync(path.join(dir, 'node_modules'), { recursive: true })

    const result = runHook({})

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Run 'npm install' here")
    expect(calls()).toEqual([])
  })
})
