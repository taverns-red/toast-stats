/**
 * `agent-cli preview-url <pr>` (#2418): the PR's Firebase preview channel
 * URL, read from the sticky comment `pr-preview.yml` posts via
 * marocchino/sticky-pull-request-comment (header `pr-preview`). Read-only.
 */
import { runGhJson, type Runner } from './exec.js'

/** The marker marocchino/sticky-pull-request-comment appends for header `pr-preview`. */
export const PREVIEW_MARKER = '<!-- Sticky Pull Request Commentpr-preview -->'

export interface IssueComment {
  id: number
  html_url: string
  created_at: string
  updated_at: string
  body: string
  user?: { login: string }
}

export interface PreviewInfo {
  pr: number
  url: string
  expires: string | null
  expired: boolean
  updatedAt: string
  commentUrl: string
}

export function parsePreviewComment(
  body: string
): { url: string; expires: string | null } | null {
  const url = body.match(/\*\*Live URL:\*\*\s+(https:\/\/\S+)/)
  if (!url) return null
  const expires = body.match(/Channel expires:\s*([0-9T:.\-+Z]+)/)
  return { url: url[1], expires: expires ? expires[1] : null }
}

export function findPreview(
  pages: IssueComment[][] | IssueComment[],
  pr: number,
  now: number
): PreviewInfo | null {
  const comments = (pages as Array<IssueComment | IssueComment[]>).flat()
  const sticky = comments
    .filter(
      c =>
        c.body?.includes(PREVIEW_MARKER) || c.body?.includes('Preview deployed')
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  for (const c of sticky) {
    const p = parsePreviewComment(c.body)
    if (!p) continue
    const exp = p.expires ? Date.parse(p.expires) : NaN
    return {
      pr,
      url: p.url,
      expires: p.expires,
      expired: !Number.isNaN(exp) && exp <= now,
      updatedAt: c.updated_at,
      commentUrl: c.html_url,
    }
  }
  return null
}

export interface PreviewUrlOptions {
  repo: string
  runner: Runner
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export async function previewUrl(
  pr: number,
  opts: PreviewUrlOptions
): Promise<PreviewInfo | null> {
  const pages = await runGhJson<IssueComment[][]>(
    [
      'api',
      '--paginate',
      '--slurp',
      `repos/${opts.repo}/issues/${pr}/comments?per_page=100`,
    ],
    { runner: opts.runner, sleep: opts.sleep }
  )
  return findPreview(pages, pr, (opts.now ?? Date.now)())
}

export function formatPreview(p: PreviewInfo): string {
  const exp = p.expires
    ? ` (expires ${p.expires}${p.expired ? ', EXPIRED' : ''})`
    : ''
  return `${p.url}${exp}`
}
