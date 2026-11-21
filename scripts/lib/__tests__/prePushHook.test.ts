import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
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

/**
 * The hook runs the suite through the shared test-slot wrapper when the
 * machine has one (#3142, ops#425), and directly when it doesn't (cloud VM).
 * These run the real hook with empty stdin, which always reaches run_gate,
 * against a stub `npm` on PATH and a stub wrapper.
 */
describe('.husky/pre-push test-slot wrapper (#3142)', () => {
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
    writeFileSync(file, `#!/bin/sh\n${body}\n`)
    chmodSync(file, 0o755)
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

  it('runs the npm command through the wrapper when it is executable', () => {
    const wrapper = path.join(dir, 'run.sh')
    writeStub(wrapper, `echo "wrapper $*" >> "${log}"\nexec "$@"`)

    const result = runHook({ TOAST_TEST_SLOT_RUN: wrapper })

    expect(result.status).toBe(0)
    expect(calls()).toEqual([`wrapper npm ${NPM_ARGS}`, `npm ${NPM_ARGS}`])
  })

  it('looks for the wrapper under $HOME/code/ops by default', () => {
    const wrapper = path.join(dir, 'code/ops/tools/test-slot/run.sh')
    mkdirSync(path.dirname(wrapper), { recursive: true })
    writeStub(wrapper, `echo "wrapper $*" >> "${log}"\nexec "$@"`)

    const result = runHook({})

    expect(result.status).toBe(0)
    expect(calls()[0]).toBe(`wrapper npm ${NPM_ARGS}`)
  })

  it('runs the npm command directly when there is no wrapper', () => {
    const result = runHook({
      TOAST_TEST_SLOT_RUN: path.join(dir, 'missing/run.sh'),
    })

    expect(result.status).toBe(0)
    expect(calls()).toEqual([`npm ${NPM_ARGS}`])
  })

  it('fails the push when the wrapper times out (exit 75), never unthrottled', () => {
    const wrapper = path.join(dir, 'run.sh')
    writeStub(
      wrapper,
      `echo "test-slot: timed out" >&2\necho "wrapper $*" >> "${log}"\nexit 75`
    )

    const result = runHook({ TOAST_TEST_SLOT_RUN: wrapper })

    expect(result.status).toBe(75)
    expect(result.stderr).toContain('test-slot: timed out')
    expect(calls()).toEqual([`wrapper npm ${NPM_ARGS}`])
  })

  it('still stops with the npm install message when node_modules is missing', () => {
    rmSync(path.join(dir, 'node_modules'), { recursive: true })

    const result = runHook({
      TOAST_TEST_SLOT_RUN: path.join(dir, 'missing/run.sh'),
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Run 'npm install' here")
    expect(calls()).toEqual([])
  })
})
