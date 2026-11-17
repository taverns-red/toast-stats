// THROWAWAY canary for #2857: uses an API Node 22 lacks (RegExp.escape, V8
// 13.6 / Node 24+). Removed in the next commit.
import { describe, it, expect } from 'vitest'

describe('node22 canary', () => {
  it('escapes with an API only newer Node has', () => {
    expect(RegExp.escape('a.b')).toBe('\\x61\\.b')
  })
})
