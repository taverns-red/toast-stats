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
 * that logs the lock folder and limit it was given. The cases that need real
 * locking use the ops wrapper and are skipped where it is not installed (CI,
 * cloud). Lock folders live under a temp HOME, never the real ones.
 */

const root = path.resolve(__dirname, '../../..')
const LOCK = path.join(root, 'scripts/test-lock.sh')

const REAL = path.join(
  process.env.HOME ?? '',
  'code/ops/tools/test-slot/run.sh'
)

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
    expect(calls()).toEqual([
      `slot ${repoLock} 1`,
      'slot machine 3',
      'suite --a unset unset',
    ])
  })

  it('runs the command directly when there is no wrapper', () => {
    stub('suite', `echo "suite $*" >> "${log}"`)

    const r = runLock(['suite', '--a'], {
      TOAST_TEST_SLOT_RUN: path.join(dir, 'missing.sh'),
    })

    expect(r.status).toBe(0)
    expect(calls()).toEqual(['suite --a'])
  })

  it.skipIf(!existsSync(REAL))(
    'still takes the repo lock inside a held machine slot (#3172)',
    () => {
      stub('suite', `ls "${repoLock}" >> "${log}"`)

      const r = spawnSync('sh', ['-c', `"${REAL}" sh "${LOCK}" suite`], {
        cwd: root,
        encoding: 'utf-8',
        env: {
          PATH: `${dir}:/usr/bin:/bin`,
          HOME: dir,
          TOAST_TEST_SLOT_RUN: REAL,
          RT_TEST_SLOT_DIR: path.join(dir, 'outer-slots'),
          RT_TEST_SLOT_TIMEOUT: '4',
        },
      })

      expect(r.status).toBe(0)
      expect(calls()).toEqual(['slot-1'])
    }
  )

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

  it('takes the repo lock first, then a machine slot, then runs the command (#3172)', () => {
    const wrapper = stub('run.sh', loggingWrapper())
    stub('suite', `echo "suite" >> "${log}"`)

    const r = runLock(['suite'], { TOAST_TEST_SLOT_RUN: wrapper })

    expect(r.status).toBe(0)
    expect(calls()).toEqual([`slot ${repoLock} 1`, 'slot machine 3', 'suite'])
  })

  it.skipIf(!existsSync(REAL))(
    'a nested test-lock.sh inside a held repo lock passes through without waiting (#3172)',
    () => {
      stub('suite', `echo "inner ran" >> "${log}"`)

      // The outer run holds the repo lock and a machine slot; the inner
      // call, as the pre-push hook makes it, must not wait for either.
      const r = spawnSync('sh', [LOCK, 'sh', LOCK, 'suite'], {
        cwd: root,
        encoding: 'utf-8',
        env: {
          PATH: `${dir}:/usr/bin:/bin`,
          HOME: dir,
          TOAST_TEST_SLOT_RUN: REAL,
          RT_TEST_SLOT_POLL: '1',
          RT_TEST_SLOT_TIMEOUT: '4',
        },
      })

      expect(r.status).toBe(0)
      expect(r.stderr).not.toMatch(/waiting/)
      expect(calls()).toEqual(['inner ran'])
    }
  )

  it.skipIf(!existsSync(REAL))(
    'an unrelated process still waits while the repo lock is held (#3172)',
    () => {
      const started = path.join(dir, 'holder-started')
      stub('hold', `touch "${started}"; sleep 4`)

      const r = spawnSync(
        'sh',
        [
          '-c',
          `sh "${LOCK}" hold & n=0; while [ ! -f "${started}" ] && [ $n -lt 50 ]; do n=$((n+1)); sleep 0.1; done; sh "${LOCK}" true; rc=$?; kill %1 2>/dev/null; wait; exit $rc`,
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          env: {
            PATH: `${dir}:/usr/bin:/bin`,
            HOME: dir,
            TOAST_TEST_SLOT_RUN: REAL,
            RT_TEST_SLOT_POLL: '1',
            RT_TEST_SLOT_TIMEOUT: '1',
          },
        }
      )

      expect(r.status).toBe(75)
      expect(r.stderr).toMatch(/waiting/)
    }
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
          `sh "${LOCK}" slow a & n=0; while [ ! -f "${started}" ] && [ $n -lt 50 ]; do n=$((n+1)); sleep 0.1; done; sh "${LOCK}" slow b; wait`,
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
