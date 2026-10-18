// Board geometry for box size n: an N×N grid (N = n²) of n×n boxes, symbols 1…N.
// Every other module takes its dimensions from here — nothing hard-codes 9.

export const BOX_SIZES = [2, 3, 4, 5] as const
export type BoxSize = (typeof BOX_SIZES)[number]
export const DEFAULT_BOX_SIZE: BoxSize = 3

export interface Size {
  readonly n: number
  /** Side length and symbol count, n². */
  readonly N: number
  /** Cell count, N². */
  readonly cells: number
  readonly row: Int32Array
  readonly col: Int32Array
  readonly box: Int32Array
  /** Bitmask with one bit per symbol: bit d-1 stands for symbol d. */
  readonly full: number
  /** The N rows, N columns and N boxes, each as its N cell indices. */
  readonly units: readonly Int32Array[]
  /** For each cell, every other cell sharing its row, column or box. */
  readonly peers: readonly Int32Array[]
}

const cache = new Map<number, Size>()

export function isBoxSize(n: number): n is BoxSize {
  return (BOX_SIZES as readonly number[]).includes(n)
}

export function sizeOf(n: number): Size {
  const hit = cache.get(n)
  if (hit) return hit
  if (!isBoxSize(n)) throw new Error(`unsupported box size ${n}`)
  const N = n * n
  const cells = N * N
  const row = new Int32Array(cells)
  const col = new Int32Array(cells)
  const box = new Int32Array(cells)
  for (let i = 0; i < cells; i++) {
    const r = Math.floor(i / N)
    const c = i % N
    row[i] = r
    col[i] = c
    box[i] = Math.floor(r / n) * n + Math.floor(c / n)
  }
  const units: Int32Array[] = []
  for (let r = 0; r < N; r++) units.push(Int32Array.from({ length: N }, (_, c) => r * N + c))
  for (let c = 0; c < N; c++) units.push(Int32Array.from({ length: N }, (_, r) => r * N + c))
  for (let b = 0; b < N; b++) {
    const r0 = Math.floor(b / n) * n
    const c0 = (b % n) * n
    units.push(Int32Array.from({ length: N }, (_, k) => (r0 + Math.floor(k / n)) * N + c0 + (k % n)))
  }
  const peers: Int32Array[] = []
  for (let i = 0; i < cells; i++) {
    const set = new Set<number>()
    for (const u of [units[row[i]], units[N + col[i]], units[2 * N + box[i]]]) for (const j of u) set.add(j)
    set.delete(i)
    peers.push(Int32Array.from(set))
  }
  const size: Size = { n, N, cells, row, col, box, full: 2 ** N - 1, units, peers }
  cache.set(n, size)
  return size
}

/** Display symbol for value d (1…N): 1–9, then letters A, B, … */
export function symbolOf(d: number): string {
  return d <= 9 ? String(d) : String.fromCharCode(64 + d - 9)
}

/** Value for a typed symbol on a board of N symbols, or 0 when the key is not a symbol there. */
export function valueOf(key: string, N: number): number {
  if (key.length !== 1) return 0
  let d = 0
  if (key >= '1' && key <= '9') d = key.charCodeAt(0) - 48
  else {
    const up = key.toUpperCase()
    if (up >= 'A' && up <= 'Z') d = up.charCodeAt(0) - 64 + 9
  }
  return d >= 1 && d <= N ? d : 0
}
