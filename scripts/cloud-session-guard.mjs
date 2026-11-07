// PreToolUse guard logic for Claude Code cloud sessions (#2519, ops#242).
// Run by scripts/cloud-session-guard.sh, which already returned 0 unless
// CLAUDE_CODE_REMOTE=true. Plain Node, no dependencies, so it works before
// `npm ci` finishes and stays fast on every tool call.
//
// Why: cloud workers act as `rservant`, and the ADR 0019 guard trusts
// `db-breaking-approved` when rservant applied it last. A worker must never
// apply, create, edit or remove that label. The real fix is a separate agent
// identity (ops#242); this is the stopgap.
//
// The rule is deliberately conservative. A command is refused when it looks
// like a label write AND either names the label (after normalising quoting,
// case, escapes and URL-encoding) or hides what it writes (shell expansion,
// a payload from a file or stdin, a GraphQL label mutation, encoded text).
// A false positive costs a question to Ron; a false negative costs the
// ADR 0019 approval.
//
// Hooks contract (https://code.claude.com/docs/en/hooks): exit 2 blocks the
// tool call and stderr is shown to the model; exit 0 allows it.

import { readFileSync } from 'node:fs'

const LABEL = 'db-breaking-approved'

function refuse(reason) {
  process.stderr.write(
    `cloud-session-guard (#2519): refused: ${reason}.\n` +
      `Cloud sessions must not apply, create, edit or remove the ${LABEL} ` +
      'label by any path: it is Ron\u2019s ADR 0019 approval and cloud ' +
      'workers act as rservant on GitHub. Ask Ron to do it himself. If this ' +
      'is a false positive, ask Ron rather than rewording the command.\n'
  )
  process.exit(2)
}

/** Undo the encodings a command can hide the label behind. */
export function normalize(raw) {
  let s = String(raw).replace(/\\\r?\n/g, ' ')
  for (let i = 0; i < 4; i++) {
    const before = s
    s = s
      .replace(/%([0-9a-fA-F]{2})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16))
      )
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16))
      )
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16))
      )
      .replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
    if (s === before) break
  }
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/["'\\]/g, '')
}

const METHOD = '(post|put|patch|delete)'

/** One shell segment that writes, by its shape. */
function segmentWrites(seg, { prose = false } = {}) {
  if (/\bgh\s+label\s+(create|edit|delete|clone)\b/.test(seg)) return true
  if (/\bgh\s+(issue|pr)\s+(edit|create)\b/.test(seg)) return true
  if (/\bgh\s+alias\s+(set|import)\b/.test(seg)) return true
  if (!prose && /graphql/.test(seg)) return true
  if (new RegExp(`(^|[^a-z0-9])${METHOD}([^a-z0-9]|$)`).test(seg)) return true
  if (new RegExp(`(^|\\s)-[a-z]*x\\s*=?\\s*${METHOD}`).test(seg)) return true
  if (new RegExp(`--(method|request)[\\s=]*${METHOD}`).test(seg)) return true
  const explicitGet = /(^|\s)(-[a-z]*x|--method|--request)[\s=]*get\b/.test(seg)
  if (
    /\bgh\s+api\b/.test(seg) &&
    /(^|\s)(-f\S*|--field|--raw-field|--input)(\s|=|$)/.test(seg) &&
    !explicitGet
  )
    return true
  if (
    /\bcurl\b/.test(seg) &&
    /(^|\s)(-[a-z]*[dt]\S*|--data[a-z-]*|--json|--form|--upload-file)(\s|=|$)/.test(
      seg
    )
  )
    return true
  if (/\bwget\b/.test(seg) && /--(method|post-data|post-file|body-)/.test(seg))
    return true
  return false
}

/** The body is out of sight: a file, stdin or a heredoc. */
function opaqueBody(s) {
  return (
    /--input\b/.test(s) ||
    /(^|\s)-[a-z]*d\s*=?\s*@/.test(s) ||
    /--(data[a-z-]*|json|form)[\s=]+@/.test(s) ||
    /--upload-file|--(post|body)-file/.test(s) ||
    (/\bcurl\b/.test(s) && /(^|\s)-[a-z]*t\s+\S/.test(s)) ||
    /(label[a-z_]*|query|name)(\[\])?=@/.test(s) ||
    /<</.test(s)
  )
}

