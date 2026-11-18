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
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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
  'while ! gh pr checks 12 | grep -q pass; do sleep 30; done',
  'sleep 30; GH_PAGER= gh pr checks 12',
  'sleep 30; /opt/homebrew/bin/gh pr checks 12',
  'sleep 30; echo `gh pr checks 12`',
  'sleep 30; time gh run view 1',
  // #2897: watch forms poll GitHub without any sleep
  'gh pr checks 12 --watch',
  'gh pr checks --watch 12',
  'gh pr checks 12 --watch --interval 60',
  'gh -R taverns-red/toast-stats pr checks 12 --watch',
  'gh run watch 123',
  'gh run watch 123 --exit-status',
  'gh run watch 123 --interval 30',
  'gh run watch 123 --interval=30',
  'gh run watch 123 -i 30',
  'gh run watch 123 -i=30',
  'gh run watch 123 --interval 59',
  'gh run watch 123 --interval abc',
  'echo start; gh run watch 123',
  '/opt/homebrew/bin/gh run watch 123 --interval 10',
  // #2897 review: every gh run watch counts, not just the first
  'gh run watch 1 --interval 60; gh run watch 2',
  'gh run watch 1 --interval 60 & gh run watch 2',
  'gh run watch 1 --interval 60 && gh run watch 2 --interval 5',
  // the last --interval wins, as in gh
  'gh run watch 1 --interval 60 --interval 3',
  'gh run watch 1 -i 60 -i 3',
  'gh run watch 1 --interval=60 --interval=3',
  // comments and line continuations
  'gh run watch 1 # --interval 60',
  "gh run watch 1 # don't poll fast",
  'gh pr checks 1 \\\n --watch',
  'gh run \\\n watch 1',
  // leading zeros are invalid
  'gh run watch 1 --interval 060',
  'gh run watch 1 --interval=070',
  // #2918: `\'` escapes a quote inside $'..'
  "echo $'\\'' ; gh run watch 1 ; echo $'\\''",
  // #2918: a heredoc marker inside a comment or quotes starts no heredoc
  '# <<EOF\ngh run watch 1\nEOF',
  "echo '<<EOF'\ngh run watch 1\nEOF",
  'git commit -m "x <<EOF"\ngh run watch 1\nEOF',
  'echo $((1<<2))\ngh run watch 1',
  // #2918 review: the whole delimiter word counts, and a body whose
  // terminator never appears must not swallow the rest of the command
  'cat <<A-B\nA-B\ngh run watch 1',
  'cat <<E"F"\nEF\ngh run watch 1',
  'cat <<"E"F\nEF\ngh run watch 1',
  'cat <<EOF.x\nEOF.x\ngh run watch 1',
  'echo $((1<<y))\ngh run watch 1',
  '((a<<b))\ngh run watch 1',
  'cat <<EOF\ngh run watch 1',
  // #2918: redirections and substitutions don't hide a fast interval
  'gh run watch 1 2>&1 --interval 30',
  'gh run watch $(echo 1) --interval 30',
  'gh run watch $(echo 1)',
  'gh pr view $(gh run watch 1) --json state',
  'gh pr checks 1 --watch=true',
  'gh run watch 1 --interval "30"',
  // text after a heredoc operator on its line is still a command
  'cat <<EOF | gh run watch 1\nbody\nEOF',
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
  // #2897
  'gh run watch 123 --interval 60',
  'gh run watch 123 --interval=60',
  'gh run watch 123 -i 60',
  'gh run watch 123 --interval 120 --exit-status',
  'gh run watch --interval 60 123',
  'gh run list --limit 5',
  'git commit -m "docs: never gh run watch without --interval (#2897)"',
  'cat <<EOF\ngh pr checks 12 --watch\nEOF',
  // -w on gh pr checks is --web, not --watch
  'gh pr checks 12 -w',
  // the last --interval wins, as in gh
  'gh run watch 1 --interval 3 --interval 60',
  'gh run watch 1 \\\n --interval 60',
  'echo hi # gh run watch 1',
  'gh run watch 1 --interval 60 # then wait',
  'gh run watch 1 --interval 60; gh run watch 2 --interval 90',
  // #2918: quoted and escaped heredoc delimiters strip their bodies too
  'cat <<\\EOF\ngh pr checks 1 --watch\nEOF',
  "cat <<'EOF'\ngh pr checks 1 --watch\nEOF",
  'cat <<"EOF"\ngh pr checks 1 --watch\nEOF',
  'cat <<-EOF\n\tgh pr checks 1 --watch\n\tEOF',
  'cat <<EOF\nsleep 3; gh run view 1\nEOF\ngit status',
  // #2918: false positives
  'gh run watch 1 2>&1 --interval 60',
  'gh run watch 1 --interval 60 >&2',
  'gh run watch $(echo 1) --interval 60',
  'gh pr checks 1 --watch=false',
  'gh run watch 1 --interval "60"',
  "gh run watch 1 --interval '60'",
  "echo $'it\\'s' ; gh run list",
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

  it.each(['gh pr checks 12 --watch', 'gh run watch 123 --interval 30'])(
    'names the allowed alternative, on stderr only, when it blocks %j (#2897)',
    command => {
      const r = run(command)
      expect(r.status).toBe(2)
      expect(r.stdout).toBe('')
      expect(r.stderr).toContain('./bin/agent-cli ci-wait <pr>')
      expect(r.stderr).toContain('gh run watch <id> --interval 60')
      expect(r.stderr.trim().split('\n')).toHaveLength(1)
    }
  )

  it('checks a 400 KB command in linear time (#2897)', () => {
    const command = 'gh ' + 'pr checks '.repeat(40000)
    const start = Date.now()
    const r = spawnSync('node', [SCRIPT], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
      env: { PATH: process.env.PATH ?? '' },
      encoding: 'utf8',
      timeout: 20000,
    })
    expect(r.status).toBe(0)
    expect(Date.now() - start).toBeLessThan(1500)
  })

  it('checks 160 KB of heredoc operators in linear time (#2918)', () => {
    const command = '<<A\n'.repeat(40000)
    const start = Date.now()
    const r = spawnSync('node', [SCRIPT], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
      env: { PATH: process.env.PATH ?? '' },
      encoding: 'utf8',
      timeout: 20000,
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
    expect(Date.now() - start).toBeLessThan(1500)
  })

  it('fails open when the hook input has no command (#2897)', () => {
    const r = spawnSync('node', [SCRIPT], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: {} }),
      env: { PATH: process.env.PATH ?? '' },
      encoding: 'utf8',
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })

  it('still blocks when started through a symlinked path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poll-guard-2895-'))
    try {
      const link = join(dir, 'link')
      symlinkSync(ROOT, link)
      const r = spawnSync(
        'node',
        [join(link, 'scripts/agent-poll-guard.mjs')],
        {
          input: JSON.stringify({
            tool_name: 'Bash',
            tool_input: {
              command: 'while true; do gh pr checks 12; sleep 30; done',
            },
          }),
          env: { PATH: process.env.PATH ?? '' },
          encoding: 'utf8',
        }
      )
      expect(r.status).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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
