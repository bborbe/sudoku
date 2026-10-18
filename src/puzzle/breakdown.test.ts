import { describe, expect, it } from 'vitest'
import { sizeOf } from '../engine/size'
import { BEYOND_LOGIC, techniqueBreakdown, techniqueLabel } from './breakdown'
import { generate } from './generator'
import { MAX_TIER, solveLogically, TECHNIQUES } from './logic'

describe('techniqueBreakdown', () => {
  const size = sizeOf(3)

  it('counts every technique the solver used, easiest first, and names the hardest', () => {
    const p = generate(3, 7, 'expert')
    const b = techniqueBreakdown(size, p.givens)
    const { used } = solveLogically(size, p.givens)
    expect(Object.fromEntries(b.techniques.map((t) => [t.name, t.count]))).toEqual(used)
    const order = TECHNIQUES.map(([name]) => name)
    expect(b.techniques.map((t) => order.indexOf(t.name))).toEqual(b.techniques.map((t) => order.indexOf(t.name)).sort((x, y) => x - y))
    expect(b.tier).toBe(3)
    expect(b.hardest).toBe(b.techniques[b.techniques.length - 1].name)
    expect(b.techniques.find((t) => t.name === b.hardest)!.tier).toBe(3)
  })

  it('names chains or trial and error for a puzzle past the techniques', () => {
    const b = techniqueBreakdown(size, generate(3, 1, 'extreme').givens)
    expect(b.hardest).toBe(BEYOND_LOGIC)
    expect(b.tier).toBe(MAX_TIER + 1)
  })

  it('reports nothing for a full grid', () => {
    expect(techniqueBreakdown(size, generate(3, 1).solution)).toEqual({ techniques: [], hardest: null, tier: -1 })
  })

  it('works on every board size', () => {
    for (const n of [2, 4]) expect(techniqueBreakdown(sizeOf(n), generate(n, 3).givens).hardest, `n ${n}`).not.toBeNull()
  })

  it('capitalises labels', () => {
    expect(techniqueLabel('x-wing')).toBe('X-wing')
    expect(techniqueLabel('xy-wing')).toBe('XY-wing')
    expect(techniqueLabel('xyz-wing')).toBe('XYZ-wing')
    expect(techniqueLabel('simple coloring')).toBe('Simple coloring')
    expect(techniqueLabel('hidden single')).toBe('Hidden single')
  })
})
