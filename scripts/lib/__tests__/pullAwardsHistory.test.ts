/**
 * Fail-closed pull of district-awards-history.json (#1704).
 *
 * Every mode used to pull the store with `2>/dev/null || true`, so an auth or
 * transport error looked exactly like "first run": the transform started from
 * an empty store and the push at the end replaced the accumulated GCS copy.
 * The helper tolerates ONLY a missing object. The missing-object text below is
 * what Google Cloud SDK 583.0.0 prints for `gcloud storage cp` on an absent
 * object; a missing bucket prints "... not found: 404." and must still fail.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const SCRIPT = path.resolve(process.cwd(), 'scripts/pull-awards-history.sh')

let dir: string

/** Put a fake `gcloud` on PATH that runs the given shell body. */
function fakeGcloud(body: string): void {
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  const f = path.join(bin, 'gcloud')
  fs.writeFileSync(f, `#!/usr/bin/env bash\n${body}\n`)
  fs.chmodSync(f, 0o755)
}

function run(dest: string) {
  return spawnSync('bash', [SCRIPT, 'test-bucket', dest], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
    },
  })
}

describe('scripts/pull-awards-history.sh (#1704)', () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pull-awards-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('copies the object from the bucket to the destination', () => {
    // args: storage cp <src> <dest>
    fakeGcloud('echo "$3" > "$4.src"; echo \'{"version":1}\' > "$4"')
    const dest = path.join(dir, 'cache', 'district-awards-history.json')
    const r = run(dest)
    expect(r.status).toBe(0)
    expect(fs.readFileSync(dest, 'utf-8').trim()).toBe('{"version":1}')
    expect(fs.readFileSync(`${dest}.src`, 'utf-8').trim()).toBe(
      'gs://test-bucket/district-awards-history.json'
    )
  })

  it('succeeds with no file when the object does not exist yet (first run)', () => {
    fakeGcloud(
      'echo "ERROR: (gcloud.storage.cp) The following URLs matched no objects or files:" >&2\n' +
        'echo "$3" >&2; exit 1'
    )
    const dest = path.join(dir, 'cache', 'district-awards-history.json')
    const r = run(dest)
    expect(r.status).toBe(0)
    expect(fs.existsSync(dest)).toBe(false)
  })

  it('fails on a missing bucket rather than treating it as first run', () => {
    fakeGcloud(
      'echo "ERROR: (gcloud.storage.cp) gs://test-bucket not found: 404." >&2; exit 1'
    )
    const r = run(path.join(dir, 'cache', 'district-awards-history.json'))
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('not found: 404')
  })

  it('fails on an auth or transport error', () => {
    fakeGcloud(
      'echo "ERROR: (gcloud.storage.cp) HTTPError 503: Service Unavailable" >&2; exit 1'
    )
    const r = run(path.join(dir, 'cache', 'district-awards-history.json'))
    expect(r.status).not.toBe(0)
  })
})
