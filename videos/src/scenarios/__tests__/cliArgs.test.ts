import { describe, expect, it } from 'vitest'
import { outputName, parseCliArgs } from '../cliArgs'

// `npm run videos:build -- v2 --format mobile` → process.argv.slice(2)
describe('parseCliArgs', () => {
  it('defaults to desktop', () => {
    expect(parseCliArgs(['v2'])).toEqual({ id: 'v2', format: 'desktop' })
  })

  it('reads --format mobile and --format=mobile, before or after the id', () => {
    const want = { id: 'v2', format: 'mobile' }
    expect(parseCliArgs(['v2', '--format', 'mobile'])).toEqual(want)
    expect(parseCliArgs(['v2', '--format=mobile'])).toEqual(want)
    expect(parseCliArgs(['--format', 'mobile', 'v2'])).toEqual(want)
  })

  it('rejects an unknown format, naming the known ones', () => {
    expect(() => parseCliArgs(['v2', '--format', 'tablet'])).toThrow(
      /Unknown format "tablet".*desktop, mobile/
    )
  })

  it('requires a scenario id', () => {
    expect(() => parseCliArgs(['--format', 'mobile'])).toThrow(/Usage/)
    expect(() => parseCliArgs([])).toThrow(/Usage/)
  })

  it('rejects --format with no value', () => {
    expect(() => parseCliArgs(['v2', '--format'])).toThrow(/Unknown format ""/)
  })
})

describe('outputName', () => {
  it('keeps the plain id for desktop and suffixes other formats', () => {
    expect(outputName('v2', 'desktop')).toBe('v2')
    expect(outputName('v2', 'mobile')).toBe('v2-mobile')
  })
})
