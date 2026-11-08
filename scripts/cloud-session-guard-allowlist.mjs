// Whole-command allow list for Claude Code cloud sessions (#2547), ported
// from the red-rostrum#75 template (d34b15a). It replaces the #2528 allow
// list, which policed only gh, curl, wget and git push inside an otherwise
// open shell. Loaded by scripts/cloud-session-guard.mjs, so it runs only
// when CLAUDE_CODE_REMOTE=true. Plain Node, no dependencies.
//
// Why: a blocklist over shell cannot be sound. Shell keywords, grouping,
// brace expansion and substitutions each voided a rule of the old guard
// (`{cat,/etc/passwd}`, `if true; then …; fi`, `-F body="$(</etc/passwd)"`).
// So a Bash call is allowed only when:
//   1. It tokenises, in one linear pass, into literal words: any shell
//      metacharacter outside quotes, `$`, a backtick or a backslash inside
//      double quotes, a leading VAR=value, a reserved word, an unterminated
//      quote, control characters, or more than MAX_COMMAND characters is
//      refused. The one exception is `&&` between commands: an `&&` chain
//      of allowed commands is allowed, so `cd <dir> && <cmd>` works.
//   2. Each command matches one of the exact shapes in judge(). Anything
//      else, including every unknown program, is refused.
//   3. Every path it reads (reader arguments, `-F body=@file`, `--input`,
//      git pathspecs and `<rev>:<path>`) resolves, by the realpath of its
//      nearest existing parent and against the command's own cwd (`cd`
//      tracked), inside the repository root, and is not secret-shaped
//      (.env*, *.pem, *.key, anything under .git) or gitignored (build and
//      dependency output excepted). A `cd` may not leave the root.
//
// Defence in depth: the real controls are GitHub-side (branch protection,
// a separate agent identity, ops#242). A worker that needs a new shape asks
// Ron for it in its PR.

import { spawnSync } from 'node:child_process'
import { lstatSync, readlinkSync, realpathSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'

export const MAX_COMMAND = 4096 // characters of one Bash command
export const REPO_SLUG = 'taverns-red/toast-stats'

class Refusal extends Error {}
const no = reason => {
  throw new Refusal(reason)
}

// ------------------------------------------------------------ tokenizer --

/** Characters that make the shell do something other than pass a word. */
const META = new Set([
  ';',
  '&',
  '|',
  '`',
  '$',
  '(',
  ')',
  '{',
  '}',
  '<',
  '>',
  '!',
  '*',
  '?',
  '[',
  ']',
  '\\',
  '\n',
  '\r',
])
const RESERVED = new Set([
  'if',
  'then',
  'elif',
  'else',
  'fi',
  'while',
  'until',
  'do',
  'done',
  'case',
  'esac',
  'function',
  'select',
  'coproc',
  '[[',
  ']]',
  '{',
  '}',
  '!',
  'for',
  'in',
  'time',
])

/**
 * The commands of a line: arrays of literal words, split only on `&&`
 * outside quotes. Refuses everything else the shell would interpret.
 */
export function tokenize(line) {
  if (line.length > MAX_COMMAND)
    no(
      `the command is over ${MAX_COMMAND} characters, so the guard does not read it`
    )
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(line))
    no('the command has control characters')
  const commands = []
  let words = []
  let cur = ''
  let has = false
  const push = () => {
    if (has) words.push(cur)
    cur = ''
    has = false
  }
  const endCommand = () => {
    push()
    if (!words.length) no('an empty command')
    commands.push(words)
    words = []
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === "'") {
      const j = line.indexOf("'", i + 1)
      if (j === -1) no('an unterminated quote')
      cur += line.slice(i + 1, j)
      has = true
      i = j
    } else if (c === '"') {
      let j = i + 1
      for (; j < line.length && line[j] !== '"'; j++) {
        if (line[j] === '$' || line[j] === '`' || line[j] === '\\')
          no('an expansion or backslash inside double quotes')
        cur += line[j]
      }
      if (j >= line.length) no('an unterminated quote')
      has = true
      i = j
    } else if (c === ' ' || c === '\t') {
      push()
    } else if (c === '&' && line[i + 1] === '&' && line[i + 2] !== '&') {
      endCommand()
      i++
    } else if (META.has(c)) {
      no(
        `the shell metacharacter ${JSON.stringify(c)} is not allowed outside quotes`
      )
    } else if ((c === '#' || c === '~') && !has) {
      no(`a word may not start with ${c} (comment or home expansion)`)
    } else {
      cur += c
      has = true
    }
  }
  endCommand()
  for (const w of commands) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]))
      no('a leading variable assignment')
    if (RESERVED.has(w[0])) no('a shell reserved word')
  }
  return commands
}

