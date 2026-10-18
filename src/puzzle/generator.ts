// Seeded puzzle generator, generic in box size: a puzzle ID names the box size and seed, and the same ID
// always yields the same givens and solution.
//
// 1. Full solution: the canonical pattern grid, scrambled by the seed (bands, rows within bands, stacks,
//    columns within stacks, symbols) — every permutation keeps it valid, and it is instant at any size.
// 2. Clues: remove cells in seeded order while the puzzle stays solvable by singles alone (so it has
//    exactly one solution), until the clue target is reached.
import { sizeOf, type Size } from '../engine/size'
import { mulberry32, shuffle, type Rng } from './rng'
import { solveBySingles } from './solver'

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
}

export function puzzleId(n: number, seed: number): string {
  return `${n}-${(seed >>> 0).toString(36)}`
}

export function parsePuzzleId(id: string): { n: number; seed: number } | null {
  const m = /^([2-5])-([0-9a-z]{1,7})$/.exec(id)
  if (!m) return null
  const seed = parseInt(m[2], 36)
  if (!Number.isSafeInteger(seed) || seed > 0xffffffff) return null
  return { n: Number(m[1]), seed }
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

export function generate(n: number, seed: number, range: ClueRange = clueRange(n)): Puzzle {
  const size = sizeOf(n)
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
  return { id: puzzleId(n, seed), n, givens, solution, clues }
}

export function generateById(id: string): Puzzle | null {
  const parsed = parsePuzzleId(id)
  return parsed ? generate(parsed.n, parsed.seed) : null
}
