import { beforeEach, describe, expect, it } from 'vitest'
import { Game } from '../engine/game'
import { generate } from '../puzzle/generator'
import { loadGame, loadSettings, saveGame, saveSettings } from './storage'

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

describe('storage', () => {
  it('round-trips a game', () => {
    const p = generate(3, 11)
    const g = Game.fromPuzzle(3, p.id, p.givens, p.solution)
    g.set(p.givens.indexOf(0), 5)
    g.elapsedMs = 4200
    saveGame(g.toData())
    expect(loadGame()).toEqual(g.toData())
  })

  it('treats a corrupt or foreign game as absent', () => {
    localStorage.setItem('sudoku.game', '{not json')
    expect(loadGame()).toBeNull()
    localStorage.setItem('sudoku.game', JSON.stringify({ n: 3, puzzleId: 'x', givens: [1, 2] }))
    expect(loadGame()).toBeNull()
    localStorage.setItem('sudoku.game', JSON.stringify({ n: 7 }))
    expect(loadGame()).toBeNull()
  })

  it('defaults the box size to 3 and keeps a saved one', () => {
    expect(loadSettings()).toEqual({ n: 3, theme: 'system' })
    saveSettings({ n: 4, theme: 'system' })
    expect(loadSettings()).toEqual({ n: 4, theme: 'system' })
    localStorage.setItem('sudoku.settings', JSON.stringify({ n: 9 }))
    expect(loadSettings()).toEqual({ n: 3, theme: 'system' })
  })

  it('defaults the theme to system, keeps a saved one, and validates each field on its own', () => {
    saveSettings({ n: 3, theme: 'dark' })
    expect(loadSettings().theme).toBe('dark')
    localStorage.setItem('sudoku.settings', JSON.stringify({ n: 4, theme: 'sepia' }))
    expect(loadSettings()).toEqual({ n: 4, theme: 'system' })
    localStorage.setItem('sudoku.settings', JSON.stringify({ n: 9, theme: 'light' }))
    expect(loadSettings()).toEqual({ n: 3, theme: 'light' })
  })
})
