import { expect, type Page } from '@playwright/test'

/* #3100 (M2) — "What it takes" prints Toastmasters International's published
 * reinstatement contact: renewals@toastmasters.org and +1 720-439-5050. They
 * are TI's own office, not a person, so the growth pages' privacy checks
 * (no email, no phone) allow exactly these two and nothing else. */

export const TI_RENEWALS_EMAIL = 'renewals@toastmasters.org'
export const TI_RENEWALS_PHONE = '+1 720-439-5050'

/** The page text with TI's renewals contact taken out, for privacy checks. */
export function withoutTiRenewalsContact(text: string): string {
  return text
    .split(TI_RENEWALS_EMAIL)
    .join('')
    .split(TI_RENEWALS_PHONE)
    .join('')
}

/** The mailto and tel links exist once each and are at least 44px tall. */
export async function assertTiRenewalsLinks(page: Page): Promise<void> {
  const steps = page.getByTestId('growth-reinstate-requirements')
  const links = [
    steps.locator('a[href="mailto:renewals@toastmasters.org"]'),
    steps.locator('a[href="tel:+17204395050"]'),
  ]
  for (const link of links) {
    await expect(link).toHaveCount(1)
    const box = await link.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
}
