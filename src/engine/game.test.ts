import { describe, expect, it } from 'vitest'
import { generate } from '../puzzle/generator'
import { Game } from './game'

function newGame(n = 3, seed = 7): Game {
  const p = generate(n, seed)
  return Game.fromPuzzle(n, p.id, p.givens, p.solution)
}

function firstEmpty(g: Game): number {
  for (let i = 0; i < g.size.cells; i++) if (!g.value(i)) return i
  throw new Error('no empty cell')
}

describe('Game', () => {
  it('keeps givens immutable', () => {
    const g = newGame()
    const given = g.givens.findIndex((v) => v !== 0)
    const before = g.value(given)
    expect(g.set(given, (before % 9) + 1)).toBe(false)
    expect(g.erase(given)).toBe(false)
    expect(g.value(given)).toBe(before)
    expect(g.canUndo()).toBe(false)
  })

  it('flags row, column and box conflicts on both cells', () => {
    const g = newGame()
    const { N, row, col, box, cells } = g.size
    const cell = firstEmpty(g)
    for (const [label, same] of [
      ['row', (j: number) => row[j] === row[cell]],
      ['column', (j: number) => col[j] === col[cell]],
      ['box', (j: number) => box[j] === box[cell]],
    ] as const) {
      const clash = Array.from({ length: cells }, (_, j) => j).find((j) => j !== cell && same(j) && g.value(j) !== 0)
      expect(clash, `a filled ${label} peer`).toBeDefined()
      g.set(cell, g.value(clash!))
      const conflicts = g.conflicts()
      expect(conflicts.has(cell), label).toBe(true)
      expect(conflicts.has(clash!), label).toBe(true)
    }
    g.erase(cell)
    expect(g.conflicts().size).toBe(0)
    expect(N).toBe(9)
  })

  it('wins on a valid full grid, and only then', () => {
    const g = newGame(2, 3)
    const empties = Array.from({ length: g.size.cells }, (_, i) => i).filter((i) => !g.value(i))
    for (const i of empties.slice(0, -1)) g.set(i, g.solution[i])
    expect(g.completed).toBe(false)
    const last = empties[empties.length - 1]
    const wrong = g.size.peers[last].map((p) => g.value(p)).find((v) => v !== 0)!
    g.set(last, wrong)
    expect(g.completed).toBe(false)
    g.set(last, g.solution[last])
    expect(g.completed).toBe(true)
    expect(g.set(last, 0)).toBe(false)
  })

  it('accepts any valid full grid as a win, not only the stored solution', () => {
    // Swapping two symbols everywhere keeps the grid valid while differing from the solution.
    const g = new Game({
      n: 2,
      puzzleId: 'test',
      givens: new Array(16).fill(0),
      solution: [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1],
      values: new Array(16).fill(0),
      history: [],
      future: [],
      elapsedMs: 0,
      completed: false,
    })
    const swapped = g.solution.map((v) => (v === 1 ? 2 : v === 2 ? 1 : v))
    swapped.forEach((v, i) => g.set(i, v))
    expect(g.completed).toBe(true)
  })

  it('undoes, redoes and restarts', () => {
    const g = newGame()
    const a = firstEmpty(g)
    g.set(a, 1)
    g.set(a, 2)
    expect(g.undo()).toBe(true)
    expect(g.value(a)).toBe(1)
    expect(g.undo()).toBe(true)
    expect(g.value(a)).toBe(0)
    expect(g.undo()).toBe(false)
    expect(g.redo()).toBe(true)
    expect(g.value(a)).toBe(1)
    g.set(a, 3)
    expect(g.canRedo()).toBe(false)
    g.elapsedMs = 5000
    g.restart()
    expect(g.value(a)).toBe(0)
    expect(g.canUndo()).toBe(false)
    expect(g.elapsedMs).toBe(0)
    expect(g.filledCount()).toBe(g.givens.filter((v) => v !== 0).length)
  })

  it('counts remaining copies of each symbol', () => {
    const g = newGame()
    const rem = g.remaining()
    expect(rem).toHaveLength(10)
    const placed = rem.slice(1).reduce((s, r) => s + (9 - r), 0)
    expect(placed).toBe(g.filledCount())
  })

  it('toggles notes only in empty, non-given cells', () => {
    const g = newGame()
    const a = firstEmpty(g)
    const given = g.givens.findIndex((v) => v !== 0)
    expect(g.toggleNote(a, 3)).toBe(true)
    expect(g.toggleNote(a, 9)).toBe(true)
    expect(g.notesOf(a)).toBe((1 << 2) | (1 << 8))
    expect(g.hasNote(a, 3)).toBe(true)
    expect(g.toggleNote(a, 3)).toBe(true)
    expect(g.hasNote(a, 3)).toBe(false)
    expect(g.toggleNote(given, 1)).toBe(false)
    expect(g.toggleNote(a, 0)).toBe(false)
    expect(g.toggleNote(a, 10)).toBe(false)
    g.set(a, 5)
    expect(g.notesOf(a)).toBe(0)
    expect(g.toggleNote(a, 1)).toBe(false)
  })

  it('removes a placed digit from the notes of its row, column and box peers, and only there', () => {
    for (const n of [2, 3, 4, 5]) {
      const g = newGame(n, 5)
      const { N, cells, peers } = g.size
      const a = firstEmpty(g)
      const d = N
      const empties = Array.from({ length: cells }, (_, i) => i).filter((i) => i !== a && !g.value(i))
      for (const i of empties) {
        g.toggleNote(i, d)
        g.toggleNote(i, 1)
      }
      g.set(a, d)
      const peer = new Set(peers[a])
      for (const i of empties) {
        expect(g.hasNote(i, d), `${N}×${N} cell ${i}`).toBe(!peer.has(i))
        expect(g.hasNote(i, 1), `${N}×${N} cell ${i} keeps other notes`).toBe(true)
      }
    }
  })

  it('leaves peer notes alone when cleanup is off', () => {
    const g = newGame()
    const a = firstEmpty(g)
    const peer = g.size.peers[a].find((p) => !g.value(p))!
    g.toggleNote(peer, 4)
    g.set(a, 4, false)
    expect(g.hasNote(peer, 4)).toBe(true)
  })

  it('erases value and notes, and undo/redo restore notes exactly', () => {
    const g = newGame()
    const a = firstEmpty(g)
    const peers = g.size.peers[a].filter((p) => !g.value(p)).slice(0, 3)
    for (const p of peers) {
      g.toggleNote(p, 7)
      g.toggleNote(p, 2)
    }
    g.toggleNote(a, 6)
    const before = g.toData()
    g.set(a, 7)
    const placed = g.toData()
    expect(g.notesOf(a)).toBe(0)
    for (const p of peers) expect(g.notesOf(p)).toBe(1 << 1)
    expect(g.undo()).toBe(true)
    expect(g.toData().notes).toEqual(before.notes)
    expect(g.toData().values).toEqual(before.values)
    expect(g.redo()).toBe(true)
    expect(g.toData().notes).toEqual(placed.notes)
    g.erase(a)
    g.toggleNote(a, 1)
    expect(g.erase(a)).toBe(true)
    expect(g.notesOf(a)).toBe(0)
    expect(g.erase(a)).toBe(false)
    expect(g.undo()).toBe(true)
    expect(g.hasNote(a, 1)).toBe(true)
    expect(g.undo()).toBe(true)
    expect(g.notesOf(a)).toBe(0)
    g.restart()
    expect(g.toData().notes!.every((m) => m === 0)).toBe(true)
  })

  it('loads a game saved before notes existed', () => {
    const data = newGame().toData()
    delete data.notes
    const g = new Game(data)
    expect(g.toData().notes).toEqual(new Array(81).fill(0))
  })

  it('round-trips through plain data', () => {
    const g = newGame()
    g.set(firstEmpty(g), 4)
    g.toggleNote(firstEmpty(g), 2)
    g.elapsedMs = 1234
    const copy = new Game(JSON.parse(JSON.stringify(g.toData())))
    expect(copy.toData()).toEqual(g.toData())
    expect(copy.undo()).toBe(true)
  })
})
