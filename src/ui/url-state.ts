// URL state: the query mirrors the board size (`size`, the side length N), the difficulty (`level`), the
// puzzle on screen (`puzzle`), the theme (`theme`: system / light / dark) and the player's assist overrides
// (`assists`, e.g. `h0s1`; absent when every assist follows the level's default) and the UI language (`lang`: en / de), so a reload or a shared link
// opens the same puzzle at the same settings. A share link adds `beat`, the sender's solve time in whole seconds, as the
// receiver's time to beat; it travels in the URL only.
// URL beats localStorage beats the defaults; an unknown or invalid value is dropped as if absent.
// Pure and tested, except syncUrl, which owns history.replaceState (no new history entries).
import { isBoxSize, type BoxSize } from '../engine/size'
import { isLang, type Lang } from '../i18n'
import { isLevel, levelsFor, type Level } from '../puzzle/difficulty'
import { parsePuzzleId } from '../puzzle/generator'
import { decodeOverrides, encodeOverrides, type AssistOverrides } from '../store/assists'
import { THEMES, type Theme } from '../store/storage'

export interface UrlState {
  n: BoxSize
  level: Level
  /** The puzzle ID on screen. */
  puzzle: string
  theme: Theme
  assists: AssistOverrides
  lang: Lang
  /** The time to beat in whole seconds, kept while its puzzle is on screen. */
  beat?: number
}

/** What the query names; each field is present only when its value is valid. */
export interface UrlRequest {
  n?: BoxSize
  level?: Level
  puzzle?: string
  theme?: Theme
  assists?: AssistOverrides
  lang?: Lang
  /** Seconds; only with a puzzle, since a time means nothing without the puzzle it was set on. */
  beat?: number
}

/** Longest time to beat a link may carry: 99 hours. */
const MAX_BEAT_S = 99 * 3600

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
  const theme = q.get('theme')
  if ((THEMES as readonly (string | null)[]).includes(theme)) out.theme = theme as Theme
  const assists = q.get('assists')
  const overrides = assists === null ? null : decodeOverrides(assists)
  if (overrides) out.assists = overrides
  const lang = q.get('lang')
  if (isLang(lang)) out.lang = lang
  const beat = q.get('beat')
  if (out.puzzle && beat !== null && /^\d+$/.test(beat) && Number(beat) > 0 && Number(beat) <= MAX_BEAT_S) out.beat = Number(beat)
  return out
}

/** The query for `state`, keeping every other parameter (debug) as it was. */
export function stateQuery(search: string, state: UrlState): string {
  const q = new URLSearchParams(search)
  q.set('size', String(state.n * state.n))
  q.set('level', state.level)
  q.set('puzzle', state.puzzle)
  q.set('theme', state.theme)
  q.set('lang', state.lang)
  const assists = encodeOverrides(state.assists)
  if (assists) q.set('assists', assists)
  else q.delete('assists')
  if (state.beat) q.set('beat', String(state.beat))
  else q.delete('beat')
  return `?${q.toString()}`
}

/**
 * Whether a solve of `elapsedMs` beats a time to beat of `beatS` whole seconds. Both sides compare as the whole
 * seconds the clock shows (a share link floors the sender's time the same way), so a tie on screen counts as a beat:
 * 125.9 s vs 125 → beat (both show 02:05); 126 s vs 125 → miss.
 */
export function beatsTarget(elapsedMs: number, beatS: number): boolean {
  return Math.floor(elapsedMs / 1000) <= beatS
}

/** The query of a share link: the puzzle, its size and level, and the sender's time (rounded down to whole seconds) to beat. */
export function shareQuery(n: BoxSize, level: Level, puzzle: string, ms: number): string {
  const q = new URLSearchParams({ size: String(n * n), level, puzzle })
  const beat = Math.min(MAX_BEAT_S, Math.floor(ms / 1000))
  if (beat > 0) q.set('beat', String(beat))
  return `?${q.toString()}`
}

/** Put `state` in the address bar through history.replaceState; a no-op when the query already says it. */
export function syncUrl(state: UrlState): void {
  const q = stateQuery(location.search, state)
  if (q !== location.search) history.replaceState(history.state, '', `${location.pathname}${q}${location.hash}`)
}
