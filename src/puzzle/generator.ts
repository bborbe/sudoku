// Seeded puzzle generator, generic in box size: a puzzle ID names the box size and seed, and the same ID
// always yields the same givens and solution.
//
// 1. Full solution: the canonical pattern grid, scrambled by the seed (bands, rows within bands, stacks,
//    columns within stacks, symbols) — every permutation keeps it valid, and it is instant at any size.
// 2. Clues, for a puzzle with a difficulty level (ID `<n>-<level>-<seed>`): see generateLevel — carve,
//    rate with the logical solver, and retry from the same seeded stream until the rating is the level.
//    A legacy ID `<n>-<seed>` (the MVP's only kind) keeps its original carving: remove cells in seeded order
//    while singles alone still solve the puzzle (so it has exactly one solution), down to a medium clue target.
import { sizeOf, type Size } from '../engine/size'
import { clampLevel, CLUES, isLevel, levelOf, tierOf, type Level } from './difficulty'
import { MAX_TIER, solveLogically } from './logic'
import { mulberry32, shuffle, type Rng } from './rng'
import { countSolutions, solveBySingles } from './solver'

export interface ClueRange {
  min: number
  max: number
}

/** Clue fraction of a classic 9×9 medium puzzle (32–37 of 81 clues), applied to every board size. */
export const MEDIUM = { min: 32 / 81, max: 37 / 81 } as const

/** The clue range for a board size: the fraction range scaled by cell count, at least one integer wide. */
export function clueRange(n: number, fraction: { min: number; max: number } = MEDIUM): ClueRange {
  const { cells } = sizeOf(n)
  const min = Math.ceil(cells * fraction.min)
  const max = Math.max(min, Math.floor(cells * fraction.max))
  return { min, max }
}

export interface Puzzle {
  id: string
  n: number
  givens: number[]
  solution: number[]
  clues: number
  /** The level the logical solver rates the puzzle at — for a levelled puzzle, the requested one. */
  level: Level
}

/** `<n>-<seed>` for a legacy puzzle, `<n>-<level>-<seed>` for one generated at a difficulty level. */
export function puzzleId(n: number, seed: number, level?: Level): string {
  return `${n}-${level ? `${level}-` : ''}${(seed >>> 0).toString(36)}`
}

export function parsePuzzleId(id: string): { n: number; seed: number; level?: Level } | null {
  const m = /^([2-5])-(?:([a-z]+)-)?([0-9a-z]{1,7})$/.exec(id)
  if (!m || (m[2] !== undefined && !isLevel(m[2]))) return null
  const seed = parseInt(m[3], 36)
  if (!Number.isSafeInteger(seed) || seed > 0xffffffff) return null
  return m[2] ? { n: Number(m[1]), seed, level: m[2] as Level } : { n: Number(m[1]), seed }
}

export function randomSeed(): number {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0]
}

function scrambledSolution(size: Size, rng: Rng): number[] {
  const { n, N } = size
  const order = (k: number) => shuffle(Array.from({ length: k }, (_, i) => i), rng)
  const rows: number[] = []
  const cols: number[] = []
  for (const band of order(n)) for (const r of order(n)) rows.push(band * n + r)
  for (const stack of order(n)) for (const c of order(n)) cols.push(stack * n + c)
  const symbols = shuffle(
    Array.from({ length: N }, (_, i) => i + 1),
    rng,
  )
  const out = new Array<number>(N * N)
  for (let i = 0; i < N; i++) {
    const r = rows[i]
    for (let j = 0; j < N; j++) {
      // Canonical pattern: (n·(r mod n) + ⌊r/n⌋ + c) mod N is a valid grid for any n.
      out[i * N + j] = symbols[(n * (r % n) + Math.floor(r / n) + cols[j]) % N]
    }
  }
  return out
}

/** A puzzle for the ID's box size and seed — at a difficulty level when one is given, else the legacy kind. */
export function generate(n: number, seed: number, level?: Level): Puzzle {
  return level ? generateLevel(n, seed, clampLevel(n, level)) : generateLegacy(n, seed)
}

