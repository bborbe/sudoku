// Whether a load should deal a fresh puzzle instead of opening the one the URL names: a reload of a solved puzzle's
// own URL would otherwise re-deal a grid this browser already showed. A `beat` share link always opens the puzzle it
// names, so the sender's time can be beaten. Pure — the caller reads storage and deals.
import { isBoxSize, type BoxSize } from '../engine/size'
import { parsePuzzleId } from '../puzzle/generator'
import type { Level } from '../puzzle/difficulty'
import type { UrlRequest } from './url-state'

/** The size and level to deal a fresh puzzle at when the URL's puzzle was already shown; null to open the URL's puzzle. */
export function redealTarget(url: UrlRequest, seen: readonly string[]): { n: BoxSize; level?: Level } | null {
  const id = url.puzzle
  if (!id || url.beat !== undefined || !seen.includes(id)) return null
  const parsed = parsePuzzleId(id)
  if (!parsed || !isBoxSize(parsed.n)) return null
  return parsed.level ? { n: parsed.n, level: parsed.level } : { n: parsed.n }
}
