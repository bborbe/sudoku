// Logical solver: solves the way a person does, with pencil-mark techniques, and reports the hardest
// technique it needed. Generic in box size. Every technique is sound on its own (none assumes a unique
// solution), so a grid this solver completes has exactly one solution.
//
// Each step applies the easiest technique that makes progress, then starts again from the easiest; the
// tier is the highest technique tier used. A grid the techniques up to the cap cannot finish is unsolved.
import type { Size } from '../engine/size'

/** Highest technique tier; a grid that needs more than this is beyond the logical solver. */
export const MAX_TIER = 4

export interface LogicResult {
  /** The completed grid, or null when the techniques up to the cap run out first (or the givens clash). */
  solution: number[] | null
  /** Highest tier used; −1 when nothing was left to solve. */
  tier: number
  /** Steps taken per technique name. */
  used: Record<string, number>
}

/** One step of the solver, as handed to solveLogically's onStep. */
export interface LogicStep {
  technique: string
  tier: number
  /** The cell a single filled, or −1 for a step that only removed candidates. */
  cell: number
  /** The digit placed in cell, or 0. */
  digit: number
  /** The unit (index into size.units) a hidden single was found in, or −1. */
  unit: number
}

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

function bitValue(bit: number): number {
  return 32 - Math.clz32(bit)
}

/**
 * Looks for k of the masks (each with 2…k bits) whose union has exactly k bits, and hands each such pick
 * (as a bitmask of indices) with its union to found, until found returns true. Shared by naked subsets
 * (cells → digits), hidden subsets (digits → cells) and fish (lines → crossing lines).
 */
function eachSubset(masks: ArrayLike<number>, k: number, found: (pick: number, union: number) => boolean): boolean {
  const idx: number[] = []
  for (let i = 0; i < masks.length; i++) {
    const c = popcount(masks[i])
    if (c >= 2 && c <= k) idx.push(i)
  }
  if (idx.length < k) return false
  const rec = (start: number, depth: number, pick: number, union: number): boolean => {
    if (depth === k) return popcount(union) === k && found(pick, union)
    for (let j = start; j <= idx.length - (k - depth); j++) {
      const u = union | masks[idx[j]]
      if (popcount(u) <= k && rec(j + 1, depth + 1, pick | (1 << idx[j]), u)) return true
    }
    return false
  }
  return rec(0, 0, 0, 0)
}

/** Technique tiers: [name, tier]. The tier of the hardest technique a grid needs is its rating. */
export const TECHNIQUES: readonly (readonly [string, number])[] = [
  ['hidden single', 0],
  ['naked single', 1],
  ['locked candidates', 2],
  ['naked pair', 2],
  ['hidden pair', 2],
  ['naked triple', 3],
  ['hidden triple', 3],
  ['x-wing', 3],
  ['xy-wing', 3],
  ['naked quad', 4],
  ['hidden quad', 4],
  ['swordfish', 4],
  ['jellyfish', 4],
  ['xyz-wing', 4],
  ['simple coloring', 4],
]

/**
 * Solves grid with techniques up to tier cap. onStep sees every step in order; returning true stops the run
 * there (the result then has no solution) — the hint engine stops at the first placement.
 */
