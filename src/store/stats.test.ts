import { beforeEach, describe, expect, it } from 'vitest'
import { averageMs, loadStats, recordSolve, statKey } from './stats'

class MemoryStorage {
  private items = new Map<string, string>()
  getItem(k: string) {
    return this.items.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.items.set(k, v)
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
})

describe('stats', () => {
  it('starts empty', () => {
    expect(loadStats()).toEqual({})
  })

  it('counts solves, best and average per size × level', () => {
    recordSolve(3, 'hard', 300_000)
    recordSolve(3, 'hard', 200_000)
    recordSolve(3, 'easy', 90_000)
    const s = loadStats()
    expect(s[statKey(3, 'hard')]).toEqual({ solved: 2, bestMs: 200_000, totalMs: 500_000 })
    expect(averageMs(s[statKey(3, 'hard')]!)).toBe(250_000)
    expect(s[statKey(3, 'easy')]?.solved).toBe(1)
  })

  it('drops malformed and foreign entries', () => {
    localStorage.setItem('sudoku.stats', JSON.stringify({ '3-hard': { solved: 'x' }, '2-master': { solved: 1, bestMs: 1, totalMs: 1 }, '3-easy': { solved: 1, bestMs: 5, totalMs: 5 } }))
    expect(Object.keys(loadStats())).toEqual(['3-easy'])
    localStorage.setItem('sudoku.stats', '{not json')
    expect(loadStats()).toEqual({})
  })
})
