/**
 * Workflow contract: ci.yml supersedes stale PR runs without ever cancelling
 * a run that matters (#2607 item 2).
 *
 * The test evaluates the real `concurrency.group` and `cancel-in-progress`
 * expressions from ci.yml against a table of event contexts, so a broken
 * expression fails even if it still contains the right substrings.
 *
 * Why each clause exists:
 * - A per-PR group with cancel-in-progress stops a push from paying for the
 *   run it just made obsolete.
 * - Cancel only on `pull_request`. ci.yml triggers on push to main,
 *   pull_request and workflow_call. A push to main must run to completion;
 *   and because a same-group run that is merely *queued* is also dropped when
 *   a newer one arrives, non-PR runs get a group unique to the run.
 *   (Nothing calls ci.yml today. A workflow_call run reports the caller's
 *   event_name, so it also lands in the per-run group unless the caller is a
 *   pull_request.)
 * - A no-op PR edit (title/body, not base) runs ci.yml with every job skipped
 *   (#2204). If it shared the PR's group it would cancel the real in-flight
 *   run and leave a cancelled required check on the head with only a skipped
 *   run beside it, so CI Gate would fail. It gets its own group, exactly as
 *   docs.yml does (#2204, #2316).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const FILE = path.resolve(process.cwd(), '.github/workflows/ci.yml')

interface Workflow {
  concurrency?: { group?: unknown; 'cancel-in-progress'?: unknown } | string
}

const conc = () => {
  const c = (parse(fs.readFileSync(FILE, 'utf-8')) as Workflow).concurrency
  return typeof c === 'object' && c !== null ? c : undefined
}

// --- Minimal evaluator for the GitHub expression subset ci.yml uses --------
// Supports: string/number/true/false/null literals, dotted property access,
// `!`, `==`, `!=`, `&&`, `||` (value-returning, like GitHub), parentheses and
// format(). Anything else throws, so a new construct forces a deliberate
// extension here rather than being silently mis-evaluated.

type Value = string | number | boolean | null
type Token = { t: 'op' | 'val' | 'id'; v: string | number | boolean | null }

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) {
      i++
    } else if (ch === "'") {
      let s = ''
      i++
      for (;;) {
        if (i >= src.length) throw new Error('unterminated string')
        if (src[i] === "'" && src[i + 1] === "'") {
          s += "'"
          i += 2
        } else if (src[i] === "'") {
          i++
          break
        } else s += src[i++]
      }
      out.push({ t: 'val', v: s })
    } else if (/[0-9]/.test(ch)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i))!
      out.push({ t: 'val', v: Number(m[0]) })
      i += m[0].length
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(src.slice(i))!
      i += m[0].length
      if (m[0] === 'true') out.push({ t: 'val', v: true })
      else if (m[0] === 'false') out.push({ t: 'val', v: false })
      else if (m[0] === 'null') out.push({ t: 'val', v: null })
      else out.push({ t: 'id', v: m[0] })
    } else {
      const two = src.slice(i, i + 2)
      if (['&&', '||', '==', '!='].includes(two)) {
        out.push({ t: 'op', v: two })
        i += 2
      } else if ('!(),'.includes(ch)) {
        out.push({ t: 'op', v: ch })
        i++
      } else throw new Error(`unsupported character '${ch}' in: ${src}`)
    }
  }
  return out
}

const truthy = (v: Value): boolean =>
  !(v === null || v === false || v === '' || v === 0)

const looseEq = (a: Value, b: Value): boolean =>
  typeof a === 'string' && typeof b === 'string'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b

const str = (v: Value): string => (v === null ? '' : String(v))

function evaluate(src: string, ctx: Record<string, unknown>): Value {
  const toks = tokenize(src)
  let p = 0
  const isOp = (v: string) => toks[p]?.t === 'op' && toks[p]!.v === v
  const lookup = (dotted: string): Value => {
    let cur: unknown = ctx
    for (const part of dotted.split('.')) {
      if (cur === null || typeof cur !== 'object') return null
      cur = (cur as Record<string, unknown>)[part]
      if (cur === undefined) return null
    }
    return cur as Value
  }

  const parseOr = (): Value => {
    let l = parseAnd()
    while (isOp('||')) {
      p++
      const r = parseAnd()
      l = truthy(l) ? l : r
    }
    return l
  }
  const parseAnd = (): Value => {
    let l = parseEq()
    while (isOp('&&')) {
      p++
      const r = parseEq()
      l = truthy(l) ? r : l
    }
    return l
  }
  const parseEq = (): Value => {
    let l = parseUnary()
    while (isOp('==') || isOp('!=')) {
      const neg = toks[p++]!.v === '!='
      const r = parseUnary()
      l = neg ? !looseEq(l, r) : looseEq(l, r)
    }
    return l
  }
  const parseUnary = (): Value => {
    if (isOp('!')) {
      p++
      return !truthy(parseUnary())
    }
    return parsePrimary()
  }
  const parsePrimary = (): Value => {
    const tok = toks[p++]
    if (!tok) throw new Error(`unexpected end of: ${src}`)
    if (tok.t === 'val') return tok.v as Value
    if (tok.t === 'op' && tok.v === '(') {
      const v = parseOr()
      if (!isOp(')')) throw new Error(`expected ) in: ${src}`)
      p++
      return v
    }
    if (tok.t === 'id' && isOp('(')) {
      p++
      const args: Value[] = []
      if (!isOp(')')) {
        for (;;) {
          args.push(parseOr())
          if (isOp(',')) p++
          else break
        }
      }
      if (!isOp(')')) throw new Error(`expected ) in: ${src}`)
      p++
      if (tok.v !== 'format') throw new Error(`unsupported function ${tok.v}`)
      return str(args[0] ?? null).replace(/\{(\d+)\}/g, (_m, n: string) =>
        str(args[Number(n) + 1] ?? null)
      )
    }
    if (tok.t === 'id') return lookup(tok.v as string)
    throw new Error(`unexpected token ${String(tok.v)} in: ${src}`)
  }

  const v = parseOr()
  if (p !== toks.length) throw new Error(`trailing tokens in: ${src}`)
  return v
}

/** Evaluate a workflow field that is either a literal or `${{ expr }}`. */
function evalField(field: unknown, ctx: Record<string, unknown>): Value {
  if (typeof field === 'boolean' || typeof field === 'number') return field
  const s = String(field).trim()
  const whole = /^\$\{\{([\s\S]*)\}\}$/.exec(s)
  if (whole) return evaluate(whole[1]!, ctx)
  // Interpolated string: replace each ${{ }} segment.
  return s.replace(/\$\{\{([\s\S]*?)\}\}/g, (_m, e: string) =>
    str(evaluate(e, ctx))
  )
}

