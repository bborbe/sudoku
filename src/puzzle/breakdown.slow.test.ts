// Slow tier: validates the grading the completion breakdown reports, over 200 9×9 seeds per level. Master must
// need X-wing-class patterns or harder and Extreme swordfish-class ones or beyond: a solver capped below the
// class cannot finish the puzzle.
import { describe, expect, it } from 'vitest'
import { sizeOf } from '../engine/size'
import { levelsFor, tierOf } from './difficulty'
import { techniqueBreakdown } from './breakdown'
import { generate } from './generator'
import { MAX_TIER, solveLogically } from './logic'

const SEEDS = 200
/** Tier of the X-wing class (x-wing, xy-wing, triples) and of the swordfish class (swordfish, jellyfish, xyz-wing, coloring, quads). */
const X_WING_CLASS = 3
const SWORDFISH_CLASS = 4

describe('technique breakdown grading (slow)', () => {
  const size = sizeOf(3)
  const sweep = (level: Parameters<typeof generate>[2]) =>
    Array.from({ length: SEEDS }, (_, i) => ({ seed: i + 1, givens: generate(3, i + 1, level).givens }))

  for (const level of levelsFor(3)) {
    it(`9×9 ${level}: ${SEEDS} seeds, the breakdown's hardest step is the level's tier`, () => {
      for (const { seed, givens } of sweep(level)) expect(techniqueBreakdown(size, givens).tier, `${level} seed ${seed}`).toBe(tierOf(level))
    }, 600_000)
  }

  it(`9×9 master: ${SEEDS} seeds need an X-wing-class technique or harder, and swordfish itself appears`, () => {
    const names = new Set<string>()
    for (const { seed, givens } of sweep('master')) {
      expect(solveLogically(size, givens, X_WING_CLASS - 1).solution, `master seed ${seed} without X-wing class`).toBeNull()
      expect(solveLogically(size, givens, SWORDFISH_CLASS - 1).solution, `master seed ${seed} without swordfish class`).toBeNull()
      for (const t of techniqueBreakdown(size, givens).techniques) names.add(t.name)
    }
    expect(names).toContain('x-wing')
    expect(names).toContain('swordfish')
  }, 600_000)

  it(`9×9 extreme: ${SEEDS} seeds need a swordfish-class technique or beyond`, () => {
    for (const { seed, givens } of sweep('extreme')) {
      expect(solveLogically(size, givens, SWORDFISH_CLASS - 1).solution, `extreme seed ${seed} without swordfish class`).toBeNull()
      expect(solveLogically(size, givens, MAX_TIER).solution, `extreme seed ${seed} with every technique`).toBeNull()
    }
  }, 600_000)
})
