// Game rules and moves: givens are locked, conflicts follow the row/column/box rule, a full grid with no
// conflict is a win, and every edit is undoable. Pure state — no DOM, no storage.
import { sizeOf, type Size } from './size'

export interface Move {
  readonly cell: number
  readonly from: number
  readonly to: number
}

/** Plain-data form of a game, the shape persisted to storage. */
export interface GameData {
  n: number
  puzzleId: string
  givens: number[]
  solution: number[]
  values: number[]
  history: Move[]
  future: Move[]
  elapsedMs: number
  completed: boolean
}

export class Game {
  readonly size: Size
  readonly puzzleId: string
  readonly givens: readonly number[]
  readonly solution: readonly number[]
  private readonly values: number[]
  private history: Move[]
  private future: Move[]
  elapsedMs: number
  private completedFlag: boolean

  constructor(data: GameData) {
    this.size = sizeOf(data.n)
    const cells = this.size.cells
    if (data.givens.length !== cells || data.solution.length !== cells || data.values.length !== cells) {
      throw new Error(`game data does not fit a ${this.size.N}×${this.size.N} board`)
    }
    this.puzzleId = data.puzzleId
    this.givens = data.givens.slice()
    this.solution = data.solution.slice()
    this.values = data.values.slice()
    for (let i = 0; i < cells; i++) if (this.givens[i]) this.values[i] = this.givens[i]
    this.history = data.history.slice()
    this.future = data.future.slice()
    this.elapsedMs = data.elapsedMs
    this.completedFlag = data.completed
  }

  static fromPuzzle(n: number, puzzleId: string, givens: readonly number[], solution: readonly number[]): Game {
    return new Game({
      n,
      puzzleId,
      givens: givens.slice(),
      solution: solution.slice(),
      values: givens.slice(),
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
      history: this.history.slice(),
      future: this.future.slice(),
      elapsedMs: this.elapsedMs,
      completed: this.completedFlag,
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

  /** Puts d (0 erases) into a non-given cell. Returns false when nothing changed. */
  set(cell: number, d: number): boolean {
    if (this.completedFlag || this.isGiven(cell) || d < 0 || d > this.size.N) return false
    const from = this.values[cell]
    if (from === d) return false
    this.apply({ cell, from, to: d })
    this.history.push({ cell, from, to: d })
    this.future = []
    return true
  }

  erase(cell: number): boolean {
    return this.set(cell, 0)
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
    this.apply({ cell: m.cell, from: m.to, to: m.from })
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

  /** Back to the givens: clears every entry, the undo history and the clock. */
  restart(): void {
    for (let i = 0; i < this.size.cells; i++) this.values[i] = this.givens[i]
    this.history = []
    this.future = []
    this.elapsedMs = 0
    this.completedFlag = false
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

  private apply(m: Move): void {
    this.values[m.cell] = m.to
    this.completedFlag = this.filledCount() === this.size.cells && this.conflicts().size === 0
  }
}
