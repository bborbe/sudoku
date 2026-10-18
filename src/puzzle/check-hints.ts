// Test helper: plays a puzzle to the end on hints alone and checks that no hint ever contradicts the solution.
import { expect } from 'vitest'
import { sizeOf } from '../engine/size'
import { findHint, type Hint } from './hint'
import type { Puzzle } from './generator'
import { mulberry32 } from './rng'

/**
 * Follows hints from the givens until the board is solved; with mistakes, first drops a wrong digit into a few
 * empty cells and expects each to be pointed out before any other hint. Returns the hint kinds seen.
 */
export function playOnHints(p: Puzzle, mistakes = 0): Hint['kind'][] {
  const size = sizeOf(p.n)
  const values = p.givens.slice()
  const rng = mulberry32(p.givens.length * 7919 + p.clues)
  for (let k = 0; k < mistakes; k++) {
    const empty = values.flatMap((v, i) => (v ? [] : [i]))
    const cell = empty[Math.floor(rng() * empty.length)]
    values[cell] = (p.solution[cell] % size.N) + 1 // any digit but the right one
  }
  const kinds: Hint['kind'][] = []
  for (let guard = 0; guard <= size.cells; guard++) {
    const h = findHint(size, values, p.solution)
    if (!h) break
    const label = `${p.id} hint ${kinds.length} (${h.kind}: ${h.text})`
    expect(h.digit, label).toBe(p.solution[h.cell])
    expect(h.region, label).toContain(h.cell)
    if (h.kind === 'mistake') expect(values[h.cell], label).not.toBe(p.solution[h.cell])
    else expect(values[h.cell], label).toBe(0)
    if (kinds.length < mistakes) expect(h.kind, label).toBe('mistake')
    values[h.cell] = h.digit
    kinds.push(h.kind)
  }
  expect(values, p.id).toEqual(p.solution)
  return kinds
}
