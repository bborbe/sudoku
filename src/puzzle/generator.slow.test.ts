// Slow tier (release.yml, nightly.yml): wider seed sweeps at the large board sizes.
import { describe, expect, it } from 'vitest'
import { sizeOf } from '../engine/size'
import { clueRange, generate } from './generator'
import { countSolutions, solveBySingles } from './solver'

describe('generate (slow)', () => {
  it('16×16: 500 seeds, each with exactly one solution', () => {
    const size = sizeOf(4)
    const range = clueRange(4)
    for (let seed = 1; seed <= 500; seed++) {
      const p = generate(4, seed)
      expect(p.clues).toBeGreaterThanOrEqual(range.min)
      expect(p.clues).toBeLessThanOrEqual(range.max)
      expect(countSolutions(size, p.givens, 2).count, `seed ${seed}`).toBe(1)
    }
  }, 300_000)

  it('25×25: 100 seeds, each solvable by singles to its solution and in range', () => {
    const size = sizeOf(5)
    const range = clueRange(5)
    for (let seed = 1; seed <= 100; seed++) {
      const p = generate(5, seed)
      expect(p.clues).toBeGreaterThanOrEqual(range.min)
      expect(p.clues).toBeLessThanOrEqual(range.max)
      expect(solveBySingles(size, p.givens), `seed ${seed}`).toEqual(p.solution)
    }
  }, 300_000)
})
