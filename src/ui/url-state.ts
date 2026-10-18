// URL state: the query mirrors the board size (`size`, the side length N), the difficulty (`level`) and the
// puzzle on screen (`puzzle`), so a reload or a shared link opens the same puzzle at the same settings.
// URL beats localStorage beats the defaults; an unknown or invalid value is dropped as if absent.
// Pure and tested, except syncUrl, which owns history.replaceState (no new history entries).
import { isBoxSize, type BoxSize } from '../engine/size'
import { isLevel, levelsFor, type Level } from '../puzzle/difficulty'
import { parsePuzzleId } from '../puzzle/generator'

export interface UrlState {
  n: BoxSize
  level: Level
  /** The puzzle ID on screen. */
  puzzle: string
}

/** What the query names; each field is present only when its value is valid. */
export interface UrlRequest {
  n?: BoxSize
  level?: Level
  puzzle?: string
}

/** The settings and puzzle the query names. A level the size does not offer is dropped; a puzzle names its own size. */
export function readUrl(search: string): UrlRequest {
  const q = new URLSearchParams(search)
  const out: UrlRequest = {}
  const side = Number(q.get('size'))
  const n = Math.sqrt(side)
  if (Number.isInteger(side) && isBoxSize(n)) out.n = n
  const level = q.get('level')
  if (isLevel(level) && (out.n === undefined || levelsFor(out.n).includes(level))) out.level = level
  const puzzle = q.get('puzzle')
  const parsed = puzzle ? parsePuzzleId(puzzle) : null
  if (puzzle && parsed && isBoxSize(parsed.n)) out.puzzle = puzzle
  return out
}

/** The query for `state`, keeping every other parameter (debug) as it was. */
export function stateQuery(search: string, state: UrlState): string {
  const q = new URLSearchParams(search)
  q.set('size', String(state.n * state.n))
  q.set('level', state.level)
  q.set('puzzle', state.puzzle)
  return `?${q.toString()}`
}

/** Put `state` in the address bar through history.replaceState; a no-op when the query already says it. */
export function syncUrl(state: UrlState): void {
  const q = stateQuery(location.search, state)
  if (q !== location.search) history.replaceState(history.state, '', `${location.pathname}${q}${location.hash}`)
}
