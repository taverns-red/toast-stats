/**
 * `scripts/trigger-daily-pipeline.sh` — dispatch retry + run confirmation
 * (#2496).
 *
 * On 2026-11-04 the workflow-dispatch API returned HTTP 500 once, the script
 * exited, and no daily run happened. The script must retry with backoff,
 * confirm a run actually started, and never dispatch twice when a "failed"
 * dispatch did start a run.
 *
 * Runs the real script with a fake `gh` on a temp HOME. No network, no real
 * dispatches.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve(process.cwd(), 'scripts/trigger-daily-pipeline.sh')

let dir: string

/**
 * A fake gh CLI.
 * - `workflow run`: counts dispatches; the first FAIL_TIMES fail with an HTTP
 *   500. With ACCEPT_ON_FAIL=1 a failing dispatch still starts a run (the 500
 *   came after GitHub accepted it). With NO_RUN=1 an accepted dispatch never
 *   shows up as a run.
 * - `run list`: renders $STATE/runs (one "id createdAt" per line) as the
 *   `--json` array and applies the script's `--jq` filter with real jq.
 */
const FAKE = `#!/usr/bin/env bash
set -u
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
add_run() { echo "$((1000 + $(wc -l < "$STATE/runs"))) $(now)" >> "$STATE/runs"; }
if [[ "$1" == "workflow" && "$2" == "run" ]]; then
  n=$(cat "$STATE/dispatches" 2>/dev/null || echo 0)
  echo $((n + 1)) > "$STATE/dispatches"
  if ((n < FAIL_TIMES)); then
    [[ "\${ACCEPT_ON_FAIL:-0}" == "1" ]] && add_run
    echo "HTTP 500: Internal Server Error" >&2
    exit 1
  fi
  [[ "\${NO_RUN:-0}" == "1" ]] || add_run
  exit 0
fi
if [[ "$1" == "run" && "$2" == "list" ]]; then
  jqexpr=""
  while (($#)); do
    if [[ "$1" == "--jq" ]]; then jqexpr="$2"; shift; fi
    shift
  done
  json=$(awk 'BEGIN{printf "["} NR>1{printf ","} {printf "{\\"databaseId\\":%s,\\"createdAt\\":\\"%s\\"}", $1, $2} END{print "]"}' "$STATE/runs")
  if [[ -n "$jqexpr" ]]; then echo "$json" | jq -r "$jqexpr"; else echo "$json"; fi
  exit 0
fi
echo "fake gh: unexpected args: $*" >&2
exit 2
`

function run(env: Record<string, string>) {
  return spawnSync('bash', [SCRIPT], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      HOME: dir,
      STATE: dir,
      TRIGGER_GH: join(dir, 'gh'),
      TRIGGER_OSASCRIPT: 'true',
      TRIGGER_RETRY_DELAYS: '0 0 0 0',
      TRIGGER_CONFIRM_POLLS: '2',
      TRIGGER_CONFIRM_INTERVAL: '0',
      FAIL_TIMES: '0',
      ...env,
    },
  })
}

const dispatches = () =>
  Number(readFileSync(join(dir, 'dispatches'), 'utf-8').trim())
const logLines = () =>
  readFileSync(
    join(dir, 'Library/Logs/toast-stats/daily-pipeline-trigger.log'),
    'utf-8'
  )
    .trim()
    .split('\n')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'daily-trigger-'))
  writeFileSync(join(dir, 'gh'), FAKE)
  chmodSync(join(dir, 'gh'), 0o755)
  // A run from before the trigger — it must never count as today's run.
  writeFileSync(join(dir, 'runs'), '999 2026-01-01T05:00:00Z\n')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('trigger-daily-pipeline.sh (#2496)', () => {
  it('dispatches once and confirms the run on the happy path', () => {
    const r = run({})
    expect(r.status).toBe(0)
    expect(dispatches()).toBe(1)
    expect(logLines().at(-1)).toMatch(/Run 1001 started/)
  })

  it('retries failed dispatches with backoff, then confirms the run', () => {
    const r = run({ FAIL_TIMES: '2' })
    expect(r.status).toBe(0)
    expect(dispatches()).toBe(3)
    const log = logLines()
    expect(log.filter(l => /Dispatch attempt \d\/5/.test(l))).toHaveLength(3)
    expect(log.some(l => /attempt 1\/5 failed/.test(l))).toBe(true)
    expect(log.at(-1)).toMatch(/Run 1001 started/)
  })

  it('does not dispatch again when a failed dispatch still started a run', () => {
    const r = run({ FAIL_TIMES: '1', ACCEPT_ON_FAIL: '1' })
    expect(r.status).toBe(0)
    expect(dispatches()).toBe(1)
    expect(logLines().at(-1)).toMatch(/Run 1001 started/)
  })

  it('exits non-zero with a clear final line when every attempt fails', () => {
    const r = run({ FAIL_TIMES: '99' })
    expect(r.status).not.toBe(0)
    expect(dispatches()).toBe(5)
    expect(logLines().at(-1)).toMatch(
      /ERROR: no data-pipeline run started after 5 dispatch attempts/
    )
  })

  it('fails when dispatches are accepted but no run ever appears', () => {
    const r = run({ NO_RUN: '1' })
    expect(r.status).not.toBe(0)
    expect(logLines().at(-1)).toMatch(/ERROR: no data-pipeline run started/)
  })
})
