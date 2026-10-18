import { describe, expect, it } from 'vitest'
import { sizeOf } from '../engine/size'
import { checkLevel } from './check-level'
import { levelsFor } from './difficulty'
import { clueRange, generate, generateById, parsePuzzleId, puzzleId } from './generator'
import { countSolutions } from './solver'

function checkSeeds(n: number, seeds: number) {
  const size = sizeOf(n)
  const range = clueRange(n)
  for (let seed = 1; seed <= seeds; seed++) {
    const p = generate(n, seed)
    const clues = p.givens.filter((v) => v !== 0).length
    expect(clues, `seed ${seed} clues`).toBe(p.clues)
    expect(clues >= range.min && clues <= range.max, `seed ${seed}: ${clues} outside ${range.min}–${range.max}`).toBe(true)
    const result = countSolutions(size, p.givens, 2)
    expect(result.count, `seed ${seed} solution count`).toBe(1)
    expect(result.first, `seed ${seed} solution`).toEqual(p.solution)
    p.givens.forEach((v, i) => {
      if (v) expect(v).toBe(p.solution[i])
    })
    const again = generateById(p.id)!
    expect(again.givens, `seed ${seed} reproducible`).toEqual(p.givens)
    expect(again.solution).toEqual(p.solution)
  }
}

describe('generate at a level', () => {
  for (const level of levelsFor(3)) it(`9×9 ${level}: 10 seeds`, () => checkLevel(3, level, 10), 30_000)
  it('4×4 easy: 200 seeds', () => checkLevel(2, 'easy', 200))
  it('16×16 easy…hard: 1 seed each', () => {
    for (const level of levelsFor(4)) checkLevel(4, level, 1)
  }, 30_000)

  it('falls back to the hardest level a board size offers', () => {
    expect(generate(2, 5, 'master').id).toBe('2-easy-5')
    expect(generate(4, 5, 'extreme').level).toBe('hard')
  })

  it('rates legacy puzzles too', () => {
    expect(['easy', 'medium']).toContain(generate(3, 1).level)
  })
})

describe('clueRange', () => {
  it('scales the medium range by cell count', () => {
    expect(clueRange(2)).toEqual({ min: 7, max: 7 })
    expect(clueRange(3)).toEqual({ min: 32, max: 37 })
    expect(clueRange(4)).toEqual({ min: 102, max: 116 })
    expect(clueRange(5)).toEqual({ min: 247, max: 285 })
  })
})

describe('puzzle IDs', () => {
  it('round-trip box size and seed', () => {
    expect(parsePuzzleId(puzzleId(3, 0xffffffff))).toEqual({ n: 3, seed: 0xffffffff })
    expect(parsePuzzleId(puzzleId(5, 0))).toEqual({ n: 5, seed: 0 })
    expect(parsePuzzleId(puzzleId(3, 42, 'expert'))).toEqual({ n: 3, seed: 42, level: 'expert' })
    expect(puzzleId(3, 35, 'master')).toBe('3-master-z')
  })

  it('reject malformed IDs', () => {
    for (const bad of ['', '9-1', '3-', '3-ABC', '3-zzzzzzzz', 'x', '3-1-2', '3-insane-1', '3-Easy-1', '3-easy-']) expect(parsePuzzleId(bad), bad).toBeNull()
  })
})

describe('generate', () => {
  it('9×9: 1000 seeds, each unique, in range and reproducible', () => checkSeeds(3, 1000))
  it('4×4: 1000 seeds, each unique, in range and reproducible', () => checkSeeds(2, 1000))
  it('16×16: 3 seeds, each unique, in range and reproducible', () => checkSeeds(4, 3), 30_000)

  it('gives different puzzles for different seeds', () => {
    expect(generate(3, 1).givens).not.toEqual(generate(3, 2).givens)
  })

  it('builds a valid 25×25 solution and stays in range', () => {
    const p = generate(5, 1)
    const size = sizeOf(5)
    for (const u of size.units) expect(new Set(Array.from(u, (i) => p.solution[i])).size).toBe(25)
    const range = clueRange(5)
    expect(p.clues).toBeGreaterThanOrEqual(range.min)
    expect(p.clues).toBeLessThanOrEqual(range.max)
  })
})
