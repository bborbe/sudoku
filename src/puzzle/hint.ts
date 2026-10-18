// Graduated hints: the next logical move on the player's board, told in three steps — where to look, which
// technique and where, then the digit itself. Built on the logical solver, so every hinted digit is a
// deduction from the board, never a guess; a wrong entry is pointed out before anything else.
import type { Size } from '../engine/size'
import { solveLogically, type LogicStep } from './logic'

export interface Hint {
  /** step = a logical deduction · mistake = a player digit that is not the solution · reveal = no technique applies. */
  kind: 'step' | 'mistake' | 'reveal'
  /** The cell the hint fills. */
  cell: number
  /** The solution digit for cell. */
  digit: number
  /** Cells to highlight at the first press: the unit the deduction happens in, or the cell's box. */
  region: number[]
  /** What the second press says: the technique (or the problem) and its row / column / box. */
  text: string
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1)

function unitLabel(size: Size, unit: number): string {
  const { N } = size
  if (unit < N) return `row ${unit + 1}`
  if (unit < 2 * N) return `column ${unit - N + 1}`
  return `box ${unit - 2 * N + 1}`
}

const boxUnit = (size: Size, cell: number) => 2 * size.N + size.box[cell]

const where = (size: Size, cell: number) => `row ${size.row[cell] + 1}, box ${size.box[cell] + 1}`

/** "a, b and c" */
function list(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * The hint for the board values (0 = empty) of a puzzle with the given solution, or null when the board is
 * already solved. Never contradicts the solution: a mistake is reported first, and a deduced digit is checked
 * against the solution before it is offered.
 */
export function findHint(size: Size, values: ArrayLike<number>, solution: ArrayLike<number>): Hint | null {
  const { cells, units, peers } = size
  for (let i = 0; i < cells; i++) {
    if (values[i] && values[i] !== solution[i]) {
      return { kind: 'mistake', cell: i, digit: solution[i], region: Array.from(units[boxUnit(size, i)]), text: `A digit in ${where(size, i)} does not fit the solution.` }
    }
  }
  let empty = -1
  for (let i = 0; i < cells && empty < 0; i++) if (!values[i]) empty = i
  if (empty < 0) return null

  // The eliminations that lead up to it, then the first placement.
  const before: string[] = []
  let step: LogicStep | null = null
  solveLogically(size, values, undefined, (s) => {
    if (s.cell >= 0) {
      step = s
      return true
    }
    if (!before.includes(s.technique)) before.push(s.technique)
    return false
  })
  const found = step as LogicStep | null
  if (found && found.digit === solution[found.cell]) {
    const { cell, technique } = found
    const hidden = found.unit >= 0
    const unit = hidden ? found.unit : boxUnit(size, cell)
    const at = !hidden ? where(size, cell) : unit < 2 * size.N ? `${unitLabel(size, unit)} (box ${size.box[cell] + 1})` : unitLabel(size, unit)
    const lead = before.length ? `${capital(list(before))}, then a ${technique}` : capital(technique)
    return { kind: 'step', cell, digit: found.digit, region: Array.from(units[unit]), text: `${lead} in ${at}.` }
  }

  // Beyond the techniques the solver knows: reveal the empty cell with the fewest candidates.
  let best = empty
  let bestCount = Infinity
  for (let i = 0; i < cells; i++) {
    if (values[i]) continue
    const seen = new Set<number>()
    for (const p of peers[i]) if (values[p]) seen.add(values[p])
    if (size.N - seen.size < bestCount) {
      best = i
      bestCount = size.N - seen.size
    }
  }
  return {
    kind: 'reveal',
    cell: best,
    digit: solution[best],
    region: Array.from(units[boxUnit(size, best)]),
    text: `No technique the hints know applies here — the next press reveals the digit in ${where(size, best)}.`,
  }
}
