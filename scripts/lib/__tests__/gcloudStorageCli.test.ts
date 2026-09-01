/**
 * Workflow guard for the gsutil → `gcloud storage` migration (#1412).
 *
 * Google drops the bundled `gsutil` from the Cloud SDK in March 2027. Our
 * workflows provision the CLI with `setup-gcloud@v3` and never install `gsutil`
 * explicitly, so on the first run after the bundle drops EVERY `gsutil` call
 * becomes "command not found" at once. #1469 already showed the cost of trusting
 * `gsutil` on this pipeline: `cp -I` consumed only the first two stdin sources
 * and exited 0, shipping two public indexes covering 2 of 94 districts.
 *
 * This guard is sourced from the workflow YAML itself so it cannot drift from
 * the real steps. It pins the three things a mechanical rewrite gets wrong:
 *
 *   1. `gsutil` must not come back for cp/ls/cat/rm. `rsync` is the ONE
 *      deliberate exception (see ALLOWED_GSUTIL_SUBCOMMANDS).
 *   2. Bundled short flags DO NOT PARSE in `gcloud storage`. `cp -rZ` exits 2
 *      with a usage error where gsutil accepted it — verified against the real
 *      CLI (Google Cloud SDK 578.0.0). Short flags must be written separately.
 *   3. `-m` has no `gcloud storage` equivalent (parallelism is the default), so
 *      it must never survive on a migrated call.
 *
 * It also pins the CDN header contract #1380 established: the `-h "K:V"` form is
 * gsutil-only, so any surviving instance is an unmigrated upload, and the set of
 * published cache TTLs must not drift during a mechanical rewrite.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const WORKFLOW_DIR = path.resolve(process.cwd(), '.github/workflows')

/**
 * `rsync` stays on gsutil on purpose (#1412). `gcloud storage rsync` exists, but
 * its object-comparison defaults and `-x` exclude anchoring are not established
 * as identical, and the destructive call sites — the keep-only skeleton sync at
 * prune time, and staging→prod promotion — are exactly where a near-miss deletes
 * retained data. It moves in its own PR with per-call-site dry-run evidence.
 */
const ALLOWED_GSUTIL_SUBCOMMANDS = new Set(['rsync'])

interface Site {
  file: string
  n: number
  text: string
}

function workflowFiles(): string[] {
  return fs.readdirSync(WORKFLOW_DIR).filter(f => /\.ya?ml$/.test(f))
}

/** Non-comment workflow lines, so history in comments is not under test. */
function codeLines(): Site[] {
  const out: Site[] = []
  for (const file of workflowFiles()) {
    const src = fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf-8')
    src.split('\n').forEach((text, i) => {
      if (/^\s*#/.test(text)) return
      out.push({ file, n: i + 1, text })
    })
  }
  return out
}

/**
 * Every `gcloud storage` invocation, with backslash continuations joined, paired
 * with the flag tokens that precede its first positional argument. Flags after
 * the first positional (or after a pipe) belong to another command — `grep -oP`
 * downstream of a `gcloud storage ls` is not a gcloud flag.
 */
function gcloudInvocations(): Array<Site & { flags: string[] }> {
  const out: Array<Site & { flags: string[] }> = []
  for (const file of workflowFiles()) {
    const raw = fs
      .readFileSync(path.join(WORKFLOW_DIR, file), 'utf-8')
      .split('\n')
    for (let i = 0; i < raw.length; i++) {
      if (/^\s*#/.test(raw[i]!)) continue
      const start = raw[i]!.indexOf('gcloud storage ')
      if (start === -1) continue
      let text = raw[i]!.slice(start)
      let j = i
      while (/\\\s*$/.test(raw[j]!) && j + 1 < raw.length) {
        j++
        text += ' ' + raw[j]!.trim()
      }
      const tokens = text
        .replace(/\\/g, ' ')
        // `--cache-control="public, max-age=3600"` is ONE token: collapse the
        // spaces inside double quotes before splitting, or the walk below stops
        // at `max-age=3600"` and never reaches the flags that follow.
        .replace(/"[^"]*"/g, m => m.replace(/\s+/g, '\u00b7'))
        .split(/\s+/)
        .filter(Boolean)
      // tokens[0]='gcloud' tokens[1]='storage' tokens[2]=subcommand
      const flags: string[] = []
      for (const tok of tokens.slice(3)) {
        if (tok.startsWith('-')) flags.push(tok)
        else break
      }
      out.push({ file, n: i + 1, text, flags })
    }
  }
  return out
}

function render(sites: Site[]): string[] {
  return sites.map(s => `${s.file}:${s.n}: ${s.text.trim().slice(0, 100)}`)
}

describe('gsutil → gcloud storage migration guard (#1412)', () => {
  const lines = codeLines()
  const invocations = gcloudInvocations()

  it('is actually wired to the workflows', () => {
    expect(lines.length).toBeGreaterThan(100)
    expect(invocations.length).toBeGreaterThan(30)
  })

  it('no gsutil invocation survives except the deliberate rsync exception', () => {
    const hits = lines.filter(l => {
      const m = l.text.match(/(?<![\w./-])gsutil(?:\s+-[a-zA-Z]+)*\s+([a-z]+)/)
      return m !== null && !ALLOWED_GSUTIL_SUBCOMMANDS.has(m[1]!)
    })
    expect(render(hits)).toEqual([])
  })

  it('every surviving gsutil call is an rsync (nothing regresses back)', () => {
    for (const l of lines.filter(x => /(?<![\w./-])gsutil\b/.test(x.text))) {
      expect(l.text, `${l.file}:${l.n}`).toMatch(
        /gsutil(\s+-[a-zA-Z]+)*\s+rsync\b/
      )
    }
  })

  it('no gcloud storage call carries `-m` (no equivalent; parallel by default)', () => {
    const hits = invocations.filter(i => i.flags.includes('-m'))
    expect(render(hits)).toEqual([])
  })

  it('no gcloud storage call bundles short flags (`-rZ` exits 2; use `-r -Z`)', () => {
    const bundled = invocations.filter(i =>
      i.flags.some(f => /^-[a-zA-Z]{2,}$/.test(f))
    )
    expect(render(bundled)).toEqual([])
  })

  it('no gsutil-only `-h "Header:Value"` form survives (unmigrated upload)', () => {
    const hits = lines.filter(l => /(?<![\w-])-h\s+"[A-Za-z-]+:/.test(l.text))
    expect(render(hits)).toEqual([])
  })

  it('the #1380 CDN cache TTLs still reach every published object', () => {
    const pipeline = fs.readFileSync(
      path.join(WORKFLOW_DIR, 'data-pipeline.yml'),
      'utf-8'
    )
    const values = new Set(
      [...pipeline.matchAll(/--cache-control="([^"]+)"/g)].map(m => m[1]!)
    )
    // Exactly the four TTL profiles the pipeline published pre-migration.
    expect([...values].sort()).toEqual([
      'public, max-age=300',
      'public, max-age=3600',
      'public, max-age=3600, must-revalidate',
      'public, max-age=900',
    ])
  })

  it('every --cache-control upload also pins --content-type', () => {
    const pipeline = fs.readFileSync(
      path.join(WORKFLOW_DIR, 'data-pipeline.yml'),
      'utf-8'
    )
    const cacheControl = [...pipeline.matchAll(/--cache-control=/g)].length
    const contentType = [...pipeline.matchAll(/--content-type=/g)].length
    expect(cacheControl).toBeGreaterThan(0)
    expect(contentType).toBeGreaterThanOrEqual(cacheControl)
  })
})
