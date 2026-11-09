/* Stub for the red commit (#2584): signatures only, no behaviour yet. */
export type ConsentLevel = 'all' | 'minimal' | 'none'
export const CONSENT_COOKIE = 'rt_consent'
export const CONSENT_VERSION = 1
export interface ConsentState {
  level: ConsentLevel | null
  settingsOpen: boolean
}
export const buildConsentCookie = (
  _level: ConsentLevel,
  _hostname: string,
  _protocol: string
): string => ''
export const gaCookieExpiries = (
  _names: string[],
  _hostname: string
): string[] => []
export const getConsent = (): ConsentLevel | null => null
export const setConsent = (_level: ConsentLevel): void => {}
export const getConsentState = (): ConsentState => ({
  level: null,
  settingsOpen: false,
})
export const subscribeConsent =
  (_cb: () => void): (() => void) =>
  () => {}
export const openConsentSettings = (): void => {}
export const closeConsentSettings = (): void => {}