// ---------------------------------------------------------------- paths --

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

/** Real path of p through the nearest existing parent, dangling links included. */
function realish(p, depth = 0) {
  if (depth > 20) no('too many symbolic links to resolve')
  let cur = resolve(p)
  const rest = []
  for (;;) {
    try {
      return join(realpathSync(cur), ...rest)
    } catch {
      let link = null
      try {
        if (lstatSync(cur).isSymbolicLink()) link = readlinkSync(cur)
      } catch {
        // does not exist
      }
      if (link !== null)
        return realish(join(resolve(dirname(cur), link), ...rest), depth + 1)
      const parent = dirname(cur)
      if (parent === cur) return resolve(p)
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

function git(dir, args) {
  const r = spawnSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: cleanGitEnv(),
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 3000,
  })
  return r
}
function gitOut(dir, ...args) {
  const r = git(dir, args)
  return r.status === 0 ? r.stdout.trim() : null
}

/** Secret-shaped: never read, never written (#2547). */
export const secretShaped = rel =>
  rel.split(sep).some(p => p === '.git' || SECRET_NAME.test(p))

/** Config other tools act on: never written. Secret-shaped is a subset. */
const CONFIG_NAME =
  /^(\.npmrc|\.yarnrc.*|\.gitattributes|\.gitmodules|\.gitconfig|\.envrc)$/i
const CONFIG_DIR = new Set(['.husky', '.githooks', '.claude', '.github'])
/** Directories other tools load code or settings from, at any depth. */
const TOOL_DIR = new Set(['node_modules', '.vscode', '.yarn', '.config'])

/** A path the file tools may not write, by its name and its real path. */
export function writeProtected(path, root) {
  const r = realish(resolve(root))
  const rels = [resolve(path), realish(resolve(path))].map(p =>
    within(r, p) ? relative(r, p) : p
  )
  for (const rel of rels) {
    const segs = rel.split(sep).filter(Boolean)
    if (secretShaped(rel)) return true
    if (segs.some(s => CONFIG_NAME.test(s))) return true
    // .claude anywhere (user settings and hooks too); the others in the repo
    if (segs.some(s => s.toLowerCase() === '.claude')) return true
    if (!isAbsolute(rel) && CONFIG_DIR.has(segs[0]?.toLowerCase())) return true
    if (!isAbsolute(rel) && segs.some(s => TOOL_DIR.has(s.toLowerCase())))
      return true
  }
  // Outside the repository, only under $TMPDIR (#2547).
  const real = realish(resolve(path))
  if (!within(r, real)) {
    const tmp = realish(resolve(process.env.TMPDIR || tmpdir()))
    if (!within(tmp, real)) return true
  }
  return false
}
const ignoredOk = rel => rel.split(sep).some(p => IGNORED_OK.has(p))

/** One path a command reads. Refuses, or returns its real path. */
function checkRead(p, ctx, how) {
  if (p === '') return null
  const abs = resolve(ctx.cwd, p)
  const real = realish(abs)
  const show = JSON.stringify(p.slice(0, 60))
  if (!within(ctx.root, real))
    no(`${how} reads ${show}, outside the repository`)
  for (const q of [abs, real])
    if (within(ctx.root, q) && secretShaped(relative(ctx.root, q)))
      no(`${how} reads ${show}, a secret-shaped file`)
  const rel = relative(ctx.root, real)
  if (
    rel &&
    !ignoredOk(rel) &&
    git(ctx.root, ['check-ignore', '-q', '--', rel]).status === 0
  )
    no(`${how} reads ${show}, a gitignored file`)
  return real
}

/** A directory read recursively: nothing secret or ignored inside it. */
function checkReadDir(real, ctx, how) {
  let dir = false
  try {
    dir = statSync(real).isDirectory()
  } catch {
    return
  }
  if (!dir) return
  if (within(real, ctx.root))
    no(`${how} -r over the repository root reaches .git`)
  const rel = relative(ctx.root, real)
  if (ignoredOk(rel)) return
  const list = args => {
    const r = git(ctx.root, ['ls-files', '-z', ...args, '--', rel])
    if (r.status !== 0) no(`${how} -r over a directory the guard cannot list`)
    return r.stdout.split('\u0000').filter(Boolean)
  }
  if (list(['-co', '--exclude-standard']).some(secretShaped))
    no(`${how} -r over a directory with secret-shaped files`)
  if (
    list(['-o', '-i', '--exclude-standard', '--directory']).some(
      f => !ignoredOk(f.replace(/\/$/, ''))
    )
  )
    no(`${how} -r over a directory with gitignored files`)
}

/**
 * Template rule: every non-option word may be a path (patterns and numbers
 * too), and so is the value of an --option=value.
 */
function confineReads(args, ctx, how) {
  const reals = []
  for (const a of args) {
    let word = a
    if (a.startsWith('-')) {
      const eq = a.indexOf('=')
      if (eq === -1) continue
      word = a.slice(eq + 1)
    }
    reals.push(checkRead(word, ctx, how))
  }
  return reals.filter(Boolean)
}

// --------------------------------------------------------------- shapes --

const PLAIN = /^[A-Za-z0-9_.,=@%+~^/:-]+$/
const plain = w => PLAIN.test(w)
const plainAll = (ws, what) => {
  for (const w of ws)
    if (!plain(w))
      no(
        `${what} takes plain words only, not ${JSON.stringify(w.slice(0, 40))}`
      )
}
const TOOL_FLAGS =
  /^(-c|--config|--root|-r|--plugin|--parser|--rulesdir|--resolve-plugins-relative-to|--env-file|--require|--import|--loader|--setupFiles|--globalSetup|--pre|--exec|--ignore-path|--plugin-search-dir|-p|--project)(=|$)/
const noToolFlags = ws => {
  for (const w of ws)
    if (TOOL_FLAGS.test(w)) no(`the option ${w} can load or run other code`)
}

/** Root package.json scripts a worker runs (CLAUDE.md, Commands). */
const NPM_SCRIPTS = new Set(
  (
    'test test:frontend test:collector-cli test:analytics-core ' +
    'test:shared-contracts test:mcp-server test:unit test:integration ' +
    'test:projects:check test:no-page-mounts:check test:coverage ' +
    'test:coverage:denominator-check test:scripts test:pipeline-harness ' +
    'test:quarantine:check lint lint:yaml format format:check typecheck ' +
    'typecheck:frontend typecheck:tests typecheck:count quality:check ' +
    'quality:fix pre-commit build:frontend build:collector-cli ' +
    'build:analytics-core build:shared-contracts build:mcp-server ' +
    'build:verify-emit lessons:index lessons:index:check seo:check'
  ).split(' ')
)

function judgeNpm(w) {
  const [, sub, ...rest] = w
  if ((sub === 'ci' || sub === 'install') && rest.length === 0) return
  let args
  if (sub === 'test') args = rest
  else if (sub === 'run' && NPM_SCRIPTS.has(rest[0])) args = rest.slice(1)
  else
    no(
      `npm ${sub ?? ''} ${sub === 'run' ? (rest[0] ?? '') : ''} is not on the cloud allow list`
    )
  if (args.length === 0) return
  if (args[0] !== '--') no('npm takes extra arguments only after --')
  plainAll(args.slice(1), 'npm')
  noToolFlags(args.slice(1))
}

function judgeNpx(w, ctx) {
  const [, tool, ...rest] = w
  if (tool === 'vitest' && (rest[0] === 'run' || rest[0] === '--run')) {
    plainAll(rest.slice(1), 'vitest')
    return noToolFlags(rest.slice(1))
  }
  if (tool === 'tsc' && rest[0] === '--noEmit') {
    if (rest.slice(1).every(a => a === '--skipLibCheck' || a === '--pretty'))
      return
  }
  if (tool === 'eslint' || tool === 'prettier') {
    plainAll(rest, tool)
    noToolFlags(rest)
    if (
      rest.some(a =>
        /^--(stdin|cache-location|output-file|log-file)|^-o$/.test(a)
      )
    )
      no(`${tool} with that option is not on the cloud allow list`)
    return void confineReads(rest, ctx, tool)
  }
  no(`npx ${tool ?? ''} with these arguments is not on the cloud allow list`)
}

// ------------------------------------------------------------------ git --

const GIT_READ = new Set([
  'status',
  'diff',
  'log',
  'show',
  'fetch',
  'rev-parse',
  'blame',
  'grep',
])
/** Long options denied here; git takes any unique prefix, so those too. */
const GIT_BAD_LONG = [
  '--output',
  '--ext-diff',
  '--textconv',
  '--upload-pack',
  '--receive-pack',
  '--exec',
  '--git-dir',
  '--work-tree',
  '--config-env',
  '--namespace',
  '--open-files-in-pager',
  '--exec-path',
  '--no-index',
  '--contents',
]
const badGitOption = a => {
  if (GIT_BAD_OPTS.test(a)) return true
  const name = a.split('=')[0]
  return (
    name.startsWith('--') &&
    name.length > 2 &&
    GIT_BAD_LONG.some(o => o.startsWith(name))
  )
}
const GIT_BAD_OPTS =
  /^(--output|--ext-diff|--textconv|--upload-pack|--receive-pack|--exec|--git-dir|--work-tree|--config-env|--namespace|--open-files-in-pager|--exec-path|--no-index|--contents|-O|-c)(=|$)|^-O./
const MAIN = /^(refs\/heads\/)?(main|master)$/

/** The protected paths a worker may not stage (template list, our names). */
const PROTECTED_DIRS = new Set(['.claude', '.githooks', '.husky', '.github'])
const PROTECTED_FILES = new Set([
  'claude.md',
  'package.json',
  'package-lock.json',
])
function isProtected(rel) {
  const segs = rel.toLowerCase().split(sep).filter(Boolean)
  if (!segs.length) return false
  if (PROTECTED_DIRS.has(segs[0])) return true
  if (segs.length === 1 && PROTECTED_FILES.has(segs[0])) return true
  if (segs[0] === 'scripts' && segs[1]?.startsWith('cloud-session-'))
    return true
  return /^scripts\/lib\/__tests__\/cloudsessionguard/.test(segs.join('/'))
}
/** Staging one of these would stage protected files with it. */
const holdsProtected = rel =>
  [
    '',
    'scripts',
    join('scripts', 'lib'),
    join('scripts', 'lib', '__tests__'),
  ].includes(rel)

function judgeGit(w, ctx) {
  // No option before the subcommand: -c, --git-dir, --work-tree, -C and
  // --config-env all change what git runs or where.
  const sub = w[1]
  if (sub === undefined || sub.startsWith('-'))
    no('git options before the subcommand can change config or location')
  const rest = w.slice(2)
  for (const a of rest)
    if (badGitOption(a))
      no(
        `git ${sub} ${a} can write files, run other code or read outside the repository`
      )
  if (GIT_READ.has(sub)) {
    plainAll(rest, `git ${sub}`)
    if (sub === 'fetch') {
      if (
        rest[0] !== 'origin' ||
        rest.length > 2 ||
        (rest[1] !== undefined && !/^[\w.][\w./-]*$/.test(rest[1]))
      )
        no('git fetch is allowed only as `git fetch origin [<branch>]`')
      return
    }
    // Pathspecs and <rev>:<path> are reads: every word may be one, and so
    // is an --option=value. A <rev>:<path> path is relative to the root.
    for (const a of rest) {
      if (a === '--') continue
      let word = a
      if (a.startsWith('-')) {
        const eq = a.indexOf('=')
        if (eq === -1) continue
        word = a.slice(eq + 1)
      }
      const colon = word.indexOf(':')
      if (!a.startsWith('-') && colon >= 0)
        checkRead(
          word.slice(colon + 1),
          { ...ctx, cwd: ctx.root },
          `git ${sub}`
        )
      else checkRead(word, ctx, `git ${sub}`)
    }
    return
  }
  if (sub === 'branch' && rest.length === 1 && rest[0] === '--show-current')
    return
  if (sub === 'add') return judgeAdd(rest, ctx)
  if (sub === 'commit') return judgeCommit(rest, ctx)
  if (sub === 'push') return judgePush(rest, ctx)
  no(`git ${sub} is not on the cloud allow list`)
}

function repoRoot(ctx) {
  return (
    gitOut(ctx.cwd, 'rev-parse', '--show-toplevel') ??
    no('git cannot find a repository here')
  )
}

function stageable(p, ctx, what) {
  if (!plain(p) || p.startsWith('-'))
    no(
      `${what} takes plain path words only, not ${JSON.stringify(p.slice(0, 40))}`
    )
  const real = checkRead(p, ctx, what)
  const rel = relative(realish(repoRoot(ctx)), real)
  if (rel.startsWith('..') || isAbsolute(rel))
    no(`${what} path is outside the repository`)
  if (isProtected(rel) || holdsProtected(rel))
    no(
      `${what} ${p}: the guard, the settings, the git hooks, CI, CLAUDE.md and package.json are Ron's to change`
    )
}

function judgeAdd(rest, ctx) {
  const paths = rest[0] === '--' ? rest.slice(1) : rest
  if (!paths.length) no('git add needs explicit paths')
  for (const p of paths) stageable(p, ctx, 'git add')
}

function judgeCommit(rest, ctx) {
  if (
    rest.length >= 2 &&
    rest.length % 2 === 0 &&
    rest.every((a, i) => (i % 2 === 0 ? a === '-m' : true))
  )
    return
  if (rest.length === 2 && rest[0] === '-F')
    return stageable(rest[1], ctx, 'git commit -F')
  no('git commit is allowed only as -m <message> (repeatable) or -F <file>')
}

/** `git push [-u] origin <ref>` to the checked-out branch, from the root. */
function judgePush(rest, ctx) {
  const args = rest.filter(a => a !== '-u' && a !== '--set-upstream')
  if (args.length !== 2 || args[0] !== 'origin')
    no('a cloud worker pushes only `git push [-u] origin <session branch>`')
  const root = repoRoot(ctx)
  if (realish(ctx.cwd) !== realish(root))
    no('git push must run from the repository root')
  const branch = gitOut(root, 'rev-parse', '--abbrev-ref', 'HEAD')
  const defaultBranch = gitOut(
    root,
    'symbolic-ref',
    '--short',
    'refs/remotes/origin/HEAD'
  )?.replace(/^origin\//, '')
  if (
    !branch ||
    branch === 'HEAD' ||
    MAIN.test(branch) ||
    branch === defaultBranch
  )
    no(
      'never push from main, the default branch or a detached HEAD; push only your session branch'
    )
  const own = new Set([branch, `refs/heads/${branch}`, 'HEAD'])
  const spec = args[1]
  const colon = spec.indexOf(':')
  const ok =
    colon < 0
      ? own.has(spec)
      : own.has(spec.slice(0, colon)) &&
        [branch, `refs/heads/${branch}`].includes(spec.slice(colon + 1))
  if (!ok)
    no(`a cloud worker pushes only its session branch (${branch}), not ${spec}`)
  if (gitOut(root, 'config', '--get-all', 'remote.origin.push') !== null)
    no('remote.origin.push is configured, so the destination is not plain')
  if (gitOut(root, 'config', '--get', 'remote.origin.mirror') !== null)
    no('remote.origin.mirror is configured')
}

// ------------------------------------------------------------------- gh --

const GH_ALLOWED = {
  pr: ['create', 'view', 'list', 'checks', 'diff', 'comment', 'status'],
  issue: ['view', 'list', 'comment'],
  run: ['view', 'list'],
}
// Labels are Ron's, PRs do not retarget, --body-file/-F/--template read a
// file into a PR or comment, --web opens a browser, --log prints CI logs
// that can hold secrets masked only in the UI.
const GH_BAD_FLAGS =
  /^(--label|--add-label|--remove-label|-l|--base|-B|--editor|-e|--body-file|--template|--recover|--web)(=|$)|^-[FTw]/
const GH_TEXT_FLAGS = new Set([
  '--body',
  '-b',
  '--title',
  '-t',
  '--jq',
  '-q',
  '--json',
])
const SLUG_URL = new RegExp(`^https://github\\.com/${REPO_SLUG}(/|$)`, 'i')

function judgeRepoOption(value) {
  const v = (value ?? '').toLowerCase().replace(/^https:\/\/github\.com\//, '')
  if (v !== REPO_SLUG)
    no(`gh may only act on ${REPO_SLUG}, not ${value ?? '(missing)'}`)
}

function judgeGh(w, ctx) {
  const args = []
  for (let j = 1; j < w.length; j++) {
    const a = w[j]
    if (a === '-R' || a === '--repo') judgeRepoOption(w[++j])
    else if (a.startsWith('--repo=')) judgeRepoOption(a.slice(7))
    else if (/^-R./.test(a)) judgeRepoOption(a.slice(2))
    else args.push(a)
  }
  const [group, sub, ...rest] = args
  if (group === 'api') return judgeApi(args.slice(1), ctx)
  if (!GH_ALLOWED[group]?.includes(sub))
    no(`gh ${group ?? ''} ${sub ?? ''} is not on the cloud allow list`)
  for (let j = 0; j < rest.length; j++) {
    const a = rest[j]
    if (GH_BAD_FLAGS.test(a))
      no(`gh ${group} ${sub} ${a} is not for cloud workers`)
    if (GH_TEXT_FLAGS.has(a)) {
      j++
      continue
    }
    if (/^--(body|title|jq|json)=/.test(a)) continue
    if (/:\/\/|^github\.com|^git@/i.test(a) && !SLUG_URL.test(a))
      no(`gh may only act on ${REPO_SLUG}, not ${a}`)
  }
}

// gh api: GET anywhere under this repo; POST and PATCH only on the routes a
// worker uses (CLAUDE.md, docs/cloud-sessions.md).

const VALUE_OPAQUE = Symbol('opaque')
const body = () => ({ opaque: false, fields: new Map() })
function addField(b, key, value) {
  const k = String(key).replace(/\[.*$/, '').toLowerCase()
  if (!b.fields.has(k)) b.fields.set(k, [])
  b.fields.get(k).push(value)
}

const RP = 'repos/[^/]+/[^/]+'
const ROUTES = [
  ['POST', new RegExp(`^${RP}/pulls$`), () => null],
  ['POST', new RegExp(`^${RP}/issues/\\d+/comments$`), () => null],
  ['POST', new RegExp(`^${RP}/pulls/\\d+/comments$`), () => null],
  [
    'POST',
    new RegExp(`^${RP}/pulls/\\d+/reviews$`),
    b => {
      const ev = b.fields.get('event')
      if (b.opaque || !ev || ev.length !== 1 || ev[0] === VALUE_OPAQUE)
        return 'a review whose event is not visibly COMMENT'
      return ev[0] === 'COMMENT' ? null : `a review with event ${ev[0]}`
    },
  ],
  [
    'PATCH',
    new RegExp(`^${RP}/pulls/\\d+$`),
    b => {
      if (b.opaque) return 'a PR update whose fields come from a file'
      const keys = [...b.fields.keys()]
      const bad = keys.filter(x => !['title', 'body', 'draft'].includes(x))
      if (!keys.length) return 'a PR update with no visible fields'
      return bad.length ? `a PR update that sets ${bad.join(', ')}` : null
    },
  ],
  [
    'POST',
    new RegExp(`^${RP}/issues/\\d+/labels$`),
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

const API_FLAGS = {
  '--paginate': 0,
  '--slurp': 0,
  '-i': 0,
  '--include': 0,
  '--silent': 0,
  '--verbose': 0,
  '-q': 1,
  '--jq': 1,
  '-t': 1,
  '--template': 1,
  '--cache': 1,
  '-X': 1,
  '--method': 1,
  '-f': 1,
  '--raw-field': 1,
  '-F': 1,
  '--field': 1,
  '--input': 1,
}
const API_PATH = new RegExp(
  `^repos/${REPO_SLUG}(/[A-Za-z0-9_./-]*)?(\\?[A-Za-z0-9_.,:=&/%-]*)?$`,
  'i'
)

function judgeApi(args, ctx) {
  let method = null
  const b = body()
  let hasFields = false
  const paths = []
  const take = (flag, v) => {
    if (v === undefined) no(`gh api ${flag} needs a value`)
    if (flag === '-X' || flag === '--method') method = v.toUpperCase()
    else if (/^(-f|--raw-field|-F|--field)$/.test(flag)) {
      hasFields = true
      const eq = v.indexOf('=')
      if (eq < 0) return addField(b, v, VALUE_OPAQUE)
      const key = v.slice(0, eq)
      const val = v.slice(eq + 1)
      if (/^(-F|--field)$/.test(flag) && val.startsWith('@')) {
        if (val === '@-') no('gh api -F with stdin')
        checkRead(val.slice(1), ctx, 'gh api -F')
        return addField(b, key, VALUE_OPAQUE)
      }
      addField(b, key, val)
    } else if (flag === '--input') {
      hasFields = true
      b.opaque = true
      if (v === '-') no('gh api --input from stdin')
      checkRead(v, ctx, 'gh api --input')
    }
  }
  for (let j = 0; j < args.length; j++) {
    const a = args[j]
    if (!a.startsWith('-')) {
      paths.push(a)
      continue
    }
    let name
    let value
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      name = eq < 0 ? a : a.slice(0, eq)
      value = eq < 0 ? undefined : a.slice(eq + 1)
    } else {
      name = a.slice(0, 2)
      value = a.length > 2 ? a.slice(2) : undefined
    }
    if (!(name in API_FLAGS))
      no(`gh api ${a} is not allowed (no headers, previews or other hosts)`)
    if (API_FLAGS[name] === 1) take(name, value ?? args[++j])
  }
  if (paths.length !== 1) no('gh api takes exactly one endpoint')
  const p = paths[0]
  if (
    /(^|\/)([\w-]*-)?(secrets|variables)(\/|\?|$)|(registration|remove)-token/i.test(
      p
    ) ||
    p.split('?')[0].includes('%')
  )
    no('gh api may not read secrets, variables or runner tokens')
  if (
    !API_PATH.test(p) ||
    p.includes('..') ||
    p.split(/[?/&=]/).some(s => s === '.') ||
    /%2[ef]/i.test(p)
  )
    no(`gh api may only call repos/${REPO_SLUG}/...`)
  const m = method ?? (hasFields ? 'POST' : 'GET')
  if (m === 'GET' || m === 'HEAD') return
  const path = p.split('?')[0].toLowerCase()
  for (const [rm, re, check] of ROUTES) {
    if (rm !== m || !re.test(path)) continue
    const why = check(b)
    if (why) no(`gh api ${m} ${path}: ${why}`)
    return
  }
  no(`gh api ${m} ${path} is not on the cloud allow list`)
}

// -------------------------------------------------------------- readers --

const SED_SCRIPT = /^(\d+|\$)(,(\d+|\$))?p$/

function judgeReader(prog, args, ctx) {
  if (prog === 'grep' || prog === 'rg') {
    if (
      args.some(a =>
        /^--(pre|pre-glob|hostname-bin|file|exclude-from|ignore-file|ignore-file-case-insensitive|hidden|no-ignore[\w-]*|follow|unrestricted)(=|$)|^-[A-Za-z]*[fLu.]/.test(
          a
        )
      )
    )
      no(
        `${prog} with an option that runs a program, reads a pattern file or reaches hidden or ignored files`
      )
  }
  if (
    prog === 'jq' &&
    args.some(a =>
      /\benv\b|\$ENV|\$__loc__|\$__prog|\binput(s|_filename|_line_number)?\b|\bget_search_list\b/.test(
        a
      )
    )
  )
    no('jq may not read the environment or other input')
  if (
    prog === 'jq' &&
    args.some(a =>
      /^(-f|--from-file|--rawfile|--slurpfile|--argfile|-L|--library-path)(=|$)/.test(
        a
      )
    )
  )
    no('jq may not read other files')
  const reals = confineReads(args, ctx, prog)
  const recursive =
    (prog === 'grep' &&
      args.some(a =>
        /^(-[A-Za-z]*[rR][A-Za-z]*|--recursive|--dereference-recursive)$/.test(
          a
        )
      )) ||
    (prog === 'diff' &&
      args.some(a => /^(-[A-Za-z]*r[A-Za-z]*|--recursive)$/.test(a)))
  if (!recursive) return
  const operands = args.filter(a => !a.startsWith('-'))
  // grep -r with only a pattern searches the cwd
  if (prog === 'grep' && operands.length <= 1) reals.push(ctx.cwd)
  for (const r of reals) checkReadDir(r, ctx, prog)
}

function judgeCd(args, ctx) {
  if (args.length !== 1 || args[0].startsWith('-'))
    no('cd takes one directory inside the repository')
  const dir = realish(resolve(ctx.cwd, args[0]))
  if (!within(ctx.root, dir)) no(`cd ${args[0]} leaves the repository`)
  ctx.cwd = dir
}

function judgeAgentCli(prog, args, ctx) {
  if (realish(resolve(ctx.cwd, prog)) !== join(ctx.root, 'bin', 'agent-cli'))
    no(`${prog} is not on the cloud allow list`)
  plainAll(args, 'agent-cli')
}

function judge(w, ctx) {
  const prog = w[0]
  const args = w.slice(1)
  switch (prog) {
    case 'cd':
      return judgeCd(args, ctx)
    case 'npm':
      return judgeNpm(w)
    case 'npx':
      return judgeNpx(w, ctx)
    case 'git':
      return judgeGit(w, ctx)
    case 'gh':
      return judgeGh(w, ctx)
    case 'ls':
    case 'cat':
    case 'head':
    case 'tail':
    case 'wc':
    case 'diff':
      plainAll(args, prog)
      return judgeReader(prog, args, ctx)
    case 'grep':
    case 'rg':
    case 'jq':
      return judgeReader(prog, args, ctx)
    case 'echo':
      return
    case 'pwd':
      if (args.length === 0) return
      break
    case 'node':
      if (args.length === 1 && (args[0] === '-v' || args[0] === '--version'))
        return
      break
    case 'sed':
      if (args[0] === '-n' && SED_SCRIPT.test(args[1] ?? '')) {
        plainAll(args.slice(2), 'sed')
        if (args.slice(2).some(a => a.startsWith('-')))
          no('sed -n takes file names only')
        return void confineReads(args.slice(2), ctx, 'sed')
      }
      no('sed is allowed only as `sed -n <N[,M]p> <files>`')
  }
  if (/(^|\/)agent-cli$/.test(prog)) return judgeAgentCli(prog, args, ctx)
  no(
    `${JSON.stringify(prog.slice(0, 40))} with these arguments is not on the cloud allow list`
  )
}

// ----------------------------------------------------- other tools (#2547) --
//
// Dormant until a PreToolUse matcher routes these tools to the guard: today
// .claude/settings.json sends only Bash and the edit tools. Subagents' tool
// calls fire the same PreToolUse hooks, with agent_id and agent_type in the
// input (code.claude.com/docs/en/hooks, "Hooks ... also run inside
// subagents"), so Agent itself is allowed.

/** Tools with no file or network I/O of their own (tools reference). */
export const NO_IO_TOOLS = new Set([
  'TodoWrite',
  'ExitPlanMode',
  'EnterPlanMode',
  'ToolSearch',
  'AskUserQuestion',
  'TaskCreate',
  'TaskGet',
  'TaskList',
  'TaskUpdate',
  'TaskStop',
  'SubagentHandback',
  'SendMessage',
  'ListAgents',
  'Skill',
  'Agent',
  'Task',
])

/** Read, Grep and Glob take the Bash read rules. Returns a reason or null. */
export function checkReadTool(tool, ti, { cwd, root } = {}) {
  try {
    const start = realish(resolve(cwd ?? process.cwd()))
    const ctx = { cwd: start, root: realish(resolve(root ?? start)) }
    const str = (v, what) => {
      if (v === undefined || v === null) return undefined
      if (typeof v !== 'string') no(`${tool} ${what} is not a string`)
      return v
    }
    if (tool === 'Read') {
      const p = str(ti?.file_path, 'file_path')
      if (!p) no('Read needs a file_path')
      checkRead(p, ctx, 'Read')
    } else if (tool === 'Grep') {
      const p = str(ti?.path, 'path') || ctx.cwd
      const glob = str(ti?.glob, 'glob') ?? ''
      if (glob.includes('..') || isAbsolute(glob))
        no('Grep glob leaves the path')
      const real = checkRead(p, ctx, 'Grep')
      checkReadDir(real ?? ctx.cwd, ctx, 'Grep')
    } else if (tool === 'Glob') {
      const p = str(ti?.path, 'path') || ctx.cwd
      const pattern = str(ti?.pattern, 'pattern') ?? ''
      if (
        pattern.includes('..') ||
        isAbsolute(pattern) ||
        pattern.startsWith('~')
      )
        no('Glob pattern leaves the path')
      checkRead(p, ctx, 'Glob')
    } else no(`${tool} is not a read tool`)
  } catch (e) {
    if (e instanceof Refusal) return e.message
    throw e
  }
  return null
}

// ------------------------------------------------------------------ api --

/**
 * Check a Bash command against the allow list. `cwd` is the hook's cwd,
 * `root` the repository root (CLAUDE_PROJECT_DIR). Returns a reason to
 * refuse, or null.
 */
export function checkAllowList(command, { cwd, root } = {}) {
  try {
    const start = realish(resolve(cwd ?? process.cwd()))
    const ctx = { cwd: start, root: realish(resolve(root ?? start)) }
    if (!within(ctx.root, ctx.cwd))
      no('the session is outside the repository root')
    for (const words of tokenize(String(command))) judge(words, ctx)
  } catch (e) {
    if (e instanceof Refusal) return e.message
    throw e
  }
  return null
}
