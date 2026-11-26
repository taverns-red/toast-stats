/**
 * scripts/pipeline/list-restore-candidates.sh hands the planner gcloud's
 * stdout and stderr. A gcloud that dies part way (killed, out of memory)
 * can leave a shorter listing and an empty stderr; the script must then put
 * a line in the errors file so the planner refuses (#3258). A fake gcloud
 * stands in, so nothing here reaches GCS.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { checkListingErrors, RestorePlanError } from '../dataRestorePlan.js'
import { writeStubExecutable } from './stubExecutable.js'

const SCRIPT = path.join(
  process.cwd(),
  'scripts/pipeline/list-restore-candidates.sh'
)
const NONE = 'ERROR: (gcloud.storage.ls) One or more URLs matched no objects.'

// Prints FAKE_OUT on stdout and FAKE_ERR on stderr, then exits FAKE_RC.
const FAKE = `#!/usr/bin/env bash
printf '%s' "\${FAKE_OUT:-}"
[ -n "\${FAKE_ERR:-}" ] && printf '%s\\n' "\${FAKE_ERR}" >&2
exit "\${FAKE_RC:-0}"
`

let tmp: string
let out: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'list-restore-candidates-'))
  out = path.join(tmp, 'out')
  writeStubExecutable(path.join(tmp, 'gcloud'), FAKE)
  fs.writeFileSync(path.join(tmp, 'paths.txt'), 'a.json\nb.json\n')
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

const run = (rc: number, err = '') => {
  const r = spawnSync('bash', [SCRIPT, out, path.join(tmp, 'paths.txt')], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PROD_BUCKET: 'toast-stats-data-staging',
      GCLOUD: path.join(tmp, 'gcloud'),
      FAKE_OUT: '[\n]\n',
      FAKE_ERR: err,
      FAKE_RC: String(rc),
    },
  })
  expect(r.status, r.stderr).toBe(0)
  return (f: string) => fs.readFileSync(path.join(out, f), 'utf8')
}

describe('list-restore-candidates.sh: gcloud exit status (#3258)', () => {
  it('leaves the errors files clean when gcloud succeeds', () => {
    const read = run(0)
    expect(read('live.err')).toBe('')
    expect(read('soft.err')).toBe('')
  })

  it('passes "matched no objects" through as the only line', () => {
    const read = run(1, NONE)
    for (const f of ['live.err', 'soft.err']) {
      expect(() => checkListingErrors(read(f), f)).not.toThrow()
    }
  })

  it('makes the planner refuse when gcloud is killed with no stderr', () => {
    const read = run(137)
    for (const f of ['live.err', 'soft.err']) {
      expect(read(f)).toMatch(/exited 137/)
      expect(() => checkListingErrors(read(f), f)).toThrow(RestorePlanError)
    }
  })

  it('makes the planner refuse a failure with no "matched no objects" line', () => {
    const read = run(1)
    expect(() => checkListingErrors(read('soft.err'), 'soft')).toThrow(
      RestorePlanError
    )
  })

  it('refuses a kill even after a "matched no objects" line', () => {
    const read = run(137, NONE)
    expect(() => checkListingErrors(read('soft.err'), 'soft')).toThrow(
      RestorePlanError
    )
  })
})
