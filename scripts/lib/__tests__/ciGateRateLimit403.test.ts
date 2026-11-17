import { describe, it, expect } from 'vitest'
import { isRateLimit403 } from '../ciGateWait'

// #2887: tell a rate-limit 403 (retry) from a permission 403 (fail).
describe('isRateLimit403', () => {
  it('is true when x-ratelimit-remaining is 0', () => {
    const h = new Headers({ 'x-ratelimit-remaining': '0' })
    expect(isRateLimit403(403, h, '')).toBe(true)
  })
  it('is true when retry-after is present', () => {
    const h = new Headers({ 'retry-after': '60' })
    expect(isRateLimit403(403, h, '')).toBe(true)
  })
  it('is true for the secondary rate limit body', () => {
    const body =
      '{"message":"You have exceeded a secondary rate limit. Please wait."}'
    expect(isRateLimit403(403, new Headers(), body)).toBe(true)
  })
  it('is false for a plain permission 403', () => {
    const body = '{"message":"Resource not accessible by integration"}'
    const h = new Headers({ 'x-ratelimit-remaining': '4999' })
    expect(isRateLimit403(403, h, body)).toBe(false)
  })
  it('is false for any status other than 403', () => {
    const h = new Headers({ 'x-ratelimit-remaining': '0' })
    expect(isRateLimit403(404, h, '')).toBe(false)
  })
})
