// Assists: the player-tunable help (hints, highlights, mistake check, conflicts, note cleanup, timer).
// Each difficulty sets a default for every assist; an assist the player switched explicitly is an override and
// wins over every level's default until "Reset to defaults" drops it. Pure — no DOM, no storage.
import type { Level } from '../puzzle/difficulty'

export const ASSISTS = ['hints', 'sameDigit', 'related', 'strict', 'conflicts', 'cleanNotes', 'timer'] as const
export type Assist = (typeof ASSISTS)[number]
export type Assists = Record<Assist, boolean>
/** The assists the player switched explicitly; an absent key follows the level's default. */
export type AssistOverrides = Partial<Assists>

export const ASSIST_LABELS: Record<Assist, string> = {
  hints: 'Hints available',
  sameDigit: 'Highlight same digit',
  related: 'Highlight row, column and box',
  strict: 'Mistake check: reject a wrong digit',
  conflicts: 'Show rule conflicts',
  cleanNotes: 'Auto-remove notes on placement',
  timer: 'Show timer',
}

/** One letter per assist in the URL (`assists=h0s1`): short, and stable once shipped. */
export const ASSIST_CODES: Record<Assist, string> = {
  hints: 'h',
  sameDigit: 's',
  related: 'r',
  strict: 'm',
  conflicts: 'c',
  cleanNotes: 'n',
  timer: 't',
}

const EASY: Assists = { hints: true, sameDigit: true, related: true, strict: true, conflicts: true, cleanNotes: true, timer: true }
const MEDIUM: Assists = { ...EASY, strict: false }
const HARD: Assists = { ...MEDIUM, sameDigit: false, cleanNotes: false }

export const ASSIST_DEFAULTS: Record<Level, Assists> = { easy: EASY, medium: MEDIUM, hard: HARD, expert: HARD, master: HARD, extreme: HARD }

/** The assists in effect at `level`: its defaults, then the player's overrides on top. */
export function resolveAssists(level: Level, overrides: AssistOverrides): Assists {
  return { ...ASSIST_DEFAULTS[level], ...overrides }
}

/** Keeps only known assists with boolean values. */
export function validOverrides(raw: unknown): AssistOverrides {
  const out: AssistOverrides = {}
  if (!raw || typeof raw !== 'object') return out
  for (const a of ASSISTS) {
    const v = (raw as Record<string, unknown>)[a]
    if (typeof v === 'boolean') out[a] = v
  }
  return out
}

/** `{hints: false, sameDigit: true}` → `h0s1`, in ASSISTS order; no overrides → ''. */
export function encodeOverrides(o: AssistOverrides): string {
  return ASSISTS.filter((a) => o[a] !== undefined)
    .map((a) => `${ASSIST_CODES[a]}${o[a] ? 1 : 0}`)
    .join('')
}

/** The inverse of encodeOverrides; null when the text is not a well-formed list of known codes. */
export function decodeOverrides(text: string): AssistOverrides | null {
  if (!/^([a-z][01])*$/.test(text)) return null
  const out: AssistOverrides = {}
  for (let i = 0; i < text.length; i += 2) {
    const a = ASSISTS.find((x) => ASSIST_CODES[x] === text[i])
    if (!a) return null
    out[a] = text[i + 1] === '1'
  }
  return out
}
