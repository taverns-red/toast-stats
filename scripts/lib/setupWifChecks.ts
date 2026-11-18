/**
 * #2872 (B0), tightened in #3025: static checks over scripts/setup-wif.sh.
 * Pure functions over the script text so tests can prove each check catches a
 * bypass fixture.
 *
 * Since #2872 B1-B7, every workflow job authenticates as its own per-job
 * identity (scripts/lib/gcpIdentityMap.ts). The script sets up only the WIF
 * pool and provider. It creates no service account and grants no role.
 */

/** Script text with whole-line comments removed. */
export const stripComments = (text: string): string =>
  text
    .split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')

/** Patterns that create an identity or grant access. Each must be absent. */
const FORBIDDEN: Array<[string, RegExp]> = [
  ['service account creation', /service-accounts\s+create/],
  ['IAM binding', /add-iam-policy-binding/],
  ['IAM policy replace', /set-iam-policy/],
  ['role literal', /roles\//],
  ['workloadIdentityUser', /workloadIdentityUser/i],
  ['principalSet member', /principalSet:/],
  ['service account member', /serviceAccount:/],
  ['shared deploy account name', /toast-stats-deployer|SA_NAME|SA_EMAIL/],
  ['deploy secret output', /GCP_SERVICE_ACCOUNT/],
  ['project role path', /projects\/[^\s"']*\/roles\//],
  ['sourced file', /^\s*(source|\.)\s/m],
  ['eval', /\beval\b/],
  ['shell invocation', /^\s*(bash|sh|zsh)\s+\S/m],
  ['other script invocation', /(^|[\s;&|(])(\.\/|scripts\/)[\w./-]+/],
]

/** Returns a list of violations; empty means the script passes. */
export const checkSetupWif = (text: string): string[] => {
  const code = stripComments(text)
  const out: string[] = []

  for (const [name, pattern] of FORBIDDEN) {
    if (pattern.test(code)) out.push(name)
  }

  // The script must not default to the production project: the caller names
  // the project explicitly.
  if (!/PROJECT_ID="\$\{PROJECT_ID:\?[^}]*\}"/.test(code)) {
    out.push('PROJECT_ID must be required, with no default')
  }

  return out
}
