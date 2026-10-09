/**
 * Guard: nothing under `scripts/` may pair a deleting rsync with the
 * production bucket (#1709, plan item S1-6).
 *
 * `rebuild-all.sh` and `rebuild-analytics.ts` used to finish by printing an
 * operator hint to run
 *   gcloud storage rsync -r <delete-unmatched flag> ./cache/snapshots <prod>
 * That is a destructive mirror of a local cache onto prod: any snapshot date
 * missing locally is deleted from the bucket the frontend reads. Prod is only
 * ever written by the gated promotion in data-pipeline.yml, which is additive
 * by design (see gcloudStorageCli.test.ts). A copy-paste hint must not offer a
 * way around that.
 *
 * The pattern is assembled at runtime so this file does not match itself.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SCRIPTS_DIR = path.resolve(process.cwd(), 'scripts')
const DELETE_FLAG = ['--delete', 'unmatched', 'destination', 'objects'].join(
  '-'
)
const PROD_BUCKET = ['toast', 'stats', 'data', 'ca'].join('-')
const SKIP_DIRS = new Set(['node_modules', 'dist', 'fixtures'])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

/** Source lines with shell `\` continuations joined, so a split command still counts. */
function logicalLines(src: string): { n: number; text: string }[] {
  const out: { n: number; text: string }[] = []
  let buf = ''
  let start = 0
  src.split('\n').forEach((line, i) => {
    if (buf === '') start = i + 1
    if (/\\\s*$/.test(line)) {
      buf += line.replace(/\\\s*$/, ' ')
      return
    }
    out.push({ n: start, text: buf + line })
    buf = ''
  })
  if (buf !== '') out.push({ n: start, text: buf })
  return out
}

describe('no deleting rsync aimed at the production bucket in scripts/ (#1709)', () => {
  it('no line pairs the delete flag with the prod bucket', () => {
    const hits: string[] = []
    for (const file of walk(SCRIPTS_DIR)) {
      const src = fs.readFileSync(file, 'utf-8')
      for (const { n, text } of logicalLines(src)) {
        if (text.includes(DELETE_FLAG) && text.includes(PROD_BUCKET)) {
          hits.push(`${path.relative(process.cwd(), file)}:${n}`)
        }
      }
    }
    expect(hits).toEqual([])
  })
})
