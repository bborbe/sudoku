// localStorage persistence: the unfinished game and the settings. Every read is defensive — a corrupt or
// foreign value is treated as absent, never thrown into the UI.
import type { GameData } from '../engine/game'
import { BOX_SIZES, DEFAULT_BOX_SIZE, isBoxSize, sizeOf, type BoxSize } from '../engine/size'
import { isLevel, levelsFor, type Level } from '../puzzle/difficulty'

const GAME_KEY = 'sudoku.game'
const SETTINGS_KEY = 'sudoku.settings'

export interface Settings {
  n: BoxSize
  /** The difficulty last picked for each board size; a size never picked has no entry. */
  levels: Partial<Record<BoxSize, Level>>
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

const isMoves = (a: unknown, cells: number, max: number): boolean =>
  Array.isArray(a) &&
  a.every(
    (m) =>
      m &&
      typeof m === 'object' &&
      Number.isInteger(m.cell) &&
      m.cell >= 0 &&
      m.cell < cells &&
      Number.isInteger(m.from) &&
      m.from >= 0 &&
      m.from <= max &&
      Number.isInteger(m.to) &&
      m.to >= 0 &&
      m.to <= max,
  )

export function loadGame(): GameData | null {
  const d = read(GAME_KEY) as Partial<GameData> | null
  if (!d || typeof d !== 'object' || typeof d.n !== 'number' || !isBoxSize(d.n)) return null
  const { N, cells } = sizeOf(d.n)
  if (typeof d.puzzleId !== 'string') return null
  if (!isIntArray(d.givens, cells, N) || !isIntArray(d.solution, cells, N) || !isIntArray(d.values, cells, N)) return null
  if (!isMoves(d.history, cells, N) || !isMoves(d.future, cells, N)) return null
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
    levels: validLevels(s?.levels),
  }
}

/** Merges the given fields into the stored settings, so each caller writes only what it owns. */
export function saveSettings(patch: Partial<Settings>): void {
  write(SETTINGS_KEY, { ...loadSettings(), ...patch })
}
