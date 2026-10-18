// Difficulty levels, sudoku.com style. A level is the hardest technique tier the logical solver needs
// (see logic.ts); Extreme is beyond every technique it knows, though still with exactly one solution.
// Each level also has a clue target — the 9×9 range below, scaled by cell count for other board sizes.
import { MAX_TIER } from './logic'

export const LEVELS = ['easy', 'medium', 'hard', 'expert', 'master', 'extreme'] as const
export type Level = (typeof LEVELS)[number]

export const LEVEL_LABELS: Record<Level, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
  master: 'Master',
  extreme: 'Extreme',
}

/** Clue fractions per level, from the 9×9 counts (e.g. Easy 38–45 of 81). */
export const CLUES: Record<Level, { min: number; max: number }> = {
  easy: { min: 38 / 81, max: 45 / 81 },
  medium: { min: 32 / 81, max: 37 / 81 },
  hard: { min: 27 / 81, max: 31 / 81 },
  expert: { min: 22 / 81, max: 28 / 81 },
  master: { min: 17 / 81, max: 28 / 81 },
  extreme: { min: 17 / 81, max: 28 / 81 },
}

/**
 * Levels each box size offers. 4×4 is too small to need more than hidden singles; on 16×16 and 25×25 the
 * harder levels cannot be generated within the time budget (measured: 16×16 Expert ≥ 0.6 s per try with
 * most tries missing, 25×25 Hard ≈ 11 s), so those boards stop where generation stays fast.
 */
const BY_SIZE: Record<number, readonly Level[]> = {
  2: ['easy'],
  3: LEVELS,
  4: ['easy', 'medium', 'hard'],
  5: ['easy', 'medium'],
}

export function isLevel(x: unknown): x is Level {
  return typeof x === 'string' && (LEVELS as readonly string[]).includes(x)
}

export function levelsFor(n: number): readonly Level[] {
  return BY_SIZE[n] ?? ['easy']
}

/** The level a board size opens with: Medium where offered, else its easiest. */
export function defaultLevel(n: number): Level {
  const levels = levelsFor(n)
  return levels.includes('medium') ? 'medium' : levels[0]
}

/** The hardest offered level at or below the requested one. */
export function clampLevel(n: number, level: Level): Level {
  const levels = levelsFor(n)
  const want = tierOf(level)
  return [...levels].reverse().find((l) => tierOf(l) <= want) ?? levels[0]
}

/** Technique tier a level stands for; Extreme is one past the solver's hardest tier. */
export function tierOf(level: Level): number {
  return LEVELS.indexOf(level)
}

/** The level a logical-solver outcome rates as. */
export function levelOf(solved: boolean, tier: number): Level {
  return solved ? LEVELS[Math.min(Math.max(tier, 0), MAX_TIER)] : 'extreme'
}
