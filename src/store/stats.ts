// Solve statistics per board size × level, kept in localStorage (sudoku.stats). Counts only — no streaks, so a
// missed day never costs the player anything.
import { BOX_SIZES, type BoxSize } from '../engine/size'
import { isLevel, levelsFor, type Level } from '../puzzle/difficulty'

const STATS_KEY = 'sudoku.stats'

export interface Stat {
  solved: number
  bestMs: number
  totalMs: number
}

export type Stats = Partial<Record<string, Stat>>

export const statKey = (n: BoxSize, level: Level): string => `${n}-${level}`

const isStat = (s: unknown): s is Stat => {
  const v = s as Partial<Stat> | null
  return (
    !!v &&
    typeof v === 'object' &&
    Number.isInteger(v.solved) &&
    (v.solved as number) > 0 &&
    typeof v.bestMs === 'number' &&
    v.bestMs >= 0 &&
    typeof v.totalMs === 'number' &&
    v.totalMs >= v.bestMs
  )
}

/** Keeps only entries naming a size and a level that size offers, with a well-formed record. */
export function loadStats(): Stats {
  let raw: unknown = null
  try {
    raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? 'null')
  } catch {
    return {}
  }
  const out: Stats = {}
  if (!raw || typeof raw !== 'object') return out
  for (const n of BOX_SIZES) {
    for (const level of levelsFor(n)) {
      const s = (raw as Record<string, unknown>)[statKey(n, level)]
      if (isLevel(level) && isStat(s)) out[statKey(n, level)] = s
    }
  }
  return out
}

/** Adds one solve; returns the updated record. */
export function recordSolve(n: BoxSize, level: Level, ms: number): Stat {
  const stats = loadStats()
  const prev = stats[statKey(n, level)]
  const next: Stat = prev
    ? { solved: prev.solved + 1, bestMs: Math.min(prev.bestMs, ms), totalMs: prev.totalMs + ms }
    : { solved: 1, bestMs: ms, totalMs: ms }
  stats[statKey(n, level)] = next
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {
    // Storage full or blocked: the solve still counts for this page, just not across a reload.
  }
  return next
}

export const averageMs = (s: Stat): number => Math.round(s.totalMs / s.solved)
