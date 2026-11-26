// The puzzle ids this browser has already dealt (sudoku.seen), newest last, so a return to a solved puzzle's own
// URL can deal a fresh one instead of re-dealing the same grid. Bounded: past MAX_SEEN the oldest id falls off.
// Every read is defensive — a corrupt or foreign value is treated as absent, never thrown into the UI — and an id
// already held keeps its place, so a resume load never reorders the ring.
import { parsePuzzleId } from '../puzzle/generator'

const SEEN_KEY = 'sudoku.seen'

/** How many dealt puzzle ids the ring holds; the oldest falls off once it is full. */
export const MAX_SEEN = 300

/** The ids held, oldest first; entries that are not puzzle ids are dropped. */
export function loadSeen(): string[] {
  let raw: unknown = null
  try {
    raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null')
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const seen = raw.filter((id): id is string => typeof id === 'string' && parsePuzzleId(id) !== null)
  return seen.length > MAX_SEEN ? seen.slice(seen.length - MAX_SEEN) : seen
}

/** Records a dealt puzzle. An id already held is left where it is, so re-showing a puzzle never reorders the ring. */
export function markSeen(id: string): void {
  if (parsePuzzleId(id) === null) return
  const seen = loadSeen()
  if (seen.includes(id)) return
  seen.push(id)
  if (seen.length > MAX_SEEN) seen.splice(0, seen.length - MAX_SEEN)
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    // Storage full or blocked: the puzzle still plays, it just may be dealt again after a reload.
  }
}

/** Whether this browser has already dealt `id`. */
export function isSeen(id: string): boolean {
  return loadSeen().includes(id)
}
