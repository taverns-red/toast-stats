/**
 * Read-only guard for the harness staging canary (#1768, ADR-015 D10).
 *
 * The canary runs the real gcloud against the staging bucket. This module
 * scans the text of its workflow and script for every gcloud/gsutil command
 * and reports any that could write: the contract test in
 * `__tests__/harnessStagingCanary.test.ts` requires none.
 */

export const STAGING_BUCKET = 'toast-stats-data-staging'
export const PROD_BUCKET = 'toast-stats-data-ca'

/** `gcloud storage` subcommands that only read. */
const READ_SUBCOMMANDS = new Set([
  'ls',
  'cat',
  'objects describe',
  'objects list',
])

/** Every gcloud or gsutil command line in a shell text, comments dropped. */
export function gcloudInvocations(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.replace(/(^|\s)#.*$/, '').trim())
    .filter(l => /(^|[\s;&|(`$])(gcloud|gsutil)(\s|$)/.test(l))
}

/** Unquote a shell word. */
const unquote = (w: string) => w.replace(/^["']|["']$/g, '')

/** True if a shell word may name a bucket object (a gs:// URL or a variable). */
const mayBeRemote = (w: string) => /gs:\/\/|\$/.test(unquote(w))

/** True if a shell word is a local path under the runner's temp dir. */
const isLocalTemp = (w: string) => /^\$\{?(TMP|RUNNER_TEMP)\b/.test(unquote(w))

/**
 * The commands in `text` that are not reads, each with the reason.
 * Allowed: `gcloud version`, `gcloud storage ls|cat|objects describe|objects
 * list`, and `gcloud storage cp <one object> <a local temp path>` (a
 * download; no flags, so no `-r`).
 */
export function writeViolations(text: string): string[] {
  const out: string[] = []
  for (const line of gcloudInvocations(text)) {
    const m = line.match(/(?:^|[\s;&|(`$])(gcloud|gsutil)\s+(.*)$/)
    const tool = m?.[1]
    const args = (m?.[2] ?? '').split(/\s+/)
    if (tool === 'gsutil') {
      out.push(`${line}: gsutil is not allowed`)
      continue
    }
    if (args[0] === 'version' && args.length === 1) continue
    if (args[0] !== 'storage') {
      out.push(`${line}: only "gcloud storage" reads are allowed`)
      continue
    }
    const one = args[1] ?? ''
    const two = `${one} ${args[2] ?? ''}`
    if (READ_SUBCOMMANDS.has(one) || READ_SUBCOMMANDS.has(two)) continue
    if (one === 'cp') {
      const words = args.slice(2).filter(w => !/^[<>]|^\d?>/.test(w))
      if (words.some(w => w.startsWith('-'))) {
        out.push(`${line}: cp takes no flags here`)
      } else if (words.length !== 2) {
        out.push(`${line}: cp must copy one object to one local file`)
      } else if (
        !isLocalTemp(words[1]!) ||
        mayBeRemote(words[1]!.replace(/^["']?\$\{?(TMP|RUNNER_TEMP)\}?/, ''))
      ) {
        out.push(`${line}: cp destination must be a local temp path`)
      }
      continue
    }
    out.push(`${line}: "gcloud storage ${one}" may write`)
  }
  return out
}
