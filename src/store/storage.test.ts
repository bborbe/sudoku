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

  it('round-trips notes and their undo history, and loads a game saved before notes', () => {
    const p = generate(3, 11)
    const g = Game.fromPuzzle(3, p.id, p.givens, p.solution)
    const a = p.givens.indexOf(0)
    const peer = g.size.peers[a].find((i) => !p.givens[i])!
    g.toggleNote(peer, 6)
    g.toggleNote(a, 2)
    g.set(a, 6)
    saveGame(g.toData())
    const loaded = loadGame()!
    expect(loaded).toEqual(g.toData())
    const back = new Game(loaded)
    expect(back.undo()).toBe(true)
    expect(back.hasNote(peer, 6)).toBe(true)
    expect(back.hasNote(a, 2)).toBe(true)

    const legacy: Record<string, unknown> = { ...g.toData() }
    delete legacy.notes
    legacy.history = [{ cell: a, from: 0, to: 6 }]
    legacy.future = []
    localStorage.setItem('sudoku.game', JSON.stringify(legacy))
    expect(loadGame()).not.toBeNull()
  })

  it('rejects notes outside the board or the symbol range', () => {
    const p = generate(2, 3)
    const data = Game.fromPuzzle(2, p.id, p.givens, p.solution).toData()
    localStorage.setItem('sudoku.game', JSON.stringify({ ...data, notes: [1, 2] }))
    expect(loadGame()).toBeNull()
    localStorage.setItem('sudoku.game', JSON.stringify({ ...data, notes: data.notes!.map(() => 16) }))
    expect(loadGame()).toBeNull()
    const bad = { cell: 0, from: 0, to: 0, notes: [{ cell: 0, from: 0, to: 99 }] }
    localStorage.setItem('sudoku.game', JSON.stringify({ ...data, history: [bad] }))
    expect(loadGame()).toBeNull()
  })

  it('keeps assist overrides, drops invalid ones, and migrates the old cleanNotes checkbox', () => {
    expect(loadSettings().assists).toEqual({})
    saveSettings({ assists: { hints: false, sameDigit: true } })
    expect(loadSettings().assists).toEqual({ hints: false, sameDigit: true })
    localStorage.setItem('sudoku.settings', JSON.stringify({ assists: { hints: 'no', foo: true } }))
    expect(loadSettings().assists).toEqual({})
    localStorage.setItem('sudoku.settings', JSON.stringify({ cleanNotes: false }))
    expect(loadSettings().assists).toEqual({ cleanNotes: false })
    localStorage.setItem('sudoku.settings', JSON.stringify({ cleanNotes: true }))
    expect(loadSettings().assists).toEqual({})
    localStorage.setItem('sudoku.settings', JSON.stringify({ cleanNotes: false, assists: { cleanNotes: true } }))
    expect(loadSettings().assists).toEqual({ cleanNotes: true })
  })

  it('treats a corrupt or foreign game as absent', () => {
    localStorage.setItem('sudoku.game', '{not json')
    expect(loadGame()).toBeNull()
    localStorage.setItem('sudoku.game', JSON.stringify({ n: 3, puzzleId: 'x', givens: [1, 2] }))
    expect(loadGame()).toBeNull()
    localStorage.setItem('sudoku.game', JSON.stringify({ n: 7 }))
    expect(loadGame()).toBeNull()
    const p = generate(3, 11)
    const data = Game.fromPuzzle(3, p.id, p.givens, p.solution).toData()
    localStorage.setItem('sudoku.game', JSON.stringify({ ...data, hinted: [81] }))
    expect(loadGame()).toBeNull()
    localStorage.setItem('sudoku.game', JSON.stringify({ ...data, hints: -1 }))
    expect(loadGame()).toBeNull()
    const { hinted: _h, hints: _n, ...beforeHints } = data
    localStorage.setItem('sudoku.game', JSON.stringify(beforeHints))
    expect(loadGame()).toEqual(beforeHints)
  })

  it('defaults the box size to 3 and keeps a saved one', () => {
    expect(loadSettings()).toEqual({ n: 3, theme: 'system', levels: {}, assists: {} })
    saveSettings({ n: 4 })
    expect(loadSettings()).toEqual({ n: 4, theme: 'system', levels: {}, assists: {} })
    localStorage.setItem('sudoku.settings', JSON.stringify({ n: 9 }))
    expect(loadSettings()).toEqual({ n: 3, theme: 'system', levels: {}, assists: {} })
  })

  it('keeps one difficulty per board size, and saving one field keeps the others', () => {
    saveSettings({ levels: { 3: 'expert', 4: 'hard' }, assists: {} })
    saveSettings({ n: 4 })
    expect(loadSettings()).toEqual({ n: 4, theme: 'system', levels: { 3: 'expert', 4: 'hard' }, assists: {} })
  })

  it('drops unknown levels and levels a board size does not offer', () => {
    localStorage.setItem('sudoku.settings', JSON.stringify({ n: 3, levels: { 2: 'master', 3: 'insane', 5: 'medium', 9: 'easy' } }))
    expect(loadSettings()).toEqual({ n: 3, theme: 'system', levels: { 5: 'medium' }, assists: {} })
    localStorage.setItem('sudoku.settings', JSON.stringify({ n: 3, levels: 'hard' }))
    expect(loadSettings().levels).toEqual({})
  })

  it('keeps a picked language, and has none until one is picked', () => {
    expect(loadSettings().lang).toBeUndefined()
    saveSettings({ lang: 'de' })
    expect(loadSettings().lang).toBe('de')
    localStorage.setItem('sudoku.settings', JSON.stringify({ n: 3, lang: 'fr' }))
    expect(loadSettings().lang).toBeUndefined()
  })

  it('defaults the theme to system, keeps a saved one, and validates each field on its own', () => {
    saveSettings({ n: 3, theme: 'dark' })
    expect(loadSettings().theme).toBe('dark')
    localStorage.setItem('sudoku.settings', JSON.stringify({ n: 4, theme: 'sepia' }))
    expect(loadSettings()).toEqual({ n: 4, theme: 'system', levels: {}, assists: {} })
    localStorage.setItem('sudoku.settings', JSON.stringify({ n: 9, theme: 'light' }))
    expect(loadSettings()).toEqual({ n: 3, theme: 'light', levels: {}, assists: {} })
  })
})
