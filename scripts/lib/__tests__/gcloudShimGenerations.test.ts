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

const SHIM = path.join(
  process.cwd(),
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const WRITES = 200
const WORKERS = 16

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
  }, 120_000)
})
