import { describe, expect, it } from 'vitest'
import { sizeOf } from '../engine/size'
import { playOnHints } from './check-hints'
import { generate } from './generator'
import { findHint } from './hint'

describe('findHint', () => {
  const size = sizeOf(3)
  const p = generate(3, 1)

  it('has nothing to say about a solved board', () => {
    expect(findHint(size, p.solution, p.solution)).toBeNull()
  })

  it('names a single, the unit it sits in, and the solution digit', () => {
    const h = findHint(size, p.givens, p.solution)!
    expect(h.kind).toBe('step')
    expect(h.text).toMatch(/^(Hidden|Naked) single in (row|column|box) \d/)
    expect(h.region).toHaveLength(9)
    expect(h.region).toContain(h.cell)
    expect(p.givens[h.cell]).toBe(0)
    expect(h.digit).toBe(p.solution[h.cell])
  })

  it('points out a wrong digit before anything else', () => {
    const values = p.givens.slice()
    const cell = values.findLastIndex((v) => v === 0)
    values[cell] = (p.solution[cell] % 9) + 1
    const h = findHint(size, values, p.solution)!
    expect(h).toMatchObject({ kind: 'mistake', cell, digit: p.solution[cell] })
    expect(h.text).toBe(`A digit in row ${size.row[cell] + 1}, box ${size.box[cell] + 1} does not fit the solution.`)
  })

  it('names the eliminations that lead to the placement on a harder puzzle', () => {
    const texts = new Set<string>()
    for (let seed = 1; seed <= 5; seed++) {
      const q = generate(3, seed, 'expert')
      const values = q.givens.slice()
      for (let h = findHint(size, values, q.solution); h; h = findHint(size, values, q.solution)) {
        texts.add(h.text)
        values[h.cell] = h.digit
      }
    }
    expect([...texts].some((t) => /, then a (hidden|naked) single in /.test(t))).toBe(true)
  })

  it('reveals a digit when no technique applies', () => {
    // A board with almost nothing on it: the techniques stall, the hint still fills the right digit.
    const values = new Array(81).fill(0)
    values[0] = p.solution[0]
    const h = findHint(size, values, p.solution)!
    expect(h.kind).toBe('reveal')
    expect(h.digit).toBe(p.solution[h.cell])
  })
})

describe('hints never contradict the solution', () => {
  it('500 puzzles (4×4, 9×9, 16×16) played to the end on hints alone, some with wrong digits first', () => {
    let played = 0
    for (let seed = 1; seed <= 200; seed++) playOnHints(generate(2, seed), seed % 3), played++
    for (let seed = 1; seed <= 290; seed++) playOnHints(generate(3, seed), seed % 4), played++
    for (let seed = 1; seed <= 10; seed++) playOnHints(generate(4, seed), 1), played++
    expect(played).toBe(500)
  }, 60_000)
})
