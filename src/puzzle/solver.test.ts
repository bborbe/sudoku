import { describe, expect, it } from 'vitest'
import { sizeOf } from '../engine/size'
import { countSolutions, solveBySingles } from './solver'

// A well-known 9×9 puzzle with exactly one solution.
const PUZZLE = [
  5, 3, 0, 0, 7, 0, 0, 0, 0, 6, 0, 0, 1, 9, 5, 0, 0, 0, 0, 9, 8, 0, 0, 0, 0, 6, 0, 8, 0, 0, 0, 6, 0, 0, 0, 3, 4, 0, 0, 8, 0,
  3, 0, 0, 1, 7, 0, 0, 0, 2, 0, 0, 0, 6, 0, 6, 0, 0, 0, 0, 2, 8, 0, 0, 0, 0, 4, 1, 9, 0, 0, 5, 0, 0, 0, 0, 8, 0, 0, 7, 9,
]

describe('countSolutions', () => {
  const s9 = sizeOf(3)

  it('finds the single solution of a proper puzzle', () => {
    const r = countSolutions(s9, PUZZLE, 2)
    expect(r.count).toBe(1)
    expect(r.first!.slice(0, 9)).toEqual([5, 3, 4, 6, 7, 8, 9, 1, 2])
  })

  it('reports several solutions for an under-constrained grid', () => {
    expect(countSolutions(s9, new Array(81).fill(0), 2).count).toBe(2)
    expect(countSolutions(sizeOf(2), new Array(16).fill(0), 1000).count).toBe(288)
  })

  it('reports none when givens clash', () => {
    const bad = PUZZLE.slice()
    bad[2] = 5
    expect(countSolutions(s9, bad, 2).count).toBe(0)
  })
})

describe('solveBySingles', () => {
  it('solves an easy puzzle to the same unique solution', () => {
    const s9 = sizeOf(3)
    expect(solveBySingles(s9, PUZZLE)).toEqual(countSolutions(s9, PUZZLE, 1).first)
  })

  it('gives up on a grid that needs guessing', () => {
    expect(solveBySingles(sizeOf(3), new Array(81).fill(0))).toBeNull()
  })
})
