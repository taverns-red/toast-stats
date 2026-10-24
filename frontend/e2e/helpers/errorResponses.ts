/* Error-response logging for the smokes (#2248).
 *
 * One line per response with status >= 400: `status host/path`. The query
 * string and hash are dropped, because they can carry personal data. The
 * host stays: it tells a preview-channel 404 apart from a CDN one.
 */
export function describeErrorResponse(
  url: string,
  status: number
): string | null {
  if (status < 400) return null
  try {
    const u = new URL(url)
    return `${status} ${u.host}${u.pathname}`
  } catch {
    return `${status} (unparseable URL)`
  }
}
