/**
 * `scripts/basemap/build-basemap.sh` — retry behaviour (#2084).
 *
 * go-pmtiles 1.31.2 has no retry or resume, so the script owns both:
 * - an outer retry around `pmtiles extract` (PMTILES_EXTRACT_ATTEMPTS),
 *   deleting the partial output before every attempt (extract writes the
 *   header last, so a partial file must never be verified or uploaded);
 * - the extract reads through scripts/basemap/range-proxy.mjs, which resumes
 *   a dropped upstream range (basemapRangeProxy.test.ts).
 *
 * Runs the real script with a fake `pmtiles` CLI. No network.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve(process.cwd(), 'scripts/basemap/build-basemap.sh')

let dir: string

/**
 * A fake pmtiles CLI. `extract` fails (leaving a partial file) while the
 * counter is below FAIL_TIMES, and logs each input URL and whether the output
 * already existed when it started.
 */
const FAKE = `#!/usr/bin/env bash
set -u
case "$1" in
  version) echo "pmtiles fake"; exit 0 ;;
  verify) [[ "$(cat "$2")" == "complete" ]]; exit $? ;;
  extract)
    n=$(cat "$STATE/count" 2>/dev/null || echo 0)
    echo $((n + 1)) > "$STATE/count"
    if [[ -e "$3" ]]; then echo "stale" >> "$STATE/log"; fi
    echo "src=$2" >> "$STATE/log"
    if [[ -n "\${FETCH:-}" ]]; then
      curl -fsS -r 0-3 "$2" > "$STATE/fetched" || exit 9
    fi
    if ((n < FAIL_TIMES)); then
      printf 'partial' > "$3"
      echo "stream error: stream ID 3; INTERNAL_ERROR" >&2
      exit 1
    fi
    printf 'complete' > "$3"
    exit 0 ;;
esac
exit 2
`

function run(env: Record<string, string>) {
  return spawnSync('bash', [SCRIPT, '20261015', '14', join(dir, 'out')], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PMTILES: join(dir, 'pmtiles'),
      STATE: dir,
      PMTILES_EXTRACT_BACKOFF_SECONDS: '0',
      BASEMAP_RANGE_PROXY: '0',
      ...env,
    },
  })
}

const log = () => readFileSync(join(dir, 'log'), 'utf-8').trim().split('\n')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'basemap-build-'))
  writeFileSync(join(dir, 'pmtiles'), FAKE)
  chmodSync(join(dir, 'pmtiles'), 0o755)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('build-basemap.sh retry (#2084)', () => {
  it('retries a failed extract and succeeds on a later attempt', () => {
    const r = run({ FAIL_TIMES: '2', PMTILES_EXTRACT_ATTEMPTS: '4' })
    expect(r.status).toBe(0)
    expect(readFileSync(join(dir, 'count'), 'utf-8').trim()).toBe('3')
    const out = JSON.parse(r.stdout.trim()) as { object: string; bytes: number }
    expect(out.object).toBe('basemap/protomaps-v4/world-z0-14-20261015.pmtiles')
    expect(out.bytes).toBe('complete'.length)
    expect(r.stderr).toMatch(/attempt 1\/4 failed/)
    expect(r.stderr).toMatch(/attempt 2\/4 failed/)
  })

  it('deletes the partial output before every retry', () => {
    const r = run({ FAIL_TIMES: '2', PMTILES_EXTRACT_ATTEMPTS: '4' })
    expect(r.status).toBe(0)
    expect(log()).not.toContain('stale')
  })

  it('fails, with no output left behind, after the last attempt', () => {
    const r = run({ FAIL_TIMES: '9', PMTILES_EXTRACT_ATTEMPTS: '3' })
    expect(r.status).not.toBe(0)
    expect(readFileSync(join(dir, 'count'), 'utf-8').trim()).toBe('3')
    expect(r.stdout).toBe('')
    expect(existsSync(join(dir, 'out', 'world-z0-14-20261015.pmtiles'))).toBe(
      false
    )
    expect(r.stderr).toMatch(/extract failed after 3 attempts/)
  })

  it('defaults to 4 attempts', () => {
    const r = run({ FAIL_TIMES: '9' })
    expect(r.status).not.toBe(0)
    expect(readFileSync(join(dir, 'count'), 'utf-8').trim()).toBe('4')
  })

  it('reads the source directly when the proxy is off', () => {
    const r = run({ FAIL_TIMES: '0' })
    expect(r.status).toBe(0)
    expect(log()).toEqual(['src=https://build.protomaps.com/20261015.pmtiles'])
  })

  it('routes extract through the local range proxy by default', async () => {
    const data = Buffer.from('PMTiles-fake-archive')
    const server = http.createServer((req, res) => {
      const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '')
      const a = Number(m![1])
      const b = Number(m![2])
      res.writeHead(206, {
        'Content-Range': `bytes ${a}-${b}/${data.length}`,
        'Content-Length': b - a + 1,
      })
      res.end(data.subarray(a, b + 1))
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      // spawnSync would block the in-process upstream; run async.
      const { spawn } = await import('node:child_process')
      const child = spawn(
        'bash',
        [SCRIPT, '20261015', '14', join(dir, 'out')],
        {
          env: {
            ...process.env,
            PMTILES: join(dir, 'pmtiles'),
            STATE: dir,
            FAIL_TIMES: '0',
            FETCH: '1',
            PMTILES_EXTRACT_BACKOFF_SECONDS: '0',
            BASEMAP_SOURCE_BASE: base,
            BASEMAP_RANGE_PROXY: '',
          },
        }
      )
      const code = await new Promise<number | null>(r => child.on('exit', r))
      expect(code).toBe(0)
      const src = log()[0]
      expect(src).toMatch(/^src=http:\/\/127\.0\.0\.1:\d+\/20261015\.pmtiles$/)
      expect(src).not.toContain(base)
      expect(readFileSync(join(dir, 'fetched'), 'utf-8')).toBe('PMTi')
    } finally {
      await new Promise(r => server.close(r))
    }
  })
})
