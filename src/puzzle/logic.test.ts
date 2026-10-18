import { describe, expect, it } from 'vitest'
import { sizeOf } from '../engine/size'
import { generate } from './generator'
import { MAX_TIER, solveLogically, TECHNIQUES } from './logic'

describe('solveLogically', () => {
  const size = sizeOf(3)

  it('rates a full grid at tier −1 and returns it unchanged', () => {
    const p = generate(3, 1)
    expect(solveLogically(size, p.solution)).toEqual({ solution: p.solution, tier: -1, used: {} })
  })

  it('refuses givens that clash', () => {
    const grid = new Array(81).fill(0)
    grid[0] = 5
    grid[1] = 5
    expect(solveLogically(size, grid).solution).toBeNull()
  })

  it('solves legacy singles puzzles to their solution with singles only', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = generate(3, seed)
      const r = solveLogically(size, p.givens)
      expect(r.solution, `seed ${seed}`).toEqual(p.solution)
      expect(r.tier).toBeLessThanOrEqual(1)
    }
  })

  it('never goes past the cap', () => {
    const p = generate(3, 7, 'expert')
    expect(solveLogically(size, p.givens, 2).solution).toBeNull()
    const r = solveLogically(size, p.givens, 3)
    expect(r.solution).toEqual(p.solution)
    expect(r.tier).toBe(3)
  })

  it('works on every board size', () => {
    for (const n of [2, 4]) {
      const p = generate(n, 3)
      expect(solveLogically(sizeOf(n), p.givens).solution, `n ${n}`).toEqual(p.solution)
    }
  })

  it('lists tiers in order, ending at MAX_TIER', () => {
    const tiers = TECHNIQUES.map(([, t]) => t)
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b))
    expect(tiers[tiers.length - 1]).toBe(MAX_TIER)
  })
})
