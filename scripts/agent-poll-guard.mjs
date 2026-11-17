// PreToolUse hook (#2895, ops#148): refuse hand-written CI polling.
//
// Every session on Ron's login shares one 5,000/h GitHub REST limit, and
// `sleep` + `gh pr checks` / `gh run view` loops spent it (#2892). Wait with
// `./bin/agent-cli ci-wait <pr>` instead (60 s default), or for a run that has
// no PR `gh run watch <id> --interval 60`.
//
// Rule: a Bash command that runs `sleep` AND `gh pr checks` or `gh run view`
// as commands (any shell form: `;`, `&&`, `||`, newline, while/for/until,
// `$( )`) is refused. Either alone is fine, so is every `agent-cli` command.
// #2897: `gh pr checks --watch` (10 s) and `gh run watch` with no `--interval`
// or one under 60 (3 s default) are refused too, with no `sleep` needed.
// Not covered, on purpose: `watch -n N gh ...` and loops over `gh api` check
// runs. They are rare, any pattern for them would be a guess, and the
// ci-wait rate-limit check (#2892) is the real defence. This is a habit
// stopper, not a boundary (see below).
//
// Limitation: text inside quotes and heredoc bodies is ignored, so a commit
// message or PR body that mentions the words passes. The flip side is that a
// loop hidden in a quoted string (`bash -c 'while ...'`, `eval "..."`) is not
// seen either. This stops the habit, it is not a security boundary. It is
// also not tied to CLAUDE_CODE_REMOTE: it runs locally and in the cloud, next
// to scripts/cloud-session-guard.sh, and either hook can deny.
//
// Hooks contract: exit 2 blocks the call and stderr goes to the model; exit 0
// allows it. A hook that cannot read its input fails open (it is a
// convenience, not the cloud guard).

import { readFileSync } from 'node:fs'

export const MESSAGE =
  'Do not poll CI with sleep and gh pr checks or gh run view: wait with ' +
  '`./bin/agent-cli ci-wait <pr>` (60 s default), or for a run with no PR ' +
  '`gh run watch <id> --interval 60`.'

/** Drop heredoc bodies and quoted strings, keeping the shell structure. */
export function stripText(command) {
  return String(command)
    .replace(
      /<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g,
      ' '
    )
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'[^']*'/g, "''")
}

// A command word: start of the command, or right after a separator, `(`,
// `{`, `$(`, a backtick, or a loop/branch keyword. It may be preceded by `!`, `time` and `VAR=value ` prefixes,
// and the program may be path-qualified (/opt/homebrew/bin/gh).
const CMD =
  String.raw`(?:^|[;&|(\n{` +
  '`' +
  String.raw`]|\b(?:do|then|else|while|until|if)\b)\s*` +
  String.raw`(?:!\s*)?(?:time\s+)?(?:\w+=\S*\s+)*(?:\S*/)?`

const SLEEP = new RegExp(CMD + String.raw`sleep\s+\S`)
const GH_POLL = new RegExp(
  CMD + String.raw`gh\b[^;&|\n)]*?\b(?:pr\s+checks|run\s+view)\b`
)

export const WATCH_MESSAGE =
  'Do not use gh pr checks --watch or gh run watch below --interval 60: wait ' +
  'with `./bin/agent-cli ci-wait <pr>` (60 s default), or for a run with no ' +
  'PR `gh run watch <id> --interval 60`.'

// gh polls on its own: every 10 s for `pr checks --watch`, every 3 s for
// `run watch`. Both are matched up to the end of the same shell command.
const PR_CHECKS_WATCH = new RegExp(
  CMD +
    String.raw`gh\b[^;&|\n)]*?\bpr\s+checks\b[^;&|\n)]*?(?:\s--watch\b|\s-w\b)`
)
const RUN_WATCH = new RegExp(
  CMD + String.raw`gh\b[^;&|\n)]*?\brun\s+watch\b([^;&|\n)]*)`
)
const INTERVAL = /\s(?:--interval|-i)(?:=|\s+)?(\S*)/
const MIN_INTERVAL = 60

/** True for `gh run watch` with no --interval, or one under 60 s. */
function runWatchTooFast(s) {
  const m = RUN_WATCH.exec(s)
  if (!m) return false
  const iv = INTERVAL.exec(m[1])
  if (!iv) return true
  const n = Number(iv[1].replace(/^=/, ''))
  return !(Number.isFinite(n) && n >= MIN_INTERVAL)
}

/** Returns the refusal message for a polling command, or null. */
export function checkPolling(command) {
  const s = stripText(command)
  if (SLEEP.test(s) && GH_POLL.test(s)) return MESSAGE
  if (PR_CHECKS_WATCH.test(s) || runWatchTooFast(s)) return WATCH_MESSAGE
  return null
}

function main() {
  let input
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    process.exit(0)
  }
  if (input?.tool_name !== 'Bash') process.exit(0)
  let reason = null
  try {
    reason = checkPolling(String(input?.tool_input?.command ?? ''))
  } catch {
    process.exit(0)
  }
  if (reason) {
    process.stderr.write(`${reason}\n`)
    process.exit(2)
  }
  process.exit(0)
}

main()
