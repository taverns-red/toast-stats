// Allow list for Claude Code cloud sessions (#2528, after red-district#1572).
// Loaded by scripts/cloud-session-guard.mjs, so it runs only when
// CLAUDE_CODE_REMOTE=true. Plain Node, no dependencies.
//
// Why: cloud workers act as rservant, and main's ruleset has no
// pull_request rule, so a worker could merge a green PR, disable a
// workflow or push to main. This file refuses everything in these
// families that a worker does not need:
//
//   gh        `gh api` (below), `gh <group> view|list`, and a few reads.
//   gh api,   GET anywhere but graphql; POST pulls, issues/N/comments,
//   curl,     pulls/N/comments; POST pulls/N/reviews only with
//   wget      event=COMMENT; PATCH pulls/N only with title/body/draft;
//             POST issues/N/labels only with preview-smoke.
//   git push  only the session's own branch, never from main or the
//             default branch.
//   reads     (#2547) reader arguments, < redirects and payload files
//             resolve inside the root and are not secret-shaped or
//             gitignored; a cd may not leave the root; no secrets or
//             variables endpoints, no environment dumps.
//
// Anything in those families it cannot parse is refused. It is defence in
// depth: the real control is GitHub-side (a pull_request rule on main, or
// a separate agent identity, ops#242). Commands run from a script file
// (`bash x.sh`, `npm run`, `node x.mjs`) are out of its sight.