function generateLegacy(n: number, seed: number): Puzzle {
  const size = sizeOf(n)
  const range = clueRange(n)
  const rng = mulberry32(seed)
  const solution = scrambledSolution(size, rng)
  const target = range.min + Math.floor(rng() * (range.max - range.min + 1))
  const givens = solution.slice()
  let clues = size.cells
  for (const i of shuffle(
    Array.from({ length: size.cells }, (_, k) => k),
    rng,
  )) {
    if (clues <= target) break
    const keep = givens[i]
    givens[i] = 0
    if (solveBySingles(size, givens)) clues--
    else givens[i] = keep
  }
  const rated = solveLogically(size, givens)
  return { id: puzzleId(n, seed), n, givens, solution, clues, level: levelOf(rated.solution !== null, rated.tier) }
}

/**
 * Tries before a levelled puzzle settles for its last attempt. Measured worst cases are far below: 168 tries
 * for 9×9 Medium over 200 seeds, 2 for 25×25. A settled puzzle still reports its true rating in `level`.
 */
function maxAttempts(size: Size): number {
  return size.n <= 3 ? 1000 : 20
}

/**
 * Each attempt: a fresh scrambled solution, then clues carved to the level's clue target, then a rating by the
 * logical solver; it is kept when the rating is the requested level and the clues fit the level's range.
 *
 * 9×9 carves for uniqueness: remove clues in seeded order while the backtracking counter still
 * finds one solution, down to the level's minimum, then put removed clues back (latest first) until the
 * techniques up to the level's tier solve it — so the result sits right at the level's edge. Extreme skips
 * the putting-back and is kept only when no technique finishes it.
 * Other boards carve under the technique cap instead (remove while the techniques up to the tier still solve
 * it, down to a target drawn in the range): the backtracking counter is too slow at 256+ cells, and 4×4's
 * one-value clue range leaves no room to put clues back.
 */
function generateLevel(n: number, seed: number, level: Level): Puzzle {
  const size = sizeOf(n)
  const range = clueRange(n, CLUES[level])
  const tier = tierOf(level)
  const rng = mulberry32(seed)
  const attempts = maxAttempts(size)
  let last: Puzzle | null = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    const solution = scrambledSolution(size, rng)
    const givens = size.n === 3 ? carveUnique(size, solution, rng, range, level) : carveCapped(size, solution, rng, range, tier)
    const clues = givens.reduce((k, v) => k + (v ? 1 : 0), 0)
    const rated = solveLogically(size, givens)
    const got = levelOf(rated.solution !== null, rated.tier)
    last = { id: puzzleId(n, seed, level), n, givens, solution, clues, level: got }
    if (got === level && clues >= range.min && clues <= range.max) break
  }
  return last!
}

function carveUnique(size: Size, solution: number[], rng: Rng, range: ClueRange, level: Level): number[] {
  const givens = solution.slice()
  const target = level === 'easy' ? range.min + Math.floor(rng() * (range.max - range.min + 1)) : range.min
  const removed: number[] = []
  let clues = size.cells
  for (const i of shuffle(
    Array.from({ length: size.cells }, (_, k) => k),
    rng,
  )) {
    if (clues <= target) break
    const keep = givens[i]
    givens[i] = 0
    if (countSolutions(size, givens, 2).count === 1) {
      removed.push(i)
      clues--
    } else givens[i] = keep
  }
  const tier = tierOf(level)
  if (tier > MAX_TIER) return givens
  for (let j = removed.length - 1; j >= 0 && !solveLogically(size, givens, tier).solution; j--) givens[removed[j]] = solution[removed[j]]
  return givens
}

function carveCapped(size: Size, solution: number[], rng: Rng, range: ClueRange, tier: number): number[] {
  const givens = solution.slice()
  const target = range.min + Math.floor(rng() * (range.max - range.min + 1))
  let clues = size.cells
  for (const i of shuffle(
    Array.from({ length: size.cells }, (_, k) => k),
    rng,
  )) {
    if (clues <= target) break
    const keep = givens[i]
    givens[i] = 0
    if (solveLogically(size, givens, tier).solution) clues--
    else givens[i] = keep
  }
  return givens
}

export function generateById(id: string): Puzzle | null {
  const parsed = parsePuzzleId(id)
  return parsed ? generate(parsed.n, parsed.seed, parsed.level) : null
}
