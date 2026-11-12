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

  it('quotes a cell containing a semicolon (European-locale separator)', () => {
    expect(one('a;b')).toBe('"a;b"')
    // Without quoting, a ;-separating Excel would split this into a new cell
    // that starts with `=`.
    expect(one('Foo;=1+1')).toBe('"Foo;=1+1"')
    expect(one('Foo;=HYPERLINK("http://evil","x")')).toBe(
      '"Foo;=HYPERLINK(""http://evil"",""x"")"'
    )
  })

  it('neutralises a DDE payload', () => {
    expect(one("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0")
  })

  it('neutralises and quotes a cell that starts with a line feed', () => {
    expect(one('\nfoo')).toBe('"\'\nfoo"')
  })

  it('leaves a leading-space formula unprefixed (intentional)', () => {
    // Spreadsheets do not evaluate a cell whose first character is a space,
    // so OWASP's leading-character list does not cover it.
    expect(one(' =1+1')).toBe(' =1+1')
  })

  it('leaves ordinary text and empty cells unchanged', () => {
    expect(arrayToCSV([['Plain Club', '', 'a-b', 'x=y']])).toBe(
      'Plain Club,,a-b,x=y'
    )
  })
})
