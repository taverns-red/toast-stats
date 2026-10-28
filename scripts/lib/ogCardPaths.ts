/**
 * Where the per-district share cards live (#2304). Its own module, free of
 * the analytics-core import ogCards.ts needs, so the scoped promoter
 * (manifestPromotion.ts) can classify the paths in jobs that build only
 * shared-contracts.
 */

export const OG_PREFIX = 'og/'
export const OG_DISTRICT_PREFIX = 'og/v1/district/'

/** `og/v1/district/<id>.png`, the id a short alphanumeric. */
const OG_DISTRICT_CARD = /^og\/v1\/district\/[A-Za-z0-9]{1,8}\.png$/

export function isOgDistrictCardPath(path: string): boolean {
  return OG_DISTRICT_CARD.test(path)
}
