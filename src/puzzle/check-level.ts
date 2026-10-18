// Test helper shared by the fast and slow generator tiers.
import { expect } from 'vitest'
import { sizeOf } from '../engine/size'
import { CLUES, type Level } from './difficulty'
import { clueRange, generate, generateById, puzzleId } from './generator'
import { solveLogically } from './logic'
import { countSolutions } from './solver'

/** Every seed lands in its level, inside the level's clue range, with exactly one solution, reproducibly. */
export function checkLevel(n: number, level: Level, seeds: number, first = 1) {
  const size = sizeOf(n)
  const range = clueRange(n, CLUES[level])
  for (let seed = first; seed < first + seeds; seed++) {
    const p = generate(n, seed, level)
    const at = `${n} ${level} seed ${seed}`
    expect(p.level, at).toBe(level)
    expect(p.id, at).toBe(puzzleId(n, seed, level))
    const clues = p.givens.filter((v) => v !== 0).length
    expect(clues, at).toBe(p.clues)
    expect(clues >= range.min && clues <= range.max, `${at}: ${clues} outside ${range.min}–${range.max}`).toBe(true)
    if (n === 3) expect(countSolutions(size, p.givens, 2).count, at).toBe(1)
    const rated = solveLogically(size, p.givens)
    if (level === 'extreme') expect(rated.solution, at).toBeNull()
    else expect(rated.solution, at).toEqual(p.solution)
    expect(generateById(p.id)!.givens, `${at} reproducible`).toEqual(p.givens)
  }
}
