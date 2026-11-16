/**
 * #2872 (B0): static checks over scripts/setup-wif.sh. Pure functions over the
 * script text so tests can prove each check catches a bypass fixture.
 */

export const ALLOWED_ROLES = [
  'roles/storage.admin',
  'roles/firebasehosting.admin',
  'roles/serviceusage.serviceUsageConsumer',
]
export const WIF_BINDING_ROLE = 'roles/iam.workloadIdentityUser'

/** Script text with whole-line comments removed. */
export const stripComments = (text: string): string =>
  text
    .split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')

const ROLES_BLOCK = /^ROLES=\(([\s\S]*?)\)/m
const QUOTED_ROLE = /^"(roles\/[A-Za-z0-9_.]+)"$/
const QUOTED_ROLE_G = /"(roles\/[A-Za-z0-9_.]+)"/g

/** Returns a list of violations; empty means the script passes. */
export const checkSetupWif = (text: string): string[] => {
  const code = stripComments(text)
  const out: string[] = []

  // 1. ROLES block: every token must be a fully quoted literal, and the
  // captured list must equal the allow list. Unquoted or concatenated
  // entries fail the token pattern.
  const block = ROLES_BLOCK.exec(code)
  if (!block) {
    out.push('ROLES=( ... ) block not found')
  } else {
    const tokens = block[1].split(/\s+/).filter(Boolean)
    const bad = tokens.filter(t => !QUOTED_ROLE.test(t))
    if (bad.length > 0) out.push(`ROLES entries not plain quoted: ${bad}`)
    const roles = tokens.map(t => QUOTED_ROLE.exec(t)?.[1])
    if (JSON.stringify(roles) !== JSON.stringify(ALLOWED_ROLES)) {
      out.push(`ROLES differs from allow list: ${roles}`)
    }
  }

  // 2. Every `roles/` occurrence is a full quoted literal, and outside the
  // block the only literal is the WIF binding role.
  const occurrences = (code.match(/roles\//g) ?? []).length
  const literals = [...code.matchAll(QUOTED_ROLE_G)]
  if (occurrences !== literals.length) {
    out.push('a roles/ occurrence is not a plain quoted literal')
  }
  const outside = code.replace(ROLES_BLOCK, '')
  const stray = [...outside.matchAll(QUOTED_ROLE_G)]
    .map(m => m[1])
    .filter(r => r !== WIF_BINDING_ROLE)
  if (stray.length > 0) out.push(`unexpected role outside ROLES: ${stray}`)

  // 3. Exactly two bindings: the ROLES loop (--role="${ROLE}") and the WIF
  // binding (--role="<WIF role>").
  const bindings = (code.match(/add-iam-policy-binding/g) ?? []).length
  if (bindings !== 2) out.push(`add-iam-policy-binding count is ${bindings}`)
  const roleFlags = [...code.matchAll(/--role=(\S+?)(?=\s|\\|$)/gm)]
    .map(m => m[1])
    .sort()
  const expectedFlags = ['"${ROLE}"', `"${WIF_BINDING_ROLE}"`].sort()
  if (JSON.stringify(roleFlags) !== JSON.stringify(expectedFlags)) {
    out.push(`--role flags differ: ${roleFlags}`)
  }

  // 4. No other route to grant roles or run other code.
  if (/set-iam-policy/.test(code)) out.push('set-iam-policy')
  if (/projects\/[^\s"']*\/roles\//.test(code)) out.push('project role path')
  if (/^\s*(source|\.)\s/m.test(code)) out.push('sourced file')
  if (/\beval\b/.test(code)) out.push('eval')
  if (/^\s*(bash|sh|zsh)\s+\S/m.test(code)) out.push('shell invocation')
  if (/(^|[\s;&|(])(\.\/|scripts\/)[\w./-]+/.test(code)) {
    out.push('other script invocation')
  }

  return out
}
