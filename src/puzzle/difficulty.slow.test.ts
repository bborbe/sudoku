// Slow tier (release.yml, nightly.yml): the full per-level sweeps.
import { describe, expect, it } from 'vitest'
import { sizeOf } from '../engine/size'
import { levelsFor } from './difficulty'
import { generate } from './generator'
import { checkLevel } from './check-level'
import { solveLogically } from './logic'

/** Generation budget per puzzle: the slowest seed of any level must stay under it. */
const BUDGET_MS = 3000

describe('generate at a level (slow)', () => {
  for (const level of levelsFor(3)) {
    it(`9×9 ${level}: 500 seeds land in the level, unique, within the time budget`, () => {
      checkLevel(3, level, 500)
      let worst = 0
      for (let seed = 1; seed <= 500; seed++) {
        const t0 = performance.now()
        generate(3, seed, level)
        worst = Math.max(worst, performance.now() - t0)
      }
      expect(worst, `slowest 9×9 ${level}`).toBeLessThan(BUDGET_MS)
    }, 600_000)
  }

  it('9×9: the rating exercises every technique family', () => {
    const size = sizeOf(3)
    const used = new Set<string>()
    for (const level of ['hard', 'expert', 'master', 'extreme'] as const)
      for (let seed = 1; seed <= 200; seed++) for (const name of Object.keys(solveLogically(size, generate(3, seed, level).givens).used)) used.add(name)
    for (const name of ['locked candidates', 'naked pair', 'hidden pair', 'naked triple', 'x-wing', 'xy-wing', 'swordfish', 'xyz-wing', 'simple coloring'])
      expect(used, name).toContain(name)
  }, 600_000)

  for (const n of [4, 5]) {
    it(`${n * n}×${n * n}: every offered level, 5 seeds`, () => {
      for (const level of levelsFor(n)) checkLevel(n, level, 5)
    }, 600_000)
  }
})
