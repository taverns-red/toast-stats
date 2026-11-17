/**
 * #2895: PreToolUse hook that refuses hand-written CI polling.
 *
 * Every session on Ron's login shares one 5,000/h GitHub REST limit, and
 * `sleep` + `gh pr checks` / `gh run view` loops spent it (ops#148, #2892).
 * `scripts/agent-poll-guard.mjs` reads the hook JSON from stdin, exits 2
 * (stderr goes to the model) for such a command and 0 for everything else.
 * It does not depend on CLAUDE_CODE_REMOTE: it runs locally and in the cloud.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const SCRIPT = resolve(ROOT, 'scripts/agent-poll-guard.mjs')
const SETTINGS = resolve(ROOT, '.claude/settings.json')

function run(command: string, tool = 'Bash') {
  return spawnSync('node', [SCRIPT], {
    input: JSON.stringify({ tool_name: tool, tool_input: { command } }),
    env: { PATH: process.env.PATH ?? '' },
    encoding: 'utf8',
  })
}

const blocked = [
  'while true; do gh pr checks 12; sleep 30; done',
  'sleep 30 && gh pr checks 12',
  'gh pr checks 12; sleep 30; gh pr checks 12',
  'for i in 1 2 3; do sleep 60; gh run view 123 --json status; done',
  'until gh run view 123 --exit-status; do sleep 20; done',
  'sleep 20 && gh run view 123',
  'gh pr checks 12 --watch || (sleep 5 && gh pr checks 12)',
  'gh -R taverns-red/toast-stats pr checks 12 ; sleep 10',
  'sleep 5\ngh pr checks 12',
  'x=$(sleep 5; gh run view 9)',
]

const allowed = [
  'sleep 5',
  'gh pr checks 12',
  'gh run view 123 --log-failed',
  'gh run watch 123 --interval 60',
  './bin/agent-cli ci-wait 2895',
  './bin/agent-cli ci-wait 2895 --interval 60',
  'gh pr view 12 && echo done',
  'git commit -m "docs: stop using sleep with gh pr checks (#2895)"',
  "git commit -m 'while true; do gh pr checks 1; sleep 3; done'",
  'cat <<EOF\nsleep 30; gh pr checks 12\nEOF',
  "gh pr create --body-file b.md --title 'no sleep; gh run view loops'",
]

describe('agent-poll-guard (#2895)', () => {
  it.each(blocked)('blocks %j', command => {
    const r = run(command)
    expect(r.status).toBe(2)
  })

  it.each(allowed)('allows %j', command => {
    const r = run(command)
    expect(r.status).toBe(0)
  })

  it('tells the session to use ci-wait and gh run watch, in one sentence', () => {
    const r = run('while true; do gh pr checks 12; sleep 30; done')
    expect(r.stderr).toContain('./bin/agent-cli ci-wait <pr>')
    expect(r.stderr).toContain('gh run watch <id> --interval 60')
    expect(r.stderr.trim().split('\n')).toHaveLength(1)
  })

  it('ignores tools other than Bash', () => {
    expect(run('sleep 3; gh pr checks 1', 'Write').status).toBe(0)
  })

  it('does not depend on a cloud session', () => {
    const r = spawnSync('node', [SCRIPT], {
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'sleep 1; gh run view 1' },
      }),
      env: { PATH: process.env.PATH ?? '', CLAUDE_CODE_REMOTE: 'true' },
      encoding: 'utf8',
    })
    expect(r.status).toBe(2)
  })

  it('allows the call when the hook input is not JSON (a convenience hook fails open)', () => {
    const r = spawnSync('node', [SCRIPT], {
      input: 'not json',
      env: { PATH: process.env.PATH ?? '' },
      encoding: 'utf8',
    })
    expect(r.status).toBe(0)
  })
})

describe('.claude/settings.json wires the poll guard (#2895)', () => {
  type Group = {
    matcher?: string
    hooks: { type: string; command: string; timeout?: number }[]
  }
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8')) as {
    hooks: Record<string, Group[]>
  }
  const bashHooks = (settings.hooks.PreToolUse ?? [])
    .filter(g => g.matcher === 'Bash')
    .flatMap(g => g.hooks.map(h => h.command))

  it('runs it as a PreToolUse Bash hook', () => {
    expect(bashHooks).toContain(
      'node "$CLAUDE_PROJECT_DIR"/scripts/agent-poll-guard.mjs'
    )
  })

  it('still runs the cloud session guard on Bash', () => {
    expect(bashHooks).toContain(
      '"$CLAUDE_PROJECT_DIR"/scripts/cloud-session-guard.sh'
    )
  })
})