export function solveLogically(size: Size, grid: ArrayLike<number>, cap: number = MAX_TIER, onStep?: (step: LogicStep) => boolean): LogicResult {
  const { N, cells, row, col, box, full, units, peers } = size
  const v = Int32Array.from(grid)
  const cand = new Int32Array(cells)
  const used: Record<string, number> = {}
  let tier = -1
  let left = 0
  let placed = -1
  let placedUnit = -1

  for (let i = 0; i < cells; i++) if (!v[i]) cand[i] = full
  for (let i = 0; i < cells; i++) {
    if (!v[i]) {
      left++
      continue
    }
    const b = 1 << (v[i] - 1)
    for (const p of peers[i]) {
      if (v[p] === v[i]) return { solution: null, tier, used }
      cand[p] &= ~b
    }
  }

  const place = (i: number, b: number) => {
    v[i] = bitValue(b)
    placed = i
    cand[i] = 0
    left--
    for (const p of peers[i]) cand[p] &= ~b
  }
  /** Removes bits from cell i's candidates; true when anything changed. */
  const remove = (i: number, bits: number): boolean => {
    if (!(cand[i] & bits)) return false
    cand[i] &= ~bits
    return true
  }
  const sees = (a: number, b: number) => a !== b && (row[a] === row[b] || col[a] === col[b] || box[a] === box[b])

  const hiddenSingle = (): boolean => {
    for (let ui = 0; ui < units.length; ui++) {
      const u = units[ui]
      let once = 0
      let twice = 0
      for (const i of u) {
        twice |= once & cand[i]
        once |= cand[i]
      }
      const hidden = once & ~twice
      if (!hidden) continue
      const b = hidden & -hidden
      for (const i of u) {
        if (cand[i] & b) {
          place(i, b)
          placedUnit = ui
          return true
        }
      }
    }
    return false
  }

  const nakedSingle = (): boolean => {
    for (let i = 0; i < cells; i++) {
      const m = cand[i]
      if (m && (m & (m - 1)) === 0) {
        place(i, m)
        return true
      }
    }
    return false
  }

  // Pointing: a digit confined to one row or column inside a box leaves the rest of that line.
  // Claiming: a digit confined to one box inside a row or column leaves the rest of that box.
  const lockedCandidates = (): boolean => {
    for (let u = 0; u < units.length; u++) {
      const isBox = u >= 2 * N
      for (let d = 0; d < N; d++) {
        const b = 1 << d
        let first = -1
        let sameRow = true
        let sameCol = true
        let sameBox = true
        for (const i of units[u]) {
          if (!(cand[i] & b)) continue
          if (first < 0) first = i
          else {
            sameRow &&= row[i] === row[first]
            sameCol &&= col[i] === col[first]
            sameBox &&= box[i] === box[first]
          }
        }
        if (first < 0) continue
        let changed = false
        if (isBox && (sameRow || sameCol)) {
          for (const i of sameRow ? units[row[first]] : units[N + col[first]]) if (box[i] !== box[first]) changed = remove(i, b) || changed
        } else if (!isBox && sameBox) {
          const line = u < N ? row : col
          for (const i of units[2 * N + box[first]]) if (line[i] !== line[first]) changed = remove(i, b) || changed
        }
        if (changed) return true
      }
    }
    return false
  }

  const masks = new Int32Array(N)

  const nakedSubset = (k: number): boolean => {
    for (const u of units) {
      for (let j = 0; j < N; j++) masks[j] = cand[u[j]]
      const hit = eachSubset(masks, k, (pick, digits) => {
        let changed = false
        for (let j = 0; j < N; j++) if (!(pick & (1 << j))) changed = remove(u[j], digits) || changed
        return changed
      })
      if (hit) return true
    }
    return false
  }

  const hiddenSubset = (k: number): boolean => {
    for (const u of units) {
      masks.fill(0) // digit → its positions within the unit
      for (let j = 0; j < N; j++) {
        let m = cand[u[j]]
        while (m) {
          const b = m & -m
          m ^= b
          masks[bitValue(b) - 1] |= 1 << j
        }
      }
      const hit = eachSubset(masks, k, (digits, positions) => {
        let changed = false
        for (let j = 0; j < N; j++) if (positions & (1 << j)) changed = remove(u[j], full & ~digits) || changed
        return changed
      })
      if (hit) return true
    }
    return false
  }

  // Fish of size k: k rows whose candidates for a digit lie in exactly k columns clear that digit from the
  // rest of those columns; the same with rows and columns swapped. X-wing is k = 2, swordfish 3, jellyfish 4.
  const fish = (k: number): boolean => {
    for (let d = 0; d < N; d++) {
      const b = 1 << d
      for (const byRow of [true, false]) {
        const at = (line: number, x: number) => (byRow ? line * N + x : x * N + line)
        for (let line = 0; line < N; line++) {
          let m = 0
          for (let x = 0; x < N; x++) if (cand[at(line, x)] & b) m |= 1 << x
          masks[line] = m
        }
        const hit = eachSubset(masks, k, (lines, cross) => {
          let changed = false
          for (let x = 0; x < N; x++) {
            if (!(cross & (1 << x))) continue
            for (let line = 0; line < N; line++) if (!(lines & (1 << line))) changed = remove(at(line, x), b) || changed
          }
          return changed
        })
        if (hit) return true
      }
    }
    return false
  }

  // XY-wing: pivot {x,y} sees pincers {x,z} and {y,z}; z leaves every cell that sees both pincers.
  // XYZ-wing: pivot {x,y,z}, same pincers; z leaves every cell that sees the pivot and both pincers.
  const wing = (pivotBits: 2 | 3): boolean => {
    for (let p = 0; p < cells; p++) {
      const pm = cand[p]
      if (popcount(pm) !== pivotBits) continue
      const ps = peers[p]
      for (let a = 0; a < ps.length; a++) {
        const am = cand[ps[a]]
        if (popcount(am) !== 2) continue
        for (let c = a + 1; c < ps.length; c++) {
          const cm = cand[ps[c]]
          const z = am & cm
          if (popcount(cm) !== 2 || am === cm || popcount(z) !== 1) continue
          if (pivotBits === 2 ? pm & z || (am | cm) !== (pm | z) : (am | cm) !== pm) continue
          let changed = false
          for (const t of peers[ps[a]]) {
            if (t === p || !sees(t, ps[c]) || (pivotBits === 3 && !sees(t, p))) continue
            changed = remove(t, z) || changed
          }
          if (changed) return true
        }
      }
    }
    return false
  }

  // Simple coloring: for one digit, link cells that are its only two places in some unit and colour each chain
  // in two alternating colours — exactly one colour is true. A colour that sees itself is false (wrap); a cell
  // that sees both colours of one chain cannot hold the digit (trap).
  const color = new Int32Array(cells)
  const coloring = (): boolean => {
    for (let d = 0; d < N; d++) {
      const b = 1 << d
      const links: number[][] = Array.from({ length: cells }, () => [])
      for (const u of units) {
        let a = -1
        let c = -1
        let count = 0
        for (const i of u) {
          if (!(cand[i] & b)) continue
          if (++count === 1) a = i
          else c = i
        }
        if (count === 2) {
          links[a].push(c)
          links[c].push(a)
        }
      }
      color.fill(0)
      let chain = 0
      for (let s = 0; s < cells; s++) {
        if (color[s] || !links[s].length) continue
        chain += 2 // this chain's two colours are chain − 1 and chain
        const members: number[] = [s]
        color[s] = chain - 1
        for (let q = 0; q < members.length; q++) {
          const i = members[q]
          for (const j of links[i]) {
            if (color[j]) continue
            color[j] = color[i] === chain - 1 ? chain : chain - 1
            members.push(j)
          }
        }
        for (const shade of [chain - 1, chain]) {
          const same = members.filter((i) => color[i] === shade)
          if (same.some((i, x) => same.some((j, y) => y > x && sees(i, j)))) {
            let changed = false
            for (const i of same) changed = remove(i, b) || changed
            if (changed) return true
          }
        }
        let changed = false
        for (let t = 0; t < cells; t++) {
          if (!(cand[t] & b) || color[t] === chain - 1 || color[t] === chain) continue
          let seesA = false
          let seesB = false
          for (const i of members) {
            if (!sees(t, i)) continue
            if (color[i] === chain - 1) seesA = true
            else seesB = true
          }
          if (seesA && seesB) changed = remove(t, b) || changed
        }
        if (changed) return true
      }
    }
    return false
  }

  const steps: Record<string, () => boolean> = {
    'hidden single': hiddenSingle,
    'naked single': nakedSingle,
    'locked candidates': lockedCandidates,
    'naked pair': () => nakedSubset(2),
    'hidden pair': () => hiddenSubset(2),
    'naked triple': () => nakedSubset(3),
    'hidden triple': () => hiddenSubset(3),
    'x-wing': () => fish(2),
    'xy-wing': () => wing(2),
    'naked quad': () => nakedSubset(4),
    'hidden quad': () => hiddenSubset(4),
    swordfish: () => fish(3),
    jellyfish: () => fish(4),
    'xyz-wing': () => wing(3),
    'simple coloring': coloring,
  }

  while (left > 0) {
    for (let i = 0; i < cells; i++) if (!v[i] && !cand[i]) return { solution: null, tier, used }
    let progressed = false
    for (const [name, t] of TECHNIQUES) {
      if (t > cap) break
      placed = -1
      placedUnit = -1
      if (steps[name]()) {
        used[name] = (used[name] ?? 0) + 1
        if (t > tier) tier = t
        progressed = true
        if (onStep?.({ technique: name, tier: t, cell: placed, digit: placed < 0 ? 0 : v[placed], unit: placedUnit })) return { solution: null, tier, used }
        break
      }
    }
    if (!progressed) return { solution: null, tier, used }
  }
  return { solution: Array.from(v), tier, used }
}