const group = (ctx: Record<string, unknown>) => evalField(conc()?.group, ctx)
const cancel = (ctx: Record<string, unknown>) =>
  truthy(evalField(conc()?.['cancel-in-progress'], ctx))

const prCtx = (
  action: string,
  runId: number,
  changes: Record<string, unknown> = {}
) => ({
  github: {
    event_name: 'pull_request',
    run_id: runId,
    event: { action, changes, pull_request: { number: 42 } },
  },
})

const pushCtx = (runId: number) => ({
  github: { event_name: 'push', run_id: runId, event: {} },
})

describe('ci.yml concurrency (#2607)', () => {
  it('declares a concurrency block', () => {
    expect(conc()).toBeDefined()
  })

  it('evaluator sanity: handles the operators the workflow uses', () => {
    const c = { a: { b: 'X', n: null } }
    expect(evaluate("a.b == 'x' && !a.n || 'z'", c)).toBe(true)
    expect(evaluate("a.n || format('{1}-{0}', 1, 'q')", c)).toBe('q-1')
    expect(evaluate("false && 'no' || ''", c)).toBe('')
  })

  describe('push to main', () => {
    it('gives two different pushes two different groups', () => {
      const g1 = group(pushCtx(1001))
      const g2 = group(pushCtx(1002))
      expect(g1).toBe('ci-run-1001')
      expect(g2).toBe('ci-run-1002')
      expect(g1).not.toBe(g2)
    })

    it('never cancels in progress', () => {
      expect(cancel(pushCtx(1001))).toBe(false)
    })
  })

  describe('workflow_call', () => {
    it('gets a per-run group and never cancels (literal event_name)', () => {
      const a = { github: { event_name: 'workflow_call', run_id: 7 } }
      const b = { github: { event_name: 'workflow_call', run_id: 8 } }
      expect(group(a)).toBe('ci-run-7')
      expect(group(a)).not.toBe(group(b))
      expect(cancel(a)).toBe(false)
    })
  })

  describe('pull_request synchronize', () => {
    it('shares one group per PR across pushes and cancels in progress', () => {
      expect(group(prCtx('synchronize', 11))).toBe('ci-pr-42')
      expect(group(prCtx('synchronize', 12))).toBe('ci-pr-42')
      expect(cancel(prCtx('synchronize', 11))).toBe(true)
    })

    it('opened and reopened use the per-PR group too', () => {
      expect(group(prCtx('opened', 13))).toBe('ci-pr-42')
      expect(group(prCtx('reopened', 14))).toBe('ci-pr-42')
    })
  })

  describe('pull_request edited', () => {
    it('isolates a body/title-only edit in a unique no-op group (#2204)', () => {
      const g1 = group(prCtx('edited', 21))
      const g2 = group(prCtx('edited', 22))
      expect(g1).toBe('ci-pr-42-noop-21')
      expect(g1).not.toBe(group(prCtx('synchronize', 20)))
      expect(g1).not.toBe(g2)
    })

    it('keeps a base change in the per-PR group so it supersedes (#2204)', () => {
      const ctx = prCtx('edited', 23, { base: { ref: { from: 'dev' } } })
      expect(group(ctx)).toBe('ci-pr-42')
      expect(cancel(ctx)).toBe(true)
    })
  })
})
