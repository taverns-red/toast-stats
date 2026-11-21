import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { writeStubExecutable } from './stubExecutable.js'

/**
 * scripts/test-lock.sh keeps local test runs to one at a time (#3166, ops#425).
 *
 * These run the real script with a stub wrapper named by TOAST_TEST_SLOT_RUN
 * that logs the lock folder and limit it was given. The last case uses the
 * real ops wrapper and is skipped where it is not installed (CI, cloud).
 */

const root = path.resolve(__dirname, '../../..')
const LOCK = path.join(root, 'scripts/test-lock.sh')

describe('scripts/test-lock.sh (#3166)', () => {
  let dir: string
  let log: string
  let repoLock: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'test-lock-3166-'))
    log = path.join(dir, 'calls.log')
    repoLock = path.join(dir, '.cache/toast-stats-test-lock')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function stub(name: string, body: string): string {
    const file = path.join(dir, name)
    writeStubExecutable(file, `${body}\n`)
    return file
  }

  const loggingWrapper = () =>
    `echo "slot \${RT_TEST_SLOT_DIR:-machine} \${RT_TEST_SLOT_MAX:-3}" >> "${log}"\nexec "$@"`

  function runLock(args: string[], extra: Record<string, string>) {
    return spawnSync('sh', [LOCK, ...args], {
      cwd: root,
      encoding: 'utf-8',
      env: { PATH: `${dir}:/usr/bin:/bin`, HOME: dir, ...extra },
    })
  }

  function calls(): string[] {
    return existsSync(log) ? readFileSync(log, 'utf-8').trim().split('\n') : []
  }

  it('runs the command under the repo lock with a limit of 1', () => {
    const wrapper = stub('run.sh', loggingWrapper())
    stub(
      'suite',
      `echo "suite $* \${RT_TEST_SLOT_DIR:-unset} \${RT_TEST_SLOT_MAX:-unset}" >> "${log}"`
    )

    const r = runLock(['suite', '--a'], { TOAST_TEST_SLOT_RUN: wrapper })

    expect(r.status).toBe(0)
    expect(calls()).toEqual([`slot ${repoLock} 1`, 'suite --a unset unset'])
  })

  it('runs the command directly when there is no wrapper', () => {
    stub('suite', `echo "suite $*" >> "${log}"`)

    const r = runLock(['suite', '--a'], {
      TOAST_TEST_SLOT_RUN: path.join(dir, 'missing.sh'),
    })

    expect(r.status).toBe(0)
    expect(calls()).toEqual(['suite --a'])
  })

  it('always takes the repo lock, even inside a held machine slot (ops#428)', () => {
    const wrapper = stub(
      'run.sh',
      `echo "slot \${RT_TEST_SLOT_MAX:-3} held=\${RT_TEST_SLOT_HELD:-none}" >> "${log}"\nexec "$@"`
    )
    stub('suite', `echo "suite held=\${RT_TEST_SLOT_HELD:-none}" >> "${log}"`)

    const r = runLock(['suite'], {
      TOAST_TEST_SLOT_RUN: wrapper,
      RT_TEST_SLOT_HELD: '123|/outer/slot-1',
    })

    expect(r.status).toBe(0)
    expect(calls()).toEqual([
      'slot 1 held=none',
      'suite held=123|/outer/slot-1',
    ])
  })

  it('does not hand the command the repo lock as a held machine slot', () => {
    const wrapper = stub(
      'run.sh',
      `export RT_TEST_SLOT_HELD="999|$RT_TEST_SLOT_DIR/slot-1"\nexec "$@"`
    )
    stub('suite', `echo "suite held=\${RT_TEST_SLOT_HELD:-none}" >> "${log}"`)

    const r = runLock(['suite'], { TOAST_TEST_SLOT_RUN: wrapper })

    expect(r.status).toBe(0)
    expect(calls()).toEqual(['suite held=none'])
  })

  it('passes the exit code through', () => {
    const wrapper = stub('run.sh', 'exec "$@"')
    stub('suite', 'exit 3')

    expect(runLock(['suite'], { TOAST_TEST_SLOT_RUN: wrapper }).status).toBe(3)
  })

  it('prints usage and exits 64 with no command', () => {
    const wrapper = stub('run.sh', 'exec "$@"')

    const r = runLock([], { TOAST_TEST_SLOT_RUN: wrapper })

    expect(r.status).toBe(64)
    expect(r.stderr).toMatch(/usage: scripts\/test-lock\.sh <command>/)
  })

  const REAL = path.join(
    process.env.HOME ?? '',
    'code/ops/tools/test-slot/run.sh'
  )
  it.skipIf(!existsSync(REAL))(
    'a second run waits for the first (the real wrapper, limit 1)',
    () => {
      const marker = path.join(dir, 'order.log')
      const started = path.join(dir, 'a-started')
      // B starts only after A holds the lock, so the order is fixed.
      stub(
        'slow',
        `echo start-$1 >> "${marker}"; [ "$1" = a ] && touch "${started}"; sleep 1; echo end-$1 >> "${marker}"`
      )

      const r = spawnSync(
        'sh',
        [
          '-c',
          `sh "${LOCK}" slow a & n=0; while [ ! -f "${started}" ] && [ $n -lt 100 ]; do n=$((n+1)); sleep 0.1; done; sh "${LOCK}" slow b; wait`,
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          env: {
            PATH: `${dir}:/usr/bin:/bin`,
            HOME: dir,
            TOAST_TEST_SLOT_RUN: REAL,
            RT_TEST_SLOT_POLL: '1',
          },
        }
      )

      expect(r.status).toBe(0)
      expect(readFileSync(marker, 'utf-8').trim().split('\n')).toEqual([
        'start-a',
        'end-a',
        'start-b',
        'end-b',
      ])
    }
  )
})
