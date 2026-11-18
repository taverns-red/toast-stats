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
// Also not seen: a `gh` command nested more than one `$( )` deep inside
// another `gh` command's arguments, and backtick substitutions there (#2918).
// Heredocs, quotes (`'..'`, `".."`, `$'..'`) and comments are read in one
// left-to-right pass, so `# <<EOF` or `echo '<<EOF'` starts no heredoc.
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
  const text = String(command).replace(/\\\r?\n/g, ' ')
  // One left-to-right pass, so a `<<EOF` inside a comment or a quote starts
  // no heredoc (#2918). A heredoc's body starts after the newline that ends
  // its line and runs to a line holding only the delimiter.
  let out = ''
  let i = 0
  let pending = [] // heredoc delimiters waiting for the end of their line
  const absent = new Set() // delimiters with no terminator line left in text
  let shielded = -1 // a `<<` before this index sits inside `$[..]` or `${..}`
  const noClose = new Set() // `]` / `}` with no closer left in text
  while (i < text.length) {
    const c = text[i]
    if (c === '\\') {
      out += text.slice(i, i + 2)
      i += 2
    } else if (c === '"' || c === "'" || (c === '$' && text[i + 1] === "'")) {
      // `$'..'` honours `\'` like a double quote does (#2918).
      const ansi = c === '$'
      const q = ansi ? "'" : c
      const start = i + (ansi ? 2 : 1)
      let j = start
      while (j < text.length && text[j] !== q)
        j += (q === '"' || ansi) && text[j] === '\\' ? 2 : 1
      if (j >= text.length) {
        out += c // unterminated: keep it and carry on
        i += 1
      } else {
        // A plain number stays readable: `--interval "60"` is 60 (#2918).
        const inner = text.slice(start, j)
        out += /^\d{1,6}$/.test(inner) ? inner : (ansi ? '$' : '') + q + q
        i = j + 1
      }
    } else if (c === '#' && (i === 0 || /[\s;&|(]/.test(text[i - 1]))) {
      while (i < text.length && text[i] !== '\n') i += 1
    } else if (c === '(' && text[i + 1] === '(') {
      // `((..))` and `$((..))` are arithmetic: a `<<` in there is a shift, not
      // a heredoc. The text stays visible to the scanner (fail closed).
      const close = arithmeticEnd(text, i)
      if (close === -1) {
        out += c
        i += 1
      } else {
        out += text.slice(i, close)
        i = close
      }
    } else if (c === '$' && (text[i + 1] === '[' || text[i + 1] === '{')) {
      // `$[..]` is arithmetic and `${..}` an expansion: a `<<` inside is no
      // heredoc. The text stays visible to the scanner (fail closed). Each
      // search resumes after the last one, so this stays linear.
      const closer = text[i + 1] === '[' ? ']' : '}'
      if (i < shielded || noClose.has(closer)) {
        out += c
        i += 1
      } else {
        const close = text.indexOf(closer, i + 2)
        if (close === -1) {
          noClose.add(closer)
          out += c
          i += 1
        } else {
          shielded = close
          out += c
          i += 1
        }
      }
    } else if (c === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      const op =
        text[i - 1] !== '<' && !(i < shielded) ? parseHeredoc(text, i) : null
      if (op) {
        pending.push(op.delim)
        out += ' '
        i = op.end
      } else {
        out += '<<'
        i += 2
      }
    } else if (c === '\n') {
      out += c
      i += 1
      // Fail closed: a body is dropped only when its exact terminator line is
      // found. Otherwise the text stays visible to the scanner.
      for (const delim of pending) {
        if (absent.has(delim)) break
        const end = bodyEnd(text, i, delim)
        if (end === -1) {
          // No terminator anywhere after here, so none after a later `<<` of
          // the same word either: remember it to stay linear.
          absent.add(delim)
          break
        }
        i = end
      }
      pending = []
    } else {
      out += c
      i += 1
    }
  }
  return out
}

/**
 * Read a heredoc operator at `i` (`<<`, optional `-`, optional blanks, then a
 * delimiter word). The whole word counts, with `'..'`, `".."` and `\x` parts
 * joined as bash does (`E"F"` is `EF`). Returns null for anything unusual, so
 * the text stays visible.
 */
