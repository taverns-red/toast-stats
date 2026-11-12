/**
 * CSV/formula injection (#2687, OWASP). Free text from the source data
 * (club names, coach names) must not run as a formula in Excel or Sheets.
 */

import { describe, it, expect } from 'vitest'
import { arrayToCSV } from '../csvExport'

const one = (cell: string | number) => arrayToCSV([[cell]])

describe('arrayToCSV formula neutralisation (#2687)', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['+cmd', "'+cmd"],
    ['-x', "'-x"],
    ['\tfoo', "'\tfoo"],
  ])('prefixes %j with a single quote', (input, expected) => {
    expect(one(input)).toBe(expected)
  })

  it('prefixes and quotes a formula that also contains a comma', () => {
    expect(one('=HYPERLINK("http://x","y")')).toBe(
      '"\'=HYPERLINK(""http://x"",""y"")"'
    )
  })

  it('neutralises a value starting with a carriage return and quotes it', () => {
    expect(one('\rfoo')).toBe('"\'\rfoo"')
  })

  it('quotes a name containing a carriage return', () => {
    expect(one('Jane\rDoe')).toBe('"Jane\rDoe"')
  })

  it('still doubles an embedded quote', () => {
    expect(one('say "hi"')).toBe('"say ""hi"""')
  })

  it('keeps negative numbers numeric and unprefixed', () => {
    expect(arrayToCSV([[-3, -0.5, 0, 7]])).toBe('-3,-0.5,0,7')
  })

  it('treats a strict numeric string as a number', () => {
    expect(arrayToCSV([['-3', '-0.5', '12']])).toBe('-3,-0.5,12')
  })

  it('still neutralises a non-numeric string that merely starts with a digit sign', () => {
    expect(one('-3 clubs')).toBe("'-3 clubs")
    expect(one('+5')).toBe("'+5")
  })

  it('leaves ordinary text and empty cells unchanged', () => {
    expect(arrayToCSV([['Plain Club', '', 'a-b', 'x=y']])).toBe(
      'Plain Club,,a-b,x=y'
    )
  })
})
