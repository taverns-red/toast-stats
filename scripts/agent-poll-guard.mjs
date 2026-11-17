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
// `gh pr checks --watch` is refused even with `--interval 60`: CLAUDE.md bans
// `gh pr checks` for waiting, and that repo rule wins over #2897's wording.
// `-w` on `gh pr checks` is `--web`, so it is not matched.
//
// Known bypasses, all by design: a prefix before `gh` that the command-word
// pattern does not skip (`command gh ...`, `env gh ...`, `nohup gh ...`,
// `timeout 600 gh ...`, `exec gh ...`) and a quoted program name (`"gh" run
// watch 1`). Aliases, scripts and `bash -c '...'` hide the call as well. The
// guard is a habit stopper, not a boundary.
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

/**
 * Drop heredoc bodies, quoted strings and `#` comments, and join backslash-
 * newline continuations, keeping the shell structure.
 */
export function stripText(command) {
  const text = String(command)
    .replace(/\\\r?\n/g, ' ')
    .replace(
      /<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g,
      ' '
    )
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '\\') {
      out += text.slice(i, i + 2)
      i += 2
    } else if (c === '"' || c === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== c)
        j += c === '"' && text[j] === '\\' ? 2 : 1
      if (j >= text.length) {
        out += c // unterminated: keep it and carry on
        i += 1
      } else {
        out += c + c
        i = j + 1
      }
    } else if (c === '#' && (i === 0 || /[\s;&|(]/.test(text[i - 1]))) {
      while (i < text.length && text[i] !== '\n') i += 1
    } else {
      out += c
      i += 1
    }
  }
  return out
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
// `run watch`. Each `gh` command is cut at the next separator and its
// arguments are checked on their own, so the cost stays linear.
const GH_COMMAND = new RegExp(CMD + String.raw`gh\b([^;&|\n)]*)`, 'g')
const INTERVAL = /\s(?:--interval|-i)(?:=|\s+)?(\S*)/g
const MIN_INTERVAL = 60

/** True for no --interval, or a last one that is not a plain number >= 60. */
function intervalTooFast(args) {
  let last = null
  for (const m of args.matchAll(INTERVAL)) last = m[1]
  if (last === null) return true
  return !(/^[1-9]\d*$/.test(last) && Number(last) >= MIN_INTERVAL)
}

function pollsFast(args) {
  if (/\bpr\s+checks\b/.test(args) && /\s--watch\b/.test(args)) return true
  const w = /\brun\s+watch\b/.exec(args)
  return w !== null && intervalTooFast(args.slice(w.index))
}

/** Returns the refusal message for a polling command, or null. */
export function checkPolling(command) {
  const s = stripText(command)
  if (SLEEP.test(s) && GH_POLL.test(s)) return MESSAGE
  for (const m of s.matchAll(GH_COMMAND)) {
    if (pollsFast(m[1])) return WATCH_MESSAGE
  }
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