import { execFileSync, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { existsSync, realpathSync, statSync } from 'node:fs'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'

// ---------------------------------------------------------------- shell --

/**
 * A word of a shell command. `text` is the word after quote removal;
 * `dynamic` is true when the shell would build any of it at run time
 * ($VAR, $(...), backticks, $'...'), in which case `text` is unreliable.
 */
class Word {
  constructor(text = '', dynamic = false) {
    this.text = text
    this.dynamic = dynamic
    this.quoted = false
  }
}

/** The value glued to a flag (`--x=v`, `-Xv`), as a Word of its own. */
const glued = (from, text) => new Word(text, from.dynamic)

const HEREDOC = /<<-?\s*(['"]?)([A-Za-z_][\w.-]*)\1/g

/** Drop heredoc bodies: they are data fed to a command, not commands. */
function stripHeredocs(src) {
  const out = []
  const pending = []
  for (const line of src.split('\n')) {
    if (pending.length) {
      const { word, dash } = pending[0]
      if ((dash ? line.replace(/^\t+/, '') : line) === word) pending.shift()
      continue
    }
    out.push(line)
    for (const m of line.matchAll(HEREDOC))
      pending.push({ word: m[2], dash: m[0].startsWith('<<-') })
  }
  return out.join('\n')
}

/**
 * Split a command line into simple commands (arrays of Words). Command
 * substitutions found anywhere are returned in `nested`, to be checked as
 * commands of their own. Throws on text it cannot tokenize.
 */
export function tokenize(src) {
  const s = stripHeredocs(String(src).replace(/\\\r?\n/g, ' '))
  const segments = []
  const nested = []
  let words = []
  let inputs = []
  let w = null
  let i = 0
  const word = () => (w ??= new Word())
  const endWord = () => {
    if (w) words.push(w)
    w = null
  }
  const endSegment = () => {
    endWord()
    if (words.length || inputs.length) {
      words.inputs = inputs
      segments.push(words)
    }
    words = []
    inputs = []
  }
  /** Read a balanced $( ... ) or ( ... ) body starting after the opener. */
  const readParens = () => {
    let depth = 1
    const start = i
    while (i < s.length && depth) {
      const c = s[i]
      if (c === '\\') i += 2
      else if (c === '"') {
        i++
        while (i < s.length && s[i] !== '"') i += s[i] === '\\' ? 2 : 1
        if (i >= s.length) throw new Error('unbalanced quote')
        i++
      } else if (c === "'") {
        const j = s.indexOf("'", i + 1)
        if (j < 0) throw new Error('unbalanced quote')
        i = j + 1
      } else {
        if (c === '(') depth++
        else if (c === ')') depth--
        i++
      }
    }
    if (depth) throw new Error('unbalanced parenthesis')
    return s.slice(start, i - 1)
  }
  const readBackticks = () => {
    const j = s.indexOf('`', i)
    if (j < 0) throw new Error('unbalanced backtick')
    const body = s.slice(i, j)
    i = j + 1
    return body
  }
  /** $... outside single quotes. Marks the word dynamic. */
  const readDollar = () => {
    const cur = word()
    cur.dynamic = true
    i++ // past $
    if (s[i] === '(') {
      i++
      nested.push(readParens())
    } else if (s[i] === '{') {
      const j = s.indexOf('}', i)
      if (j < 0) throw new Error('unbalanced brace')
      i = j + 1
    } else if (s[i] === "'") {
      // $'...' ANSI-C quoting: backslash escapes; treat as unknown text
      i++
      while (i < s.length && s[i] !== "'") i += s[i] === '\\' ? 2 : 1
      if (i >= s.length) throw new Error('unbalanced quote')
      i++
    } else if (/[@*#?$!0-9-]/.test(s[i] ?? '')) {
      i++
    } else {
      while (i < s.length && /\w/.test(s[i])) i++
    }
    cur.text += '\u0000'
  }

  while (i < s.length) {
    const c = s[i]
    if (c === "'") {
      const j = s.indexOf("'", i + 1)
      if (j < 0) throw new Error('unbalanced quote')
      word().text += s.slice(i + 1, j)
      word().quoted = true
      i = j + 1
    } else if (c === '"') {
      word().quoted = true
      i++
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && /["\\$`\n]/.test(s[i + 1] ?? '')) {
          word().text += s[i + 1]
          i += 2
        } else if (s[i] === '$' && /[\w({@*#?!$-]/.test(s[i + 1] ?? '')) {
          readDollar()
        } else if (s[i] === '`') {
          i++
          word().dynamic = true
          word().text += '\u0000'
          nested.push(readBackticks())
        } else word().text += s[i++]
      }
      if (i >= s.length) throw new Error('unbalanced quote')
      i++
    } else if (c === '\\') {
      if (i + 1 < s.length) word().text += s[i + 1]
      i += 2
    } else if (c === '$' && /[\w({@*#?!$'-]/.test(s[i + 1] ?? '')) {
      readDollar()
    } else if (c === '`') {
      i++
      word().dynamic = true
      word().text += '\u0000'
      nested.push(readBackticks())
    } else if (c === '#' && !w) {
      while (i < s.length && s[i] !== '\n') i++
    } else if (/[<>]/.test(c)) {
      // A redirection: an fd number before it is not a word, and its
      // target is not an argument. <(...) and >(...) run a command.
      if (w && /^\d+$/.test(w.text) && !w.quoted && !w.dynamic) w = null
      endWord()
      if (s[i + 1] === '(') {
        i += 2
        nested.push(readParens())
        continue
      }
      const opStart = i
      while (/[<>&|-]/.test(s[i] ?? '')) i++
      const op = s.slice(opStart, i)
      while (s[i] === ' ' || s[i] === '\t') i++
      // The target is not an argument. A `<` target is a file the
      // command reads (#2547), so keep it.
      const target = new Word()
      while (i < s.length && !/[\s;&|()<>]/.test(s[i])) {
        if (s[i] === "'" || s[i] === '"') {
          const q = s[i]
          const j = s.indexOf(q, i + 1)
          if (j < 0) throw new Error('unbalanced quote')
          const inner = s.slice(i + 1, j)
          if (q === '"' && /[$`]/.test(inner)) target.dynamic = true
          target.text += inner
          target.quoted = true
          i = j + 1
        } else if (s[i] === '$' && s[i + 1] === '(') {
          i += 2
          nested.push(readParens())
          target.dynamic = true
          target.text += '\u0000'
        } else {
          if (s[i] === '$' || s[i] === '`') target.dynamic = true
          target.text += s[i++]
        }
      }
      if (op === '<' || op === '<>') inputs.push(target)
    } else if (/[;&|\n()]/.test(c)) {
      endSegment()
      i++
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord()
      i++
    } else {
      word().text += c
      i++
    }
  }
  endSegment()
  return { segments, nested }
}

// ------------------------------------------------------------ commands --

const GUARDED = new Set(['gh', 'git', 'curl', 'wget'])
const KEYWORDS = new Set([
  '!',
  '{',
  '}',
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'do',
  'done',
  'while',
  'until',
  'time',
])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const INTERPRETERS = new Set([
  'python',
  'python3',
  'node',
  'perl',
  'ruby',
  'deno',
  'bun',
  'php',
])
/** Wrappers that run their arguments as a command, with value-taking flags. */
const WRAPPERS = {
  env: new Set(['-u', '--unset', '-C', '--chdir', '-S', '--split-string']),
  command: new Set(),
  builtin: new Set(),
  exec: new Set(['-a']),
  nohup: new Set(),
  nice: new Set(['-n', '--adjustment']),
  sudo: new Set(['-u', '-g', '-C', '-h', '-p', '-U']),
  stdbuf: new Set(['-i', '-o', '-e']),
  timeout: new Set(['-s', '--signal', '-k', '--kill-after']),
}
const FANOUT = new Set(['xargs', 'parallel', 'find', 'watch'])
const OTHER_HTTP = new Set(['http', 'https', 'httpie', 'xh', 'xhs'])

const base = t => t.slice(t.lastIndexOf('/') + 1)
const mentionsGuarded = t =>
  /(^|[^\w-])(gh|git|curl|wget)([^\w-]|$)|github\.com/i.test(t)

class Refusal extends Error {}
const no = reason => {
  throw new Refusal(reason)
}

/**
 * The program a simple command runs and its arguments, past assignments,
 * keywords and wrappers. Returns null for an empty command.
 */
function resolveCommand(words) {
  let k = 0
  let gitEnv = false
  let lastWrapper = null
  for (;;) {
    while (k < words.length && !words[k].quoted && KEYWORDS.has(words[k].text))
      k++
    while (
      k < words.length &&
      !words[k].quoted &&
      /^[A-Za-z_]\w*=/.test(words[k].text)
    ) {
      if (/^GIT_/i.test(words[k].text)) gitEnv = true
      k++
    }
    if (k >= words.length)
      return lastWrapper === 'env'
        ? { name: 'env', args: [], gitEnv, bare: true }
        : null
    const head = words[k]
    if (head.dynamic) {
      const name = base(head.text)
      if (!name || name.includes('\u0000'))
        no('a command name built at run time cannot be checked')
    }
    const name = base(head.text).toLowerCase()
    const flags = WRAPPERS[name]
    if (!flags || head.quoted) return { name, args: words.slice(k + 1), gitEnv }
    lastWrapper = name
    k++
    while (k < words.length && words[k].text.startsWith('-')) {
      if (/^(-S|--split-string)/.test(words[k].text))
        no('env -S runs a command the guard cannot read')
      if (flags.has(words[k].text)) k++
      k++
    }
    if (name === 'timeout' && k < words.length) k++ // the duration
    if (name === 'env') continue // assignments again
  }
}

/** Check one command line; recurse into nested and wrapped commands. */
function checkLine(src, ctx, depth = 0) {
  if (depth > 6) no('commands nested too deeply to check')
  let parsed
  try {
    parsed = tokenize(src)
  } catch (e) {
    if (mentionsGuarded(src))
      no(`the command could not be parsed (${e.message})`)
    return
  }
  for (const inner of parsed.nested) {
    const cwd = ctx.cwd
    checkLine(inner, ctx, depth + 1)
    ctx.cwd = cwd
  }
  for (const seg of parsed.segments) checkSegment(seg, ctx, depth)
}

function checkSegment(words, ctx, depth) {
  for (const w of words.inputs ?? []) checkReadPath(w, ctx, 'a < redirect')
  const cmd = resolveCommand(words)
  if (!cmd) return
  const { name, args, gitEnv } = cmd
  const texts = args.map(a => a.text)

  checkEnvDump(name, cmd, args)
  if (name === 'cd' || name === 'pushd') {
    const target = args.find(a => !a.text.startsWith('-') || a.text === '-')
    if (!target)
      no(`${name} with no directory goes to HOME, outside the repository`)
    if (target.dynamic || target.text === '-' || target.text.startsWith('~'))
      no(
        `${name} ${target.text.replace(/\u0000/g, '$…')} cannot be resolved inside the repository`
      )
    if (ctx.cwd === null) no(`${name} from a directory the guard cannot tell`)
    const dir = realish(resolve(ctx.cwd, target.text))
    if (!within(ctx.root, dir))
      no(`${name} ${target.text} leaves the repository`)
    ctx.cwd = dir
    return
  }
  if (name === 'popd') {
    ctx.cwd = null
    return
  }
  if (READERS.has(name)) checkReader(name, args, ctx)
  if (SHELLS.has(name)) {
    const c = args.findIndex(a => /^-[a-z]*c$/.test(a.text))
    if (c >= 0 && args[c + 1]) {
      if (args[c + 1].dynamic && mentionsGuarded(args[c + 1].text))
        no('a shell command built at run time cannot be checked')
      checkLine(args[c + 1].text, ctx, depth + 1)
    } else if (readsStdin(args) && mentionsGuarded(ctx.raw))
      no(`${name} reading commands from stdin cannot be checked`)
    return
  }
  if (name === 'eval') {
    if (args.some(a => a.dynamic)) no('eval of text built at run time')
    checkLine(texts.join(' '), ctx, depth + 1)
    return
  }
  if (name === 'alias') {
    if (texts.some(mentionsGuarded))
      no('an alias for gh, git, curl or wget hides what runs')
    return
  }
  if (FANOUT.has(name)) {
    if (args.some(a => GUARDED.has(base(a.text))))
      no(`${name} builds the arguments of gh, git, curl or wget at run time`)
    if (args.some(a => READERS.has(base(a.text))))
      no(`${name} hands a reader paths the guard cannot see`)
    return
  }
  if (INTERPRETERS.has(name)) {
    const e = args.findIndex(a =>
      /^(-[a-zA-Z]*[ce]|--eval|-p|--print)$/.test(a.text)
    )
    if (e >= 0 && args[e + 1] && mentionsGuarded(args[e + 1].text))
      no(`inline ${name} code that runs gh, git, curl or calls GitHub`)
    if (e < 0 && readsStdin(args) && mentionsGuarded(ctx.raw))
      no(`${name} reading code from stdin cannot be checked`)
    return
  }
  if (OTHER_HTTP.has(name) && texts.some(t => /github\.com/i.test(t)))
    no(`${name} to GitHub is not on the cloud allow list; use gh api`)
  if (name === 'gh') return checkGh(args, ctx)
  if (name === 'curl') return checkCurl(args, ctx)
  if (name === 'wget') return checkWget(args, ctx)
  if (name === 'git') return checkGit(args, ctx, gitEnv)
}

/** No script operand, or an explicit `-`/`-s`: the program reads stdin. */
function readsStdin(args) {
  return (
    !args.some(a => !a.text.startsWith('-')) ||
    args.some(a => a.text === '-' || a.text === '-s')
  )
}

// ------------------------------------------------------------------ gh --

/** gh's repo and host flags, valid anywhere (#2526). Returns words used. */
function ghRepoFlag(words, k) {
  const t = words[k].text
  if (/^(-R|--repo|--hostname)$/.test(t)) return 2
  if (/^(-R.+|--repo=.*|--hostname=.*)$/.test(t)) return 1
  return 0
}

/** Reads beyond view/list that a worker uses, by group. */
const GH_READS = {
  pr: new Set(['diff', 'checks', 'status']),
  issue: new Set(['status']),
  run: new Set(['watch', 'download']),
  auth: new Set(['status']),
}

function checkGh(args, ctx) {
  const words = args
  let k = 0
  /** Next word that is not a repo/host flag; refuses other flags. */
  const next = () => {
    while (k < words.length) {
      const w = words[k]
      if (w.dynamic) no('a gh command built at run time cannot be checked')
      const n = ghRepoFlag(words, k)
      if (n) {
        k += n
        continue
      }
      if (/^(-h|--help|--version)$/.test(w.text)) return { help: true }
      if (w.text.startsWith('-'))
        no(`gh flag ${w.text} before the command cannot be placed`)
      return { word: w.text.toLowerCase(), at: k++ }
    }
    return {}
  }
  const g = next()
  if (g.help) return
  if (!g.word) no('bare gh is not on the cloud allow list')
  const group = g.word
  if (group === 'help' || group === 'version') return
  if (group === 'api') return checkGhApi(words.slice(k), ctx)
  if (group === 'search') return
  if (group === 'secret' || group === 'variable')
    no(`gh ${group} is not on the cloud allow list`)
  const v = next()
  if (v.help) return
  if (!v.word) no(`gh ${group} with no subcommand is not on the allow list`)
  const verb = v.word
  if (verb === 'view' || verb === 'list') return
  if (GH_READS[group]?.has(verb)) return
  no(`gh ${group} ${verb} is not on the cloud allow list`)
}

// --------------------------------------------------- method + path rules --

const VALUE_OPAQUE = Symbol('opaque')

/**
 * A request body as field -> values. `opaque` means it comes from a file,
 * stdin or the shell, so its fields cannot be read.
 */
function body() {
  return { opaque: false, fields: new Map() }
}
function addField(b, key, value) {
  const k = String(key).replace(/\[.*$/, '').toLowerCase()
  if (!b.fields.has(k)) b.fields.set(k, [])
  b.fields.get(k).push(value)
}
function jsonBody(text) {
  const b = body()
  let obj
  try {
    obj = JSON.parse(text)
  } catch {
    b.opaque = true
    return b
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    b.opaque = true
    return b
  }
  for (const [k, v] of Object.entries(obj))
    for (const x of Array.isArray(v) ? v : [v])
      addField(b, k, typeof x === 'string' ? x : JSON.stringify(x))
  return b
}

const REPO = 'repos/[^/]+/[^/]+'
const ROUTES = [
  ['POST', new RegExp(`^${REPO}/pulls$`), () => null],
  ['POST', new RegExp(`^${REPO}/issues/\\d+/comments$`), () => null],
  ['POST', new RegExp(`^${REPO}/pulls/\\d+/comments$`), () => null],
  [
    'POST',
    new RegExp(`^${REPO}/pulls/\\d+/reviews$`),
    b => {
      const ev = b.fields.get('event')
      if (b.opaque || !ev || ev.length !== 1 || ev[0] === VALUE_OPAQUE)
        return 'a review whose event is not visibly COMMENT'
      return ev[0] === 'COMMENT' ? null : `a review with event ${ev[0]}`
    },
  ],
  [
    'PATCH',
    new RegExp(`^${REPO}/pulls/\\d+$`),
    b => {
      if (b.opaque) return 'a PR update whose fields come from a file or stdin'
      const keys = [...b.fields.keys()]
      const bad = keys.filter(x => !['title', 'body', 'draft'].includes(x))
      if (!keys.length) return 'a PR update with no visible fields'
      return bad.length ? `a PR update that sets ${bad.join(', ')}` : null
    },
  ],
  [
    'POST',
    new RegExp(`^${REPO}/issues/\\d+/labels$`),
    b => {
      const keys = [...b.fields.keys()]
      const vals = b.fields.get('labels') ?? []
      if (
        b.opaque ||
        keys.length !== 1 ||
        keys[0] !== 'labels' ||
        !vals.length ||
        vals.some(v => v !== 'preview-smoke')
      )
        return 'a label write other than preview-smoke'
      return null
    },
  ],
]

/** Decode %xx until stable, strip host and query, and sanity-check. */
function normalizePath(raw) {
  let p = raw
  for (let n = 0; n < 4; n++) {
    let d
    try {
      d = decodeURIComponent(p)
    } catch {
      no(`the path ${raw} could not be decoded`)
    }
    if (d === p) break
    p = d
  }
  if (p.includes('..')) no(`the path ${raw} climbs with ..`)
  let host = 'api.github.com'
  const m = /^https?:\/\/([^/]+)(\/.*)?$/i.exec(p)
  if (m) {
    host = m[1].toLowerCase()
    p = m[2] ?? '/'
  }
  p = p.replace(/[?#].*$/s, '').replace(/^\/+/, '')
  if (/(^|\/)\.(\/|$)|\/\/|\\|\s|[*%\u0000]/.test(p))
    no(`the path ${raw} is not a plain API path`)
  return { host, path: p.toLowerCase() }
}

/** The verdict for one GitHub API request. Refuses, or returns. */
function checkRoute(method, rawPath, b, how) {
  const m = method.toUpperCase()
  const { host, path } = normalizePath(rawPath)
  if (path === 'graphql' || path.endsWith('/graphql'))
    no(`${how} to graphql is not on the cloud allow list`)
  if (/(^|\/)([\w-]*-)?(secrets|variables)(\/|$)/.test(path))
    no(`${how} ${path} reads secrets or variables`)
  if (m === 'GET' || m === 'HEAD') return
  if (host !== 'api.github.com')
    no(`${how} ${m} to ${host} is not on the cloud allow list`)
  for (const [rm, re, fieldCheck] of ROUTES) {
    if (rm !== m || !re.test(path)) continue
    const why = fieldCheck(b)
    if (why) no(`${how} ${m} ${path}: ${why}`)
    return
  }
  no(`${how} ${m} ${path} is not on the cloud allow list`)
}

const METHOD_OVERRIDE = /x-http-method-override|x-method-override/i

// -------------------------------------------------------------- gh api --

const API_VALUE = new Set([
  '-X',
  '--method',
  '-f',
  '--raw-field',
  '-F',
  '--field',
  '--input',
  '-H',
  '--header',
  '-p',
  '--preview',
  '-q',
  '--jq',
  '-t',
  '--template',
  '--cache',
  '--hostname',
  '-R',
  '--repo',
])
const API_BOOL = new Set([
  '--paginate',
  '--slurp',
  '--silent',
  '-i',
  '--include',
  '--verbose',
  '-h',
  '--help',
])
const API_SHORT_VALUE = new Set(['X', 'f', 'F', 'H', 'p', 'q', 't', 'R'])
const API_SHORT_BOOL = new Set(['i', 'h'])

function checkGhApi(words, ctx) {
  let method = null
  const b = body()
  let hasFields = false
  let hasInput = false
  const positional = []
  const take = (flag, value) => {
    if (value === undefined) no(`gh api ${flag} needs a value`)
    const v = value
    if (flag === '-X' || flag === '--method') {
      if (v.dynamic) no('gh api with a method built at run time')
      method = v.text
    } else if (/^(-f|--raw-field|-F|--field)$/.test(flag)) {
      hasFields = true
      const eq = v.text.indexOf('=')
      if (eq < 0) addField(b, v.text, VALUE_OPAQUE)
      else {
        const key = v.text.slice(0, eq)
        const val = v.text.slice(eq + 1)
        const fromFile = /^(-F|--field)$/.test(flag) && val.startsWith('@')
        if (fromFile && val !== '@-')
          checkReadPath(glued(v, val.slice(1)), ctx, 'gh api -F')
        addField(b, key, v.dynamic || fromFile ? VALUE_OPAQUE : val)
      }
    } else if (flag === '--input') {
      hasInput = true
      b.opaque = true
      if (v.text !== '-') checkReadPath(v, ctx, 'gh api --input')
    } else if (flag === '-H' || flag === '--header') {
      if (v.dynamic || METHOD_OVERRIDE.test(v.text))
        no('gh api with a method-override or run-time header')
    }
  }
  for (let k = 0; k < words.length; k++) {
    const w = words[k]
    const t = w.text
    if (t === '--') {
      positional.push(...words.slice(k + 1))
      break
    }
    if (!t.startsWith('-') || t === '-') {
      positional.push(w)
      continue
    }
    if (t.startsWith('--')) {
      const eq = t.indexOf('=')
      const flag = eq < 0 ? t : t.slice(0, eq)
      if (API_BOOL.has(flag)) continue
      if (!API_VALUE.has(flag)) no(`gh api flag ${flag} is not understood`)
      if (eq >= 0) {
        take(flag, glued(w, t.slice(eq + 1)))
      } else take(flag, words[++k])
      continue
    }
    // short flags, possibly combined: -iX POST, -XPUT, -fkey=v
    for (let j = 1; j < t.length; j++) {
      const ch = t[j]
      if (API_SHORT_BOOL.has(ch)) continue
      if (!API_SHORT_VALUE.has(ch)) no(`gh api flag -${ch} is not understood`)
      const rest = t.slice(j + 1)
      if (rest) {
        take(`-${ch}`, glued(w, rest))
      } else take(`-${ch}`, words[++k])
      break
    }
  }
  if (positional.length !== 1)
    no('gh api needs exactly one endpoint the guard can read')
  const ep = positional[0]
  if (ep.dynamic) no('gh api with an endpoint built at run time')
  const m = method ?? (hasFields || hasInput ? 'POST' : 'GET')
  if (hasInput && /^(GET|HEAD)$/i.test(m)) b.opaque = true
  checkRoute(m, ep.text, b, 'gh api')
}

// ---------------------------------------------------------- curl, wget --

const CURL_VALUE_SHORT = new Set([...'XdFTHuoAebcwKxmrEDYyzCUQ'.split('')])
const CURL_DATA = new Set([
  '-d',
  '--data',
  '--data-raw',
  '--data-binary',
  '--data-ascii',
  '--data-urlencode',
  '--json',
])
const CURL_FORM = new Set(['-F', '--form', '--form-string'])
const CURL_VALUE_LONG = new Set([
  '--request',
  ...CURL_DATA,
  ...CURL_FORM,
  '--upload-file',
  '--header',
  '--user',
  '--output',
  '--user-agent',
  '--referer',
  '--cookie',
  '--cookie-jar',
  '--write-out',
  '--url',
  '--config',
  '--proxy',
  '--connect-timeout',
  '--max-time',
  '--retry',
  '--range',
  '--cert',
  '--cacert',
  '--resolve',
  '--connect-to',
  '--dump-header',
  '--oauth2-bearer',
  '--limit-rate',
  '--proxy-user',
  '--variable',
  '--quote',
])
const LONG_OF = {
  X: '--request',
  d: '--data',
  F: '--form',
  T: '--upload-file',
  H: '--header',
  K: '--config',
  Q: '--quote',
}

const rcExists = names => names.some(n => n && existsSync(n))

/** curl/wget to a GitHub host: apply the route rules. */
function checkHttp(tool, method, urls, b, rcFiles) {
  const m = method.toUpperCase()
  for (const u of urls) {
    if (u.dynamic) {
      if (m === 'GET' || m === 'HEAD') continue
      no(`${tool} ${m} to a URL built at run time`)
    }
    const host = (
      /^(?:https?:\/\/)?([^/:?#]+)/i.exec(u.text)?.[1] ?? ''
    ).toLowerCase()
    const github = /(^|\.)github\.com$|(^|\.)githubusercontent\.com$/.test(host)
    if (!github) continue
    if (rcExists(rcFiles))
      no(`${tool} to GitHub with a ${tool}rc that could change the request`)
    if (tool === 'curl' && /[{}[\]]/.test(u.text) && !/^(GET|HEAD)$/.test(m))
      no('curl URL globbing turns one URL into several')
    if (host !== 'api.github.com') {
      if (m === 'GET' || m === 'HEAD') continue
      no(`${tool} ${m} to ${host} is not on the cloud allow list`)
    }
    checkRoute(m, u.text, b, tool)
  }
}

function checkCurl(args, ctx) {
  let method = null
  let get = false
  let head = false
  let upload = false
  const data = []
  let form = false
  const urls = []
  const take = (flag, v) => {
    if (!v) no(`curl ${flag} needs a value`)
    if (flag === '--request') {
      if (v.dynamic) no('curl with a method built at run time')
      method = v.text
    } else if (CURL_DATA.has(flag)) {
      data.push({ flag, v })
      const at = v.text.indexOf('@')
      if (
        flag !== '--data-raw' &&
        at >= 0 &&
        (at === 0 || flag === '--data-urlencode') &&
        v.text.slice(at + 1) !== '-'
      )
        checkReadPath(glued(v, v.text.slice(at + 1)), ctx, `curl ${flag}`)
    } else if (CURL_FORM.has(flag)) {
      form = true
      const m = /^[^=]*=[@<](.*?)(;.*)?$/s.exec(v.text)
      if (flag !== '--form-string' && m && m[1] !== '-')
        checkReadPath(glued(v, m[1]), ctx, `curl ${flag}`)
    } else if (flag === '--upload-file') {
      upload = true
      if (v.text !== '-') checkReadPath(v, ctx, 'curl --upload-file')
    } else if (flag === '--url') urls.push(v)
    else if (flag === '--header') {
      if (
        METHOD_OVERRIDE.test(v.text) ||
        (v.dynamic && /override/i.test(v.text))
      )
        no('curl with a method-override header')
    } else if (/^--(config|variable|quote)$/.test(flag))
      no(`curl ${flag} can change the request out of sight`)
  }
  for (let k = 0; k < args.length; k++) {
    const w = args[k]
    const t = w.text
    if (t === '--') {
      urls.push(...args.slice(k + 1))
      break
    }
    if (!t.startsWith('-') || t === '-') {
      urls.push(w)
      continue
    }
    if (t.startsWith('--')) {
      const eq = t.indexOf('=')
      const flag = eq < 0 ? t : t.slice(0, eq)
      if (flag === '--next' || flag === '--request-target')
        no(`curl ${flag} sends a request the guard cannot match to its URL`)
      if (flag === '--get') get = true
      else if (flag === '--head') head = true
      else if (/^--expand-/.test(flag))
        no(`curl ${flag} expands variables out of sight`)
      if (!CURL_VALUE_LONG.has(flag) && !/^--expand-/.test(flag)) continue
      if (eq >= 0) {
        take(flag, glued(w, t.slice(eq + 1)))
      } else take(flag, args[++k])
      continue
    }
    for (let j = 1; j < t.length; j++) {
      const ch = t[j]
      if (ch === ':') no('curl -: starts a request with its own method')
      if (ch === 'G') get = true
      if (ch === 'I') head = true
      if (!CURL_VALUE_SHORT.has(ch)) continue
      const rest = t.slice(j + 1)
      take(LONG_OF[ch] ?? `-${ch}`, rest ? glued(w, rest) : args[++k])
      break
    }
  }
  let m = method
  if (!m) {
    if (head) m = 'HEAD'
    else if (upload) m = 'PUT'
    else if ((data.length || form) && !get) m = 'POST'
    else m = 'GET'
  }
  let b = body()
  if (form || upload || data.length > 1) b.opaque = true
  else if (data.length === 1) {
    const { flag, v } = data[0]
    if (
      v.dynamic ||
      flag === '--data-urlencode' ||
      (flag !== '--data-raw' && v.text.startsWith('@'))
    )
      b.opaque = true
    else b = jsonBody(v.text)
  }
  const home = ctx.home
  checkHttp('curl', m, urls, b, [
    home && join(home, '.curlrc'),
    process.env.CURL_HOME && join(process.env.CURL_HOME, '.curlrc'),
    process.env.XDG_CONFIG_HOME && join(process.env.XDG_CONFIG_HOME, '.curlrc'),
  ])
}

const WGET_VALUE_SHORT = new Set([...'OoaieTtwPUQlADIRX'.split('')])
/** Options that change the method, body or target. */
const WGET_RISKY = [
  'method',
  'post-data',
  'post-file',
  'body-data',
  'body-file',
  'header',
  'execute',
  'input-file',
]
const WGET_VALUE_LONG = new Set([
  ...WGET_RISKY,
  'output-document',
  'output-file',
  'user-agent',
  'tries',
  'timeout',
  'wait',
])

function checkWget(args, ctx) {
  let method = null
  const urls = []
  let b = body()
  let posted = false
  for (let k = 0; k < args.length; k++) {
    const w = args[k]
    const t = w.text
    if (!t.startsWith('-') || t === '-') {
      urls.push(w)
      continue
    }
    if (t.startsWith('--')) {
      const eq = t.indexOf('=')
      const flag = eq < 0 ? t : t.slice(0, eq)
      const valued = WGET_VALUE_LONG.has(flag.slice(2))
      if (!valued && WGET_RISKY.some(n => n.startsWith(flag.slice(2))))
        no(`wget ${flag} abbreviates an option that changes the request`)
      if (!valued) continue
      const v = eq >= 0 ? glued(w, t.slice(eq + 1)) : args[++k]
      if (!v) no(`wget ${flag} needs a value`)
      if (flag === '--method') {
        if (v.dynamic) no('wget with a method built at run time')
        method = v.text
      } else if (flag === '--post-data' || flag === '--body-data') {
        posted = true
        b = v.dynamic ? { opaque: true, fields: new Map() } : jsonBody(v.text)
      } else if (flag === '--post-file' || flag === '--body-file') {
        posted = true
        b.opaque = true
        checkReadPath(v, ctx, `wget ${flag}`)
      } else if (flag === '--execute' || flag === '--input-file')
        no(`wget ${flag} can change the request out of sight`)
      else if (flag === '--header' && METHOD_OVERRIDE.test(v.text))
        no('wget with a method-override header')
      continue
    }
    for (let j = 1; j < t.length; j++) {
      const ch = t[j]
      if (!WGET_VALUE_SHORT.has(ch)) continue
      if (ch === 'e' || ch === 'i')
        no(`wget -${ch} can change the request out of sight`)
      if (!t.slice(j + 1)) k++
      break
    }
  }
  const m = method ?? (posted ? 'POST' : 'GET')
  checkHttp('wget', m, urls, b, [
    ctx.home && join(ctx.home, '.wgetrc'),
    process.env.WGETRC,
  ])
}

// ------------------------------------------------------------- git push --

const GIT_BUILTINS = new Set(
  (
    'add am apply bisect blame branch bundle cat-file check-ignore checkout ' +
    'cherry cherry-pick clean clone commit config describe diff fetch ' +
    'for-each-ref format-patch fsck gc grep help init log ls-files ' +
    'ls-remote ls-tree merge merge-base mv notes pull push range-diff ' +
    'rebase reflog remote reset restore rev-list rev-parse revert rm ' +
    'shortlog show show-ref sparse-checkout stash status submodule switch ' +
    'symbolic-ref tag update-index version worktree'
  ).split(' ')
)
const RISKY_CONFIG =
  /^(alias\..+|remote\..+\.(push|mirror|pushurl)|push\..+|branch\..+\.(pushremote|merge|remote)|remote\.pushdefault|url\..+)$/i

function gitIn(dir, ...a) {
  try {
    return execFileSync('git', ['-C', dir, ...a], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim()
  } catch {
    return null
  }
}

function checkGit(args, ctx, gitEnv) {
  let k = 0
  let dir = ctx.cwd
  let flagged = gitEnv
  for (; k < args.length; k++) {
    const t = args[k].text
    if (!t.startsWith('-')) break
    if (t === '-C') {
      const v = args[++k]
      if (!v || v.dynamic || dir === null) dir = null
      else dir = isAbsolute(v.text) ? v.text : resolve(dir, v.text)
    } else if (t === '-c' || t.startsWith('--config-env')) {
      flagged = true
      if (t === '-c') k++
    } else if (/^--(git-dir|work-tree|namespace|exec-path)/.test(t)) {
      flagged = true
      if (!t.includes('=')) k++
    }
  }
  const subW = args[k]
  if (!subW) return
  if (subW.dynamic) no('a git subcommand built at run time')
  const sub = subW.text
  const rest = args.slice(k + 1)

  if (sub === 'config') {
    const reading = rest.some(a =>
      /^(--get|--get-all|--get-regexp|--list|-l|get|list)$/.test(a.text)
    )
    if (!reading && rest.some(a => RISKY_CONFIG.test(a.text)))
      ctx.pushConfigWrite = true
    return
  }
  if (sub === 'credential' || sub.startsWith('credential-'))
    no(`git ${sub} prints stored credentials`)
  if (sub === 'send-pack' || sub === 'http-push')
    no(`git ${sub} pushes refs past the push rules`)
  if (sub === 'subtree' && rest.some(a => a.text === 'push'))
    no('git subtree push is not on the cloud allow list')
  if (!GIT_BUILTINS.has(sub)) {
    if (ctx.pushConfigWrite)
      no(`git ${sub} after a git config change in the same command`)
    if (dir === null) no(`git ${sub} in a directory the guard cannot tell`)
    if (gitIn(dir, 'config', '--get', `alias.${sub}`) !== null)
      no(`git ${sub} is an alias, which hides what it runs`)
    return
  }
  if (sub === 'push') checkPush(rest, dir, ctx, flagged)
}

const PUSH_OK_LONG =
  /^--(set-upstream|quiet|verbose|progress|no-progress|porcelain|dry-run|force-with-lease(=.*)?|force-if-includes|no-force-if-includes|atomic|no-atomic|ipv4|ipv6)$/
const PUSH_OK_SHORT = new Set(['u', 'q', 'v', 'n', '4', '6'])

function checkPush(args, dir, ctx, flagged) {
  if (ctx.pushConfigWrite || ctx.gitConfigTouched)
    no('a push in the same command as a git config change')
  if (flagged) no('a push with git -c, --git-dir or GIT_* settings')
  if (dir === null) no('a push from a directory the guard cannot tell')

  const positional = []
  let ended = false
  for (const w of args) {
    const t = w.text
    if (w.dynamic) no('a push whose arguments are built at run time')
    if (!ended && t === '--') {
      ended = true
      continue
    }
    if (ended || !t.startsWith('-')) {
      positional.push(t)
      continue
    }
    if (t.startsWith('--')) {
      if (!PUSH_OK_LONG.test(t)) no(`git push ${t} is not on the allow list`)
      continue
    }
    for (const ch of t.slice(1))
      if (!PUSH_OK_SHORT.has(ch)) no(`git push -${ch} is not on the allow list`)
  }

  const cur = gitIn(dir, 'rev-parse', '--abbrev-ref', 'HEAD')
  if (!cur) no('a push outside a git repository the guard can read')
  if (cur === 'HEAD') no('a push from a detached HEAD')
  const [remoteArg, ...refspecs] = positional
  const remote =
    remoteArg ??
    gitIn(dir, 'config', '--get', `branch.${cur}.pushremote`) ??
    gitIn(dir, 'config', '--get', 'remote.pushdefault') ??
    gitIn(dir, 'config', '--get', `branch.${cur}.remote`) ??
    'origin'
  if (!/^[\w.-]+$/.test(remote))
    no(`a push to ${remote}, which is not a configured remote name`)
  const defaultRef = gitIn(
    dir,
    'symbolic-ref',
    '--short',
    `refs/remotes/${remote}/HEAD`
  )
  const defaultBranch = defaultRef?.slice(remote.length + 1)
  if (['main', 'master', defaultBranch].includes(cur))
    no(`a push from ${cur}, the default branch`)
  if (gitIn(dir, 'config', '--get-all', `remote.${remote}.push`) !== null)
    no(`remote.${remote}.push is configured, so the destination is not plain`)
  if (gitIn(dir, 'config', '--get', `remote.${remote}.mirror`) !== null)
    no(`remote.${remote}.mirror is configured`)

  const ownRefs = [cur, `refs/heads/${cur}`]
  if (!refspecs.length) {
    const mode = gitIn(dir, 'config', '--get', 'push.default') ?? 'simple'
    if (mode === 'matching') no('push.default=matching pushes every branch')
    if (mode === 'upstream' || mode === 'tracking') {
      const merge = gitIn(dir, 'config', '--get', `branch.${cur}.merge`)
      if (merge && merge !== `refs/heads/${cur}`)
        no(`push.default=${mode} sends ${cur} to ${merge}`)
    }
    return
  }
  for (const spec of refspecs) {
    if (spec.startsWith('+')) no(`the forced refspec ${spec}`)
    if (spec.includes('*')) no(`the wildcard refspec ${spec}`)
    const colon = spec.indexOf(':')
    if (colon < 0) {
      if (spec === 'HEAD' || spec === '@' || ownRefs.includes(spec)) continue
      no(`a push of ${spec}, not this session's branch ${cur}`)
    }
    const src = spec.slice(0, colon)
    const dst = spec.slice(colon + 1)
    if (!src) no(`the refspec ${spec} deletes ${dst}`)
    if (!ownRefs.includes(dst))
      no(`a push to ${dst}, not this session's branch ${cur}`)
  }
}

// --------------------------------------------------------------- reads --
//
// #2547: a worker could read a file outside the repository, or a secret
// inside it, and post it through an allowed route (`-F body=@/etc/passwd`,
// `env > body.md` then `-F body=@body.md`). Reads by the common readers,
// `<` redirects and request payload files must resolve (realpath of the
// nearest existing parent, against the command's own cwd) inside the
// root, and must not be secret-shaped or gitignored.

const READERS = new Set(
  (
    'cat head tail less more grep egrep fgrep rg sed awk gawk xxd od ' +
    'strings base64 cp tac nl hexdump'
  ).split(' ')
)
/** Their first operand is a pattern or script unless -e/-f gives one. */
const PATTERN_FIRST = new Set([
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'sed',
  'awk',
  'gawk',
])
/** Gitignored, but build and dependency output a worker reads. */
const IGNORED_OK = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.vite',
  'playwright-report',
  'test-results',
])
const SECRET_NAME = /^\.env(\..*)?$|\.(pem|key)$/i

/** realpath of the nearest existing parent, with the rest appended. */
function realish(p) {
  const rest = []
  let cur = p
  for (;;) {
    try {
      return join(realpathSync(cur), ...rest)
    } catch {
      const parent = dirname(cur)
      if (parent === cur) return p
      rest.unshift(basename(cur))
      cur = parent
    }
  }
}

const within = (root, p) => p === root || p.startsWith(root + sep)

/** GIT_* from the session would point git elsewhere (#2534). */
function cleanGitEnv() {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (/^GIT_/i.test(k)) delete env[k]
  return env
}

function gitAt(root, args) {
  return spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: cleanGitEnv(),
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 3000,
  })
}

const secretShaped = rel =>
  rel.split(sep).some(p => p === '.git' || SECRET_NAME.test(p))
const ignoredOk = rel => rel.split(sep).some(p => IGNORED_OK.has(p))
const shown = t => t.replace(/\u0000/g, '$…')

/**
 * One path a command reads. Refuses, or returns the real paths it names
 * (several for a glob).
 */
function checkReadPath(word, ctx, how) {
  const t = word.text
  if (t === '/dev/null') return []
  if (word.dynamic || t.includes('\u0000'))
    no(`${how} reads ${shown(t)}, a path built at run time`)
  if (t.startsWith('~')) no(`${how} reads ${t}, outside the repository`)
  if (/\{[^}]*(,|\.\.)[^}]*\}/.test(t))
    no(`${how} reads ${t}, a brace expansion`)
  if (ctx.cwd === null && !isAbsolute(t))
    no(`${how} reads ${t} from a directory the guard cannot tell`)
  if (/[*?[]/.test(t)) {
    if (/(^|\/)[.[][^/]*[*?[]/.test(t))
      no(`${how} reads ${t}, a glob that can match ..`)
    if (typeof fs.globSync !== 'function')
      no(`${how} reads ${t}, a glob the guard cannot expand`)
    const matches = fs.globSync(t, { cwd: ctx.cwd })
    if (matches.length) return matches.map(m => checkOnePath(m, t, ctx, how))
  }
  return [checkOnePath(t, t, ctx, how)]
}

function checkOnePath(p, shownAs, ctx, how) {
  const abs = resolve(ctx.cwd ?? ctx.root, p)
  const real = realish(abs)
  if (!within(ctx.root, real))
    no(`${how} reads ${shownAs}, outside the repository`)
  for (const q of [abs, real])
    if (within(ctx.root, q) && secretShaped(relative(ctx.root, q)))
      no(`${how} reads ${shownAs}, a secret-shaped file`)
  const rel = relative(ctx.root, real)
  if (
    rel &&
    !ignoredOk(rel) &&
    gitAt(ctx.root, ['check-ignore', '-q', '--', rel]).status === 0
  )
    no(`${how} reads ${shownAs}, a gitignored file`)
  return real
}

/** A directory read recursively: nothing secret or ignored inside it. */
function checkReadDir(real, shownAs, ctx, how) {
  let isDir = false
  try {
    isDir = statSync(real).isDirectory()
  } catch {
    return
  }
  if (!isDir) return
  if (within(real, ctx.root))
    no(`${how} reads ${shownAs} recursively, which includes .git`)
  const rel = relative(ctx.root, real)
  if (ignoredOk(rel)) return
  const list = args => {
    const r = gitAt(ctx.root, ['ls-files', '-z', ...args, '--', rel])
    if (r.status !== 0)
      no(`${how} reads ${shownAs}, which the guard cannot list`)
    return r.stdout.split('\u0000').filter(Boolean)
  }
  if (list(['-co', '--exclude-standard']).some(f => secretShaped(f)))
    no(`${how} reads ${shownAs} recursively, which holds a secret-shaped file`)
  const ignored = list(['-o', '-i', '--exclude-standard', '--directory'])
  if (ignored.some(f => !ignoredOk(f.replace(/\/$/, ''))))
    no(`${how} reads ${shownAs} recursively, which holds gitignored files`)
}

/** The files a reader reads, by its flags. */
function checkReader(name, args, ctx) {
  const how = name
  const patterned = PATTERN_FIRST.has(name)
  const grepLike = /^(e|f)?grep$/.test(name)
  let recursive = name === 'rg'
  let patternGiven = false
  const files = []
  const positional = []
  for (let k = 0; k < args.length; k++) {
    const w = args[k]
    const t = w.text
    if (t === '--') {
      positional.push(...args.slice(k + 1))
      break
    }
    if (!t.startsWith('-') || t === '-') {
      positional.push(w)
      continue
    }
    if (t.startsWith('--')) {
      const eq = t.indexOf('=')
      const flag = eq < 0 ? t : t.slice(0, eq)
      const val = eq < 0 ? null : glued(w, t.slice(eq + 1))
      if (patterned && /^--(regexp|expression)$/.test(flag)) {
        patternGiven = true
        if (!val) k++
      } else if (patterned && flag === '--file') {
        patternGiven = true
        const v = val ?? args[++k]
        if (v) files.push(v)
      } else {
        if (/^--(recursive|dereference-recursive)$/.test(flag)) recursive = true
        if (val && /[/~\u0000]|^\./.test(val.text)) files.push(val)
      }
      continue
    }
    for (let j = 1; j < t.length; j++) {
      const ch = t[j]
      if ((grepLike && /[rR]/.test(ch)) || (name === 'cp' && /[rRa]/.test(ch)))
        recursive = true
      if (patterned && (ch === 'e' || ch === 'f')) {
        patternGiven = true
        const rest = t.slice(j + 1)
        const v = rest ? glued(w, rest) : args[++k]
        if (ch === 'f' && v) files.push(v)
        break
      }
      if (j === 1 && /[/~\u0000]|^\./.test(t.slice(2))) {
        files.push(glued(w, t.slice(2)))
        break
      }
    }
  }
  let operands = positional
  if (patterned && !patternGiven) operands = positional.slice(1)
  if (name === 'cp' && operands.length > 1) operands = operands.slice(0, -1)
  files.push(...operands)
  if (recursive && !operands.length && (name === 'rg' || grepLike))
    files.push(new Word('.'))
  for (const f of files) {
    const reals = checkReadPath(f, ctx, how)
    if (recursive) for (const r of reals) checkReadDir(r, f.text, ctx, how)
  }
}

// ---------------------------------------------------------- environment --

const SECRET_VAR =
  /\$\{?[A-Za-z_]*(TOKEN|KEY|SECRET|PASSWORD|PASSWD|CREDENTIALS?)\w*\}?|\$\{!/i

/** Text-level: secret-shaped variables and /proc environ. */
function checkEnvText(raw) {
  if (/\/proc\/\S*environ/.test(raw))
    no('reading /proc/*/environ prints the environment')
  const m = SECRET_VAR.exec(raw)
  if (m) no(`${m[0]} expands a secret-shaped variable`)
}

/** Commands that print the environment. */
function checkEnvDump(name, cmd, args) {
  const texts = args.map(a => a.text)
  const flagsOnly = texts.every(t => t.startsWith('-') || t.startsWith('+'))
  if (name === 'env' && cmd.bare)
    no('env with no command prints the environment')
  if (name === 'printenv') no('printenv prints the environment')
  if (name === 'set' && !texts.length) no('bare set prints every variable')
  if (name === 'export' && (flagsOnly || texts.includes('-p')))
    no('export -p prints the environment')
  if (
    (name === 'declare' || name === 'typeset') &&
    (flagsOnly || texts.some(t => /^-\w*p/.test(t)))
  )
    no(`${name} -p prints variables`)
  if (name === 'compgen' && texts.some(t => /^-(\w*[ve]|A)/.test(t)))
    no('compgen lists variables')
}

// ------------------------------------------------------------------ api --

/**
 * Check a Bash command against the allow list. `cwd` is the session's
 * directory (hook input). Returns a reason to refuse, or null.
 */
export function checkAllowList(command, { cwd, home, root } = {}) {
  const raw = String(command).normalize('NFKC')
  const start = realish(resolve(cwd ?? process.cwd()))
  const ctx = {
    raw,
    cwd: start,
    root: realish(resolve(root ?? start)),
    home: home ?? process.env.HOME ?? null,
    gitConfigTouched:
      /\.git\/config\b/.test(raw) && /(^|[^\w-])git\s/.test(raw),
  }
  try {
    checkEnvText(raw)
    checkLine(raw, ctx)
  } catch (e) {
    if (e instanceof Refusal) return e.message
    throw e
  }
  return null
}
