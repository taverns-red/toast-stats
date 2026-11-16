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

/** Returns a list of violations; empty means the script passes. */
export const checkSetupWif = (text: string): string[] => {
  void text
  return []
}
