import { describe, expect, it } from 'vitest'
import { BOX_SIZES, sizeOf, symbolOf, valueOf } from './size'

describe('sizeOf', () => {
  for (const n of BOX_SIZES) {
    it(`builds an ${n * n}×${n * n} board with ${3 * n * n} units of ${n * n} cells`, () => {
      const s = sizeOf(n)
      expect(s.N).toBe(n * n)
      expect(s.cells).toBe(n ** 4)
      expect(s.units).toHaveLength(3 * s.N)
      for (const u of s.units) expect(new Set(u).size).toBe(s.N)
      // Each cell sees its row and column (2·(N-1)) plus the box cells outside both ((n-1)²).
      for (const p of s.peers) expect(p.length).toBe(2 * (s.N - 1) + (n - 1) ** 2)
    })
  }

  it('rejects an unsupported box size', () => {
    expect(() => sizeOf(6)).toThrow()
  })
})

describe('symbols', () => {
  it('shows 1–9 then letters', () => {
    expect([1, 9, 10, 16, 25].map(symbolOf)).toEqual(['1', '9', 'A', 'G', 'P'])
  })

  it('reads keys only within the board', () => {
    expect(valueOf('5', 4)).toBe(0)
    expect(valueOf('4', 4)).toBe(4)
    expect(valueOf('a', 16)).toBe(10)
    expect(valueOf('G', 16)).toBe(16)
    expect(valueOf('H', 16)).toBe(0)
    expect(valueOf('A', 9)).toBe(0)
    expect(valueOf('0', 9)).toBe(0)
    expect(valueOf('Enter', 9)).toBe(0)
  })
})
