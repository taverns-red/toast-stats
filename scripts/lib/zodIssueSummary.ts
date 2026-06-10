/**
 * Bounded zod-issue summarization shared by the snapshot publish gate and
 * the CDN schema canary (#1125). Keeps alert/annotation text readable —
 * the first few issues tell the story.
 */

interface ZodIssueLike {
  path: PropertyKey[]
  message: string
}

const MAX_ZOD_ISSUES = 5

export function summarizeZodIssues(issues: ZodIssueLike[]): string {
  const detail = issues
    .slice(0, MAX_ZOD_ISSUES)
    .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
  const more =
    issues.length > MAX_ZOD_ISSUES
      ? ` (+${issues.length - MAX_ZOD_ISSUES} more issues)`
      : ''
  return `${detail}${more}`
}