function parseHeredoc(text, i) {
  let j = i + 2
  if (text[j] === '-') j += 1
  while (text[j] === ' ' || text[j] === '\t') j += 1
  let delim = ''
  const start = j
  while (j < text.length && !/[\s;&|()<>]/.test(text[j])) {
    const ch = text[j]
    if (ch === "'" || ch === '"') {
      const close = text.indexOf(ch, j + 1)
      if (close === -1) return null
      delim += text.slice(j + 1, close)
      j = close + 1
    } else if (ch === '\\') {
      if (j + 1 >= text.length || text[j + 1] === '\n') return null
      delim += text[j + 1]
      j += 2
    } else if (ch === '$' || ch === '`') {
      return null // expansions are not performed, but do not guess
    } else {
      delim += ch
      j += 1
    }
  }
  if (j === start || delim === '' || delim.includes('\n')) return null
  return { delim, end: j }
}

/** Index just past the line holding only `delim`, or -1 when there is none. */
function bodyEnd(text, from, delim) {
  let i = from
  while (i < text.length) {
    let end = text.indexOf('\n', i)
    if (end === -1) end = text.length
    const line = text.slice(i, end).trim()
    i = Math.min(end + 1, text.length)
    if (line === delim) return i
    // Inside `$( )` bash also ends the body at `DELIM)`, so end it there too.
    // Ending early only keeps more text visible (fail closed).
    if (line.startsWith(delim) && /^\s*\)/.test(line.slice(delim.length)))
      return i
  }
  return -1
}

/** Index just past the `))` that closes the `((` at `i`, or -1. */
function arithmeticEnd(text, i) {
  let depth = 0
  // Capped, so a long run of `((` stays linear overall.
  const stop = Math.min(text.length, i + 2000)
  for (let j = i; j < stop; j += 1) {
    if (text[j] === '(') depth += 1
    else if (text[j] === ')') {
      depth -= 1
      if (depth === 0) return text[j - 1] === ')' && j - 1 > i ? j + 1 : -1
    }
  }
  return -1
}

// A command word: start of the command, or right after a separator, `(`,
// `{`, `$(`, a backtick, or a loop/branch keyword. It may be preceded by `!`, `time` and `VAR=value ` prefixes,
// and the program may be path-qualified (/opt/homebrew/bin/gh).
// Blanks between the parts never include a newline: `\n` is a separator on
// its own, and a run of blank lines must not be rescanned from every newline.
const CMD =
  String.raw`(?:^|[;&|(\n{` +
  '`' +
  String.raw`]|\b(?:do|then|else|while|until|if)\b)[^\S\n]*` +
  String.raw`(?:![^\S\n]*)?(?:time[^\S\n]+)?(?:\w+=\S*[^\S\n]+)*(?:\S*/)?`

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
// An argument list may hold `$( )` substitutions (one level), so a `)` inside
// one does not cut it short (#2918).
const SUBST = String.raw`\$\([^()]*\)`
const GH_COMMAND = new RegExp(
  CMD + String.raw`gh\b((?:${SUBST}|[^;&|\n)$]|\$(?!\())*)`,
  'g'
)
const INTERVAL = /\s(?:--interval|-i)(?:=|\s+)?(\S*)/g
const MIN_INTERVAL = 60

/** True for no --interval, or a last one that is not a plain number >= 60. */
function intervalTooFast(args) {
  let last = null
  for (const m of args.matchAll(INTERVAL)) last = m[1]
  if (last === null) return true
  return !(/^[1-9]\d*$/.test(last) && Number(last) >= MIN_INTERVAL)
}

// `--watch` on, but not `--watch=false` / `--watch=0` (#2918).
const WATCH_ON = /\s--watch(?:=(?!(?:false|0)(?:\s|$))\S*)?(?=\s|$)/

function pollsFast(args) {
  const flat = args.replace(new RegExp(SUBST, 'g'), ' X ')
  if (/\bpr\s+checks\b/.test(flat) && WATCH_ON.test(flat)) return true
  const w = /\brun\s+watch\b/.exec(flat)
  return w !== null && intervalTooFast(flat.slice(w.index))
}

/** True when a `gh` command in `s` (or inside a `$( )` in its arguments) polls fast. */
function pollsFastIn(s) {
  for (const m of s.matchAll(GH_COMMAND)) {
    if (pollsFast(m[1])) return true
    for (const sub of m[1].matchAll(new RegExp(SUBST, 'g'))) {
      if (pollsFastIn(sub[0].slice(2, -1))) return true
    }
  }
  return false
}

/** Returns the refusal message for a polling command, or null. */
export function checkPolling(command) {
  // File-descriptor redirections (`2>&1`, `>&2`, `&>`) hold a `&` that would
  // cut a command short, so they are dropped first (#2918).
  const s = stripText(command)
    .replace(/\d*[<>]&(?:\d+-?|-)?/g, ' ')
    .replace(/&>>?/g, ' ')
  if (SLEEP.test(s) && GH_POLL.test(s)) return MESSAGE
  if (pollsFastIn(s)) return WATCH_MESSAGE
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
