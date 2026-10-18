// localStorage persistence: the unfinished game and the settings. Every read is defensive — a corrupt or
// foreign value is treated as absent, never thrown into the UI.
import type { GameData } from '../engine/game'
import { DEFAULT_BOX_SIZE, isBoxSize, sizeOf, type BoxSize } from '../engine/size'

const GAME_KEY = 'sudoku.game'
const SETTINGS_KEY = 'sudoku.settings'

export type Theme = 'system' | 'light' | 'dark'
export const THEMES: readonly Theme[] = ['system', 'light', 'dark']
const isTheme = (t: unknown): t is Theme => typeof t === 'string' && (THEMES as readonly string[]).includes(t)

export interface Settings {
  n: BoxSize
  // 'system' follows prefers-color-scheme. index.html reads this field before first paint, so keep its name.
  theme: Theme
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

export function loadSettings(): Settings {
  const s = read(SETTINGS_KEY) as Partial<Settings> | null
  return {
    n: s && typeof s.n === 'number' && isBoxSize(s.n) ? s.n : DEFAULT_BOX_SIZE,
    theme: s && isTheme(s.theme) ? s.theme : 'system',
  }
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings)
}
