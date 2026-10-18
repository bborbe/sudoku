// Slow tier (release.yml, nightly.yml): hints across every 9×9 level, where the harder techniques come in.
import { describe, expect, it } from 'vitest'
import { playOnHints } from './check-hints'
import { levelsFor } from './difficulty'
import { generate } from './generator'

describe('hints never contradict the solution (slow)', () => {
  it('9×9: 100 seeds per level played to the end on hints alone', () => {
    const kinds = new Map<string, number>()
    for (const level of levelsFor(3))
      for (let seed = 1; seed <= 100; seed++) for (const k of playOnHints(generate(3, seed, level), seed % 2)) kinds.set(k, (kinds.get(k) ?? 0) + 1)
    expect(kinds.get('step')).toBeGreaterThan(0)
    expect(kinds.get('mistake')).toBeGreaterThan(0)
  }, 600_000)
})
