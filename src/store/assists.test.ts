import { describe, expect, it } from 'vitest'
import { ASSIST_DEFAULTS, ASSISTS, decodeOverrides, encodeOverrides, resolveAssists, validOverrides } from './assists'

describe('assists', () => {
  it('defaults follow the level table', () => {
    expect(ASSIST_DEFAULTS.easy.strict).toBe(true)
    expect(ASSIST_DEFAULTS.medium.strict).toBe(false)
    expect(ASSIST_DEFAULTS.medium.sameDigit).toBe(true)
    for (const level of ['hard', 'expert', 'master', 'extreme'] as const) {
      expect(ASSIST_DEFAULTS[level]).toMatchObject({ sameDigit: false, cleanNotes: false, strict: false, hints: true, related: true, conflicts: true, timer: true })
    }
  })

  it('an override wins over every level default', () => {
    const o = { sameDigit: true, hints: false }
    for (const level of ['easy', 'medium', 'hard', 'extreme'] as const) expect(resolveAssists(level, o)).toMatchObject(o)
    expect(resolveAssists('hard', o).cleanNotes).toBe(false)
    expect(resolveAssists('easy', o).cleanNotes).toBe(true)
  })

  it('validOverrides keeps known boolean entries only', () => {
    expect(validOverrides({ hints: false, timer: 'no', foo: true })).toEqual({ hints: false })
    expect(validOverrides(null)).toEqual({})
    expect(validOverrides(3)).toEqual({})
  })

  it('encodes and decodes the URL form', () => {
    expect(encodeOverrides({})).toBe('')
    expect(encodeOverrides({ timer: true, hints: false })).toBe('h0t1')
    expect(decodeOverrides('h0t1')).toEqual({ hints: false, timer: true })
    expect(decodeOverrides('')).toEqual({})
    const all = Object.fromEntries(ASSISTS.map((a, i) => [a, i % 2 === 0]))
    expect(decodeOverrides(encodeOverrides(all))).toEqual(all)
  })

  it('rejects malformed URL text', () => {
    for (const bad of ['h', 'h2', 'x1', 'H0', 'h0t', 'h0 t1']) expect(decodeOverrides(bad)).toBeNull()
  })
})
