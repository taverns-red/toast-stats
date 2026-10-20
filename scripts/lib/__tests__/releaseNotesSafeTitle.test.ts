import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findReleaseNotesHazards } from '../releaseNotesSafeTitle'

// #2185: release-please decodes `&lt;date&gt;` back to `<date>` and re-parses
// the release notes as HTML, so a tag-like `<x` in a squash subject swallows
// every later component's <details> block. Real subjects that did this:
// #2117, #2124, #2013, #1822.
describe('findReleaseNotesHazards (#2185)', () => {
  it.each([
    [
      'feat(pipeline): snapshots/<date>/reports-rollups.json — rollups (#2012)',
      ['<date>'],
    ],
    ['feat(pipeline): run manifest runs/<run_id>/written.jsonl', ['<run_id>']],
    ['docs: close </details> early', ['</details>']],
    ['chore: <!-- hidden', ['<!--']],
    ['feat: <a> and <b>', ['<a>', '<b>']],
    ['feat: unclosed <date in a title', ['<date']],
  ])('flags %s', (title, expected) => {
    expect(findReleaseNotesHazards(title)).toEqual(expected)
  })

  it.each([
    'fix(fonts): CLS 0.141 -> 0.002 at 375px (#1373)',
    'fix: a < b when b <= 3',
    'feat: we <3 clubs',
    'feat(pipeline): snapshots/{date}/region-rollups.json (#1799)',
    'fix: plain title with no brackets',
  ])('allows %s', title => {
    expect(findReleaseNotesHazards(title)).toEqual([])
  })
})

describe('ci-gate.yml wiring (#2185)', () => {
  const repoRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..'
  )
  const src = readFileSync(
    join(repoRoot, '.github', 'workflows', 'ci-gate.yml'),
    'utf8'
  )

  it('re-runs when the PR title is edited', () => {
    expect(src).toMatch(/types:\s*\[opened, synchronize, reopened, edited\]/)
  })

  it('passes the title through env, never inline in the script', () => {
    expect(src).toContain('PR_TITLE: ${{ github.event.pull_request.title }}')
    expect(src).toContain('scripts/check-pr-title.ts')
    expect(src).not.toMatch(/run:[^\n]*github\.event\.pull_request\.title/)
  })
})
