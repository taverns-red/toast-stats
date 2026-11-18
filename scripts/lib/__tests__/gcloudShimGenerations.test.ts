/**
 * The gcloud shim's generation stamping (#2800). With SHIM_GENERATIONS=1 every
 * write takes the next number from a per-root counter (`next_gen`). The
 * #2239 copy-out runs its workers with `xargs -P`, so many shim processes
 * stamp at once: the counter must hand out each number exactly once and never
 * be read half written (CI run 43509410938 read `1\n93000000000005`).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { writeStubExecutable } from './stubExecutable.js'

const SHIM = path.join(
  process.cwd(),
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const WRITES = 200
const WORKERS = 16
// Wrapped commands one stamped `storage cp` may run (cp, rm of the lock, mv of
// the meta). It counts only the commands wrapped below; subshell forks are
// covered by the static source check.
const BUDGET = 3

let tmp: string
let root: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shim-gen-'))
  root = path.join(tmp, 'gcs')
  fs.mkdirSync(path.join(root, 'b'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'src.txt'), 'x')
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('gcloud shim next_gen under parallel writers (#2800)', () => {
  it('gives every concurrent write its own integer generation', () => {
    // One upload per index, 16 shims at a time: each stamps a generation.
    const run = spawnSync(
      'bash',
      [
        '-c',
        `seq 1 ${WRITES} | xargs -P ${WORKERS} -I{} "$SHIM" storage cp "$TMP/src.txt" gs://b/o{}`,
      ],
      {
        env: {
          ...process.env,
          SHIM,
          TMP: tmp,
          SHIM_ROOT: root,
          SHIM_GENERATIONS: '1',
        },
        encoding: 'utf8',
      }
    )
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)

    const gens: string[] = []
    for (let i = 1; i <= WRITES; i++) {
      const meta = fs.readFileSync(path.join(root, '.meta/b', `o${i}`), 'utf8')
      const m = /^generation=(.*)$/m.exec(meta)
      expect(m, `o${i} has a generation`).not.toBeNull()
      gens.push(m![1]!)
    }
    for (const g of gens) expect(g).toMatch(/^\d+$/)
    expect(new Set(gens).size).toBe(WRITES)
  })

  // #3005: a process killed between the truncate and the write leaves an
  // empty counter. The shim must say so on stderr, naming the file.
  it('names the counter file on stderr when it is empty', () => {
    fs.writeFileSync(path.join(root, '.gen-counter'), '')
    const run = spawnSync(
      SHIM,
      ['storage', 'cp', path.join(tmp, 'src.txt'), 'gs://b/o'],
      {
        env: { ...process.env, SHIM_ROOT: root, SHIM_GENERATIONS: '1' },
        encoding: 'utf8',
      }
    )
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain(path.join(root, '.gen-counter'))
    // The failed stamp must not leave the lock behind.
    expect(fs.existsSync(path.join(root, '.gen-counter.lock'))).toBe(false)
  })

  // #3005: the fork-count test below counts the nine commands it wraps. It
  // cannot see a `$(...)` or `( ... )` subshell, which forks without running
  // any of them. This reads the source of the two functions on the hot path
  // (the lock is held while they run) and rejects both.
  it('keeps $(...) and ( ... ) subshells out of next_gen and stamp_generation', () => {
    const src = fs.readFileSync(SHIM, 'utf8').split('\n')
    const body: string[] = []
    let inside = false
    for (const line of src) {
      if (/^(next_gen|stamp_generation)\(\) \{/.test(line)) inside = true
      if (inside) body.push(line.replace(/^\s*#.*$/, ''))
      if (inside && line === '}') inside = false
    }
    expect(body.length).toBeGreaterThan(10)
    const code = body.join('\n')
    // `$((` is arithmetic, not a command substitution.
    expect(code.match(/\$\((?!\()/g) ?? []).toEqual([])
    expect(code.match(/`/g) ?? []).toEqual([])
    // A bare `(` opening a subshell: at the start of a command.
    expect(code.match(/(^\s*|[;&|]\s*|\bdo\s+|\bthen\s+)\(/gm) ?? []).toEqual(
      []
    )
  })

  // #3002: the counter lock serialises every write, so each process a stamp
  // forks inside it is paid 200 times in a row, and every process a waiter
  // forks while it polls is paid on top. Under two concurrent full suite runs
  // forks are slow and the 200 writes took 10.3 s against a 10 s limit (2.6 s
  // alone). Counting forks is the load-independent measure: a stamped upload
  // spawns only what it must (the copy, the lock removal, the meta rename),
  // and the counter and the meta rewrite use shell builtins.
  it('stamps a generation with a bounded number of forked wrapped commands', () => {
    const bin = path.join(tmp, 'bin')
    const log = path.join(tmp, 'spawns.log')
    fs.mkdirSync(bin)
    for (const name of [
      'cat',
      'cp',
      'dirname',
      'grep',
      'mkdir',
      'mv',
      'rm',
      'sleep',
      'touch',
    ]) {
      const real = ['/bin', '/usr/bin']
        .map(d => path.join(d, name))
        .find(f => fs.existsSync(f))
      writeStubExecutable(
        path.join(bin, name),
        `echo ${name} >>"$SPAWN_LOG"\nexec ${real} "$@"\n`
      )
    }
    const write = (name: string) =>
      spawnSync(
        SHIM,
        ['storage', 'cp', path.join(tmp, 'src.txt'), `gs://b/${name}`],
        {
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            SPAWN_LOG: log,
            SHIM_ROOT: root,
            SHIM_GENERATIONS: '1',
          },
          encoding: 'utf8',
        }
      )
    // The first write creates the counter; measure the second, which reads it.
    expect(write('one').status).toBe(0)
    fs.rmSync(log)
    const run = write('two')
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    const spawns = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean)
    // Uncontended: no lock retries, so no `sleep`; no `cat` for the counter.
    expect(spawns).not.toContain('sleep')
    expect(spawns).not.toContain('cat')
    expect(spawns.length, spawns.join(' ')).toBeLessThanOrEqual(BUDGET)
  })
})
