// localStorage persistence: the unfinished game and the settings. Every read is defensive — a corrupt or
// foreign value is treated as absent, never thrown into the UI.
import type { GameData } from '../engine/game'
import { BOX_SIZES, DEFAULT_BOX_SIZE, isBoxSize, sizeOf, type BoxSize } from '../engine/size'
import { isLevel, levelsFor, type Level } from '../puzzle/difficulty'

const GAME_KEY = 'sudoku.game'
const SETTINGS_KEY = 'sudoku.settings'

export type Theme = 'system' | 'light' | 'dark'
export const THEMES: readonly Theme[] = ['system', 'light', 'dark']
const isTheme = (t: unknown): t is Theme => typeof t === 'string' && (THEMES as readonly string[]).includes(t)

export interface Settings {
  n: BoxSize
  // 'system' follows prefers-color-scheme. index.html reads this field before first paint, so keep its name.
  theme: Theme
  /** The difficulty last picked for each board size; a size never picked has no entry. */
  levels: Partial<Record<BoxSize, Level>>
  /** Placing a digit removes it from the notes of the cell's row, column and box. */
  cleanNotes: boolean
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked (private mode): the game keeps running, it just will not survive a reload.
  }
}

const isIntArray = (a: unknown, len: number, max: number): a is number[] =>
  Array.isArray(a) && a.length === len && a.every((v) => Number.isInteger(v) && v >= 0 && v <= max)

// A {cell, from, to} edit: a value change (from/to up to N) or a note change (from/to bitmasks up to full).
const isEdit = (m: unknown, cells: number, max: number): boolean => {
  const e = m as { cell?: unknown; from?: unknown; to?: unknown } | null
  return (
    !!e &&
    typeof e === 'object' &&
    Number.isInteger(e.cell) &&
    (e.cell as number) >= 0 &&
    (e.cell as number) < cells &&
    Number.isInteger(e.from) &&
    (e.from as number) >= 0 &&
    (e.from as number) <= max &&
    Number.isInteger(e.to) &&
    (e.to as number) >= 0 &&
    (e.to as number) <= max
  )
}

const isMoves = (a: unknown, cells: number, max: number, full: number): boolean =>
  Array.isArray(a) &&
  a.every(
    (m) =>
      isEdit(m, cells, max) &&
      (m.notes === undefined || (Array.isArray(m.notes) && m.notes.every((c: unknown) => isEdit(c, cells, full)))),
  )

export function loadGame(): GameData | null {
  const d = read(GAME_KEY) as Partial<GameData> | null
  if (!d || typeof d !== 'object' || typeof d.n !== 'number' || !isBoxSize(d.n)) return null
  const { N, cells, full } = sizeOf(d.n)
  if (typeof d.puzzleId !== 'string') return null
  if (!isIntArray(d.givens, cells, N) || !isIntArray(d.solution, cells, N) || !isIntArray(d.values, cells, N)) return null
  // Notes are optional: a game saved before notes existed loads with none.
  if (d.notes !== undefined && !isIntArray(d.notes, cells, full)) return null
  if (!isMoves(d.history, cells, N, full) || !isMoves(d.future, cells, N, full)) return null
  if (typeof d.elapsedMs !== 'number' || !(d.elapsedMs >= 0) || typeof d.completed !== 'boolean') return null
  return d as GameData
}

export function saveGame(data: GameData): void {
  write(GAME_KEY, data)
}

/** Keeps only entries naming a box size and a level that size offers. */
function validLevels(raw: unknown): Partial<Record<BoxSize, Level>> {
  const out: Partial<Record<BoxSize, Level>> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const n of BOX_SIZES) {
    const level = (raw as Record<string, unknown>)[n]
    if (isLevel(level) && levelsFor(n).includes(level)) out[n] = level
  }
  return out
}

export function loadSettings(): Settings {
  const s = read(SETTINGS_KEY) as Partial<Settings> | null
  return {
    n: s && typeof s.n === 'number' && isBoxSize(s.n) ? s.n : DEFAULT_BOX_SIZE,
    theme: s && isTheme(s.theme) ? s.theme : 'system',
    levels: validLevels(s?.levels),
    cleanNotes: s && typeof s.cleanNotes === 'boolean' ? s.cleanNotes : true,
  }
}

/** Merges the given fields into the stored settings, so each caller writes only what it owns. */
export function saveSettings(patch: Partial<Settings>): void {
  write(SETTINGS_KEY, { ...loadSettings(), ...patch })
}