/** Built at run time, so the text we see is not what runs. */
function dynamic(s) {
  return /[$`]|\bxargs\b|\bparallel\b|\{\}|-exec\b|<\(/.test(s)
}

const LABEL_MUTATION =
  /(add|remove|clear)labels?(to|from)labelable|(create|update|delete)label\b/

/** Names the label, whatever the separators: db_breaking approved, etc. */
function namesLabel(s) {
  return s.replace(/[^a-z0-9]/g, '').includes('dbbreakingapproved')
}

/** Touches labels. `-l` is the short form of --label on gh issue/pr create. */
function labelish(s) {
  return (
    /label/.test(s) ||
    /\bgh\s+(issue|pr)\s+(create|edit)\b[^;&|\n]*\s-[a-z]*l(\s|=|$)/.test(s)
  )
}

/**
 * Text a Write or Edit puts in a file. Only the rules that name the label,
 * or a GraphQL label mutation, apply: source files are full of `$`, `label`
 * and `delete`, and the shape rules would block ordinary edits. Checked line
 * by line, so a doc that mentions the label in one place and a `gh api` call
 * in another is not a label write. Returns a reason to refuse, or null.
 */
export function checkFileText(raw) {
  const s = normalize(raw)
  if (/graphql/.test(s) && LABEL_MUTATION.test(s))
    return 'a GraphQL label mutation (it takes label IDs, so the name is not visible)'
  for (const line of String(raw)
    .replace(/\\\r?\n/g, ' ')
    .split('\n')) {
    const l = normalize(line)
    if (labelish(l) && segmentWrites(l, { prose: true }) && namesLabel(l))
      return `a write naming ${LABEL}`
  }
  return null
}

/** A Bash command. Returns a reason to refuse, or null. */
export function checkCommand(raw) {
  const s = normalize(raw)
  const mentions = namesLabel(s)
  const writes = s.split(/\|\||&&|[;&|\n()]/).some(seg => segmentWrites(seg))
  const labels = labelish(s)
  const opaque = opaqueBody(s)
  const dyn = dynamic(s)

  if (/\bgh\s+label\s+clone\b/.test(s))
    return '`gh label clone` copies every label, this one included'
  if (
    /base64\s+(-d|--decode)|b64decode|xxd\s+-r|openssl\s+(enc|base64)|\brev\b|rot_?13|codecs\.decode/.test(
      s
    ) &&
    (/\b(bash|sh|zsh|dash|ksh|eval|source|exec|python3?|node|perl|ruby|gh|curl|wget|xargs)\b|\|\s*\./.test(
      s
    ) ||
      /\$\(|`/.test(s))
  )
    return 'running decoded text hides what the command does'
  if (/graphql/.test(s) && writes) {
    if (LABEL_MUTATION.test(s) || (labels && /mutation/.test(s)))
      return 'a GraphQL label mutation (it takes label IDs, so the name is not visible)'
    if (opaque || dyn)
      return 'a GraphQL request whose query comes from a file, stdin or the shell'
  }
  if (/\bgh\s+alias\s+(set|import)\b/.test(s) && (labels || dyn || opaque))
    return 'a gh alias that could write labels'
  if (labels && writes && mentions) return `a write naming ${LABEL}`
  if (labels && writes && dyn)
    return 'a label write whose label name is built at run time'
  if (labels && writes && opaque)
    return 'a label write whose payload comes from a file or stdin'
  if (writes && opaque) {
    const commentsOnly = /\/comments\b/.test(s) && !/\.\./.test(s)
    if (dyn) return 'a write to a URL built at run time with a hidden payload'
    if (/issues|labels|graphql/.test(s) && !commentsOnly)
      return 'a write to issues or labels whose payload comes from a file or stdin'
  }
  return null
}

const PROTECTED_PATH =
  /(^|\/)scripts\/cloud-session-guard\.(sh|mjs)$|(^|\/)scripts\/lib\/__tests__\/cloudSessionGuard\.test\.ts$|(^|\/)\.claude\/settings(\.local)?\.json$/

/** A Bash command that would change the guard or the settings that load it. */
function tampers(raw) {
  const s = normalize(raw)
    .replace(/\d*>&\d/g, ' ')
    .replace(/\d*>\s*\/dev\/null/g, ' ')
  if (!/cloud-session-guard|cloudsessionguard|\.claude\/settings/.test(s))
    return false
  return /(>|\btee\b|\bsed\b[^|;&]*\s-i|\bperl\b[^|;&]*\s-[a-z]*i|\bawk\b[^|;&]*-i|\b(cp|mv|rm|ln|chmod|chown|truncate|dd|install|python3?|node|ruby)\b|\bgit\s+(checkout|restore|reset|rm|mv|apply|am|stash|cherry-pick|revert|merge|rebase|pull|switch))/.test(
    s
  )
}

function main() {
  let input
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    refuse('the hook input could not be read, so the call was not checked')
  }
  const tool = input?.tool_name ?? ''
  const ti = input?.tool_input ?? {}

  if (tool === 'Bash') {
    const cmd = String(ti.command ?? '')
    if (tampers(cmd)) refuse('a change to the cloud session guard or settings')
    const reason = checkCommand(cmd)
    if (reason) refuse(reason)
    process.exit(0)
  }

  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const path = String(ti.file_path ?? ti.notebook_path ?? '')
    if (PROTECTED_PATH.test(path))
      refuse(`an edit of ${path}, which enforces this rule`)
    const text = [
      ti.content,
      ti.new_string,
      ti.new_source,
      ...(Array.isArray(ti.edits) ? ti.edits.map(e => e?.new_string) : []),
    ]
      .filter(t => typeof t === 'string')
      .join('\n')
    const reason = text ? checkFileText(text) : null
    if (reason) refuse(`a file that would run ${reason}`)
  }
  process.exit(0)
}

main()
