// Game rules and moves: givens are locked, conflicts follow the row/column/box rule, a full grid with no
// conflict is a win, and every edit — values and pencil-mark notes alike — is undoable. Pure state — no DOM,
// no storage.
import { sizeOf, type Size } from './size'

/** One cell's notes before and after a move, as bitmasks (bit d-1 stands for candidate d). */
export interface NoteChange {
  readonly cell: number
  readonly from: number
  readonly to: number
}

/** A value edit of `cell` (from === to for a notes-only edit), plus every note it changed. */
export interface Move {
  readonly cell: number
  readonly from: number
  readonly to: number
  readonly notes?: readonly NoteChange[]
}

/** Plain-data form of a game, the shape persisted to storage. */
export interface GameData {
  n: number
  puzzleId: string
  givens: number[]
  solution: number[]
  values: number[]
  /** Pencil marks per cell as bitmasks; absent in games saved before notes existed. */
  notes?: number[]
  history: Move[]
  future: Move[]
  /** Wrong digits rejected on Easy; absent in games saved before the counter existed. */
  mistakes?: number
  elapsedMs: number
  completed: boolean
  /** Cells whose digit a hint revealed (absent in games saved before hints). */
  hinted?: number[]
  /** Hints asked for (absent in games saved before hints). */
  hints?: number
}

export class Game {
  readonly size: Size
  readonly puzzleId: string
  readonly givens: readonly number[]
  readonly solution: readonly number[]
  private readonly values: number[]
  private readonly notes: number[]
  private history: Move[]
  private future: Move[]
  elapsedMs: number
  mistakes: number
  private completedFlag: boolean
  private readonly hinted: Set<number>
  private hintCount: number

  constructor(data: GameData) {
    this.size = sizeOf(data.n)
    const cells = this.size.cells
    if (
      data.givens.length !== cells ||
      data.solution.length !== cells ||
      data.values.length !== cells ||
      (data.notes !== undefined && data.notes.length !== cells)
    ) {
      throw new Error(`game data does not fit a ${this.size.N}×${this.size.N} board`)
    }
    this.puzzleId = data.puzzleId
    this.givens = data.givens.slice()
    this.solution = data.solution.slice()
    this.values = data.values.slice()
    this.notes = data.notes ? data.notes.map((m) => m & this.size.full) : new Array<number>(cells).fill(0)
    for (let i = 0; i < cells; i++) if (this.givens[i]) this.values[i] = this.givens[i]
    this.history = data.history.slice()
    this.future = data.future.slice()
    this.elapsedMs = data.elapsedMs
    this.mistakes = data.mistakes ?? 0
    this.completedFlag = data.completed
    this.hinted = new Set(data.hinted ?? [])
    this.hintCount = data.hints ?? 0
  }

  static fromPuzzle(n: number, puzzleId: string, givens: readonly number[], solution: readonly number[]): Game {
    return new Game({
      n,
      puzzleId,
      givens: givens.slice(),
      solution: solution.slice(),
      values: givens.slice(),
      notes: new Array<number>(givens.length).fill(0),
      history: [],
      future: [],
      elapsedMs: 0,
      completed: false,
    })
  }

  toData(): GameData {
    return {
      n: this.size.n,
      puzzleId: this.puzzleId,
      givens: this.givens.slice(),
      solution: this.solution.slice(),
      values: this.values.slice(),
      notes: this.notes.slice(),
      history: this.history.slice(),
      future: this.future.slice(),
      mistakes: this.mistakes,
      elapsedMs: this.elapsedMs,
      completed: this.completedFlag,
      hinted: [...this.hinted],
      hints: this.hintCount,
    }
  }

  get completed(): boolean {
    return this.completedFlag
  }

  value(cell: number): number {
    return this.values[cell]
  }

  isGiven(cell: number): boolean {
    return this.givens[cell] !== 0
  }

  /** The cell's pencil marks as a bitmask: bit d-1 set means candidate d is noted. */
  notesOf(cell: number): number {
    return this.notes[cell]
  }

  hasNote(cell: number, d: number): boolean {
    return d >= 1 && d <= this.size.N && (this.notes[cell] & (1 << (d - 1))) !== 0
  }

