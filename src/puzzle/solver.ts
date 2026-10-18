// Two solvers over a flat grid (0 = empty, 1…N = symbol), generic in box size.
// countSolutions: bitmask backtracking with most-constrained-cell choice — the uniqueness check.
// solveBySingles: naked + hidden singles only — every value it places is forced, so a grid it completes
// has exactly one solution. The generator removes clues while this stays true.
import type { Size } from '../engine/size'

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

function bitValue(bit: number): number {
  return 32 - Math.clz32(bit)
}

export interface CountResult {
  /** Solutions found, capped at the limit. */
  count: number
  /** The first solution found, or null when there is none. */
  first: number[] | null
}

/** Counts solutions up to limit. A grid whose givens already clash has none. */
export function countSolutions(size: Size, grid: ArrayLike<number>, limit = 2): CountResult {
  const { N, cells, row, col, box, full } = size
  const v = Int32Array.from(grid)
  const R = new Int32Array(N)
  const C = new Int32Array(N)
  const B = new Int32Array(N)
  const empty: number[] = []
  for (let i = 0; i < cells; i++) {
    const d = v[i]
    if (!d) {
      empty.push(i)
      continue
    }
    const b = 1 << (d - 1)
    if ((R[row[i]] | C[col[i]] | B[box[i]]) & b) return { count: 0, first: null }
    R[row[i]] |= b
    C[col[i]] |= b
    B[box[i]] |= b
  }
  const E = Int32Array.from(empty)
  let count = 0
  let first: number[] | null = null

  // E[0..k) are placed; pick the most constrained cell among the rest and try each candidate.
  const rec = (k: number): boolean => {
    if (k === E.length) {
      count++
      if (!first) first = Array.from(v)
      return count >= limit
    }
    let best = -1
    let bestCount = N + 1
    let bestMask = 0
    for (let j = k; j < E.length; j++) {
      const i = E[j]
      const m = full & ~(R[row[i]] | C[col[i]] | B[box[i]])
      const c = popcount(m)
      if (c < bestCount) {
        best = j
        bestCount = c
        bestMask = m
        if (c < 2) break
      }
    }
    if (bestCount === 0) return false
    const t = E[k]
    E[k] = E[best]
    E[best] = t
    const i = E[k]
    const r = row[i]
    const c = col[i]
    const x = box[i]
    let m = bestMask
    while (m) {
      const b = m & -m
      m ^= b
      R[r] |= b
      C[c] |= b
      B[x] |= b
      v[i] = bitValue(b)
      const stop = rec(k + 1)
      R[r] &= ~b
      C[c] &= ~b
      B[x] &= ~b
      if (stop) {
        v[i] = 0
        return true
      }
    }
    v[i] = 0
    return false
  }
  rec(0)
  return { count, first }
}

/** Fills the grid using naked and hidden singles alone; returns the solution, or null when that is not enough. */
export function solveBySingles(size: Size, grid: ArrayLike<number>): number[] | null {
  const { N, cells, row, col, box, full, units } = size
  const v = Int32Array.from(grid)
  const R = new Int32Array(N)
  const C = new Int32Array(N)
  const B = new Int32Array(N)
  let left = 0
  for (let i = 0; i < cells; i++) {
    const d = v[i]
    if (!d) {
      left++
      continue
    }
    const b = 1 << (d - 1)
    if ((R[row[i]] | C[col[i]] | B[box[i]]) & b) return null
    R[row[i]] |= b
    C[col[i]] |= b
    B[box[i]] |= b
  }
  const candidates = (i: number) => full & ~(R[row[i]] | C[col[i]] | B[box[i]])
  const place = (i: number, b: number) => {
    v[i] = bitValue(b)
    R[row[i]] |= b
    C[col[i]] |= b
    B[box[i]] |= b
    left--
  }
  let progress = true
  while (left > 0 && progress) {
    progress = false
    for (let i = 0; i < cells; i++) {
      if (v[i]) continue
      const m = candidates(i)
      if (!m) return null
      if ((m & (m - 1)) === 0) {
        place(i, m)
        progress = true
      }
    }
    for (const u of units) {
      let once = 0
      let twice = 0
      for (const i of u) {
        if (v[i]) continue
        const m = candidates(i)
        twice |= once & m
        once |= m
      }
      let hidden = once & ~twice
      while (hidden) {
        const b = hidden & -hidden
        hidden ^= b
        for (const i of u) {
          if (!v[i] && candidates(i) & b) {
            place(i, b)
            progress = true
            break
          }
        }
      }
    }
  }
  return left === 0 ? Array.from(v) : null
}
