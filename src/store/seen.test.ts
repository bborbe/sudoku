import { beforeEach, describe, expect, it } from 'vitest'
import { puzzleId } from '../puzzle/generator'
import { isSeen, loadSeen, markSeen, MAX_SEEN } from './seen'

class MemoryStorage {
  private items = new Map<string, string>()
  getItem(k: string) {
    return this.items.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.items.set(k, v)
  }
  removeItem(k: string) {
    this.items.delete(k)
  }
  clear() {
    this.items.clear()
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
})

const id = (seed: number): string => puzzleId(3, seed, 'medium')

describe('seen', () => {
  it('starts empty and records a dealt puzzle', () => {
    expect(loadSeen()).toEqual([])
    markSeen(id(1))
    expect(loadSeen()).toEqual([id(1)])
    expect(isSeen(id(1))).toBe(true)
    expect(isSeen(id(2))).toBe(false)
  })

  it('holds exactly MAX_SEEN ids and drops the oldest first', () => {
    for (let seed = 0; seed <= MAX_SEEN + 4; seed++) markSeen(id(seed))
    const seen = loadSeen()
    expect(seen).toHaveLength(MAX_SEEN)
    expect(seen[seen.length - 1]).toBe(id(MAX_SEEN + 4))
    for (let seed = 0; seed <= 4; seed++) expect(seen).not.toContain(id(seed))
    expect(seen[0]).toBe(id(5))
  })

  it('keeps an id it already holds in place, so a resume load never reorders the ring', () => {
    for (const seed of [1, 2, 3]) markSeen(id(seed))
    const before = loadSeen()
    markSeen(id(1))
    expect(loadSeen()).toEqual(before)
  })

  it('reads a corrupt or foreign value as absent', () => {
    localStorage.setItem('sudoku.seen', '{not json')
    expect(loadSeen()).toEqual([])
    localStorage.setItem('sudoku.seen', '{"a":1}')
    expect(loadSeen()).toEqual([])
    localStorage.setItem('sudoku.seen', 'null')
    expect(loadSeen()).toEqual([])
    localStorage.setItem('sudoku.seen', JSON.stringify([1, null, 'not-a-puzzle-id', id(7)]))
    expect(loadSeen()).toEqual([id(7)])
  })

  it('ignores an id that is not a puzzle id', () => {
    markSeen('not-a-puzzle-id')
    expect(loadSeen()).toEqual([])
  })
})