  /**
   * Puts d into a non-given cell, clearing that cell's notes. With `cleanPeers`, d is also removed from
   * the notes of every cell sharing its row, column or box. d = 0 erases the value and the notes.
   * Returns false when nothing changed.
   */
  set(cell: number, d: number, cleanPeers = true): boolean {
    if (this.completedFlag || this.isGiven(cell) || d < 0 || d > this.size.N) return false
    const from = this.values[cell]
    const notes: NoteChange[] = []
    if (this.notes[cell]) notes.push({ cell, from: this.notes[cell], to: 0 })
    if (d && cleanPeers) {
      const bit = 1 << (d - 1)
      for (const p of this.size.peers[cell]) {
        const m = this.notes[p]
        if (m & bit) notes.push({ cell: p, from: m, to: m & ~bit })
      }
    }
    if (from === d && !notes.length) return false
    this.commit(notes.length ? { cell, from, to: d, notes } : { cell, from, to: d })
    return true
  }

  /**
   * Strict entry (Easy): a digit that is not the cell's solution is refused — nothing is placed and the
   * mistake count goes up. Returns 'wrong', or set()'s result otherwise.
   */
  place(cell: number, d: number, cleanPeers = true): boolean | 'wrong' {
    if (d && !this.completedFlag && !this.isGiven(cell) && d !== this.solution[cell]) {
      this.mistakes++
      return 'wrong'
    }
    return this.set(cell, d, cleanPeers)
  }

  erase(cell: number): boolean {
    return this.set(cell, 0)
  }

  /** How many hints were asked for in this game. */
  get hints(): number {
    return this.hintCount
  }

  /** Counts a hint asked for. */
  useHint(): void {
    if (!this.completedFlag) this.hintCount++
  }

  /** Puts a hint's digit into a cell (an undoable move, cleaning peer notes like set) and marks the cell hinted. */
  reveal(cell: number, d: number, cleanPeers = true): boolean {
    if (!this.set(cell, d, cleanPeers)) return false
    this.hinted.add(cell)
    return true
  }

  isHinted(cell: number): boolean {
    return this.hinted.has(cell)
  }

  /** Adds or removes candidate d in an empty, non-given cell. Returns false when nothing changed. */
  toggleNote(cell: number, d: number): boolean {
    if (this.completedFlag || this.isGiven(cell) || this.values[cell] || d < 1 || d > this.size.N) return false
    const from = this.notes[cell]
    this.commit({ cell, from: 0, to: 0, notes: [{ cell, from, to: from ^ (1 << (d - 1)) }] })
    return true
  }

  canUndo(): boolean {
    return !this.completedFlag && this.history.length > 0
  }

  canRedo(): boolean {
    return !this.completedFlag && this.future.length > 0
  }

  undo(): boolean {
    if (!this.canUndo()) return false
    const m = this.history.pop()!
    this.apply(m, true)
    this.future.push(m)
    return true
  }

  redo(): boolean {
    if (!this.canRedo()) return false
    const m = this.future.pop()!
    this.apply(m)
    this.history.push(m)
    return true
  }

  /** Back to the givens: clears every entry and note, the undo history and the clock. */
  restart(): void {
    for (let i = 0; i < this.size.cells; i++) {
      this.values[i] = this.givens[i]
      this.notes[i] = 0
    }
    this.history = []
    this.future = []
    this.elapsedMs = 0
    this.mistakes = 0
    this.completedFlag = false
    this.hinted.clear()
    this.hintCount = 0
  }

  /** Every filled cell that shares its value with a peer. */
  conflicts(): Set<number> {
    const out = new Set<number>()
    const { cells, peers } = this.size
    for (let i = 0; i < cells; i++) {
      const v = this.values[i]
      if (!v) continue
      for (const p of peers[i]) {
        if (this.values[p] === v) {
          out.add(i)
          break
        }
      }
    }
    return out
  }

  /** How many more times each symbol can be placed: index d holds N minus the copies of d on the board. */
  remaining(): number[] {
    const { N } = this.size
    const out = new Array<number>(N + 1).fill(N)
    out[0] = 0
    for (const v of this.values) if (v) out[v]--
    return out
  }

  filledCount(): number {
    let k = 0
    for (const v of this.values) if (v) k++
    return k
  }

  private commit(m: Move): void {
    this.apply(m)
    this.history.push(m)
    this.future = []
  }

  /** Applies m forwards, or with `reverse` puts back what it replaced. */
  private apply(m: Move, reverse = false): void {
    this.values[m.cell] = reverse ? m.from : m.to
    for (const c of m.notes ?? []) this.notes[c.cell] = reverse ? c.from : c.to
    this.completedFlag = this.filledCount() === this.size.cells && this.conflicts().size === 0
  }
}
