// Technique breakdown for the completion dialog: which techniques the logical solver's path through a
// puzzle used, how often, and the hardest of them. Computed from the givens, so it describes the puzzle,
// not the moves the player happened to make. Pure — no DOM.
import type { Size } from '../engine/size'
import { techniqueName } from '../i18n'
import { MAX_TIER, solveLogically, TECHNIQUES } from './logic'

/** The hardest step of a puzzle the techniques cannot finish (Extreme): past the solver's reach. */
export const BEYOND_LOGIC = 'chains or trial and error'

export interface TechniqueCount {
  name: string
  tier: number
  count: number
}

export interface Breakdown {
  /** Techniques the solver's path used, easiest first, each with its step count. */
  techniques: TechniqueCount[]
  /** The hardest technique used — `BEYOND_LOGIC` when the techniques run out; null when nothing was left to solve. */
  hardest: string | null
  /** Tier of the hardest step: MAX_TIER + 1 for `BEYOND_LOGIC`, −1 when nothing was left to solve. */
  tier: number
}

export function techniqueBreakdown(size: Size, givens: ArrayLike<number>): Breakdown {
  const r = solveLogically(size, givens)
  const techniques = TECHNIQUES.filter(([name]) => r.used[name]).map(([name, tier]) => ({ name, tier, count: r.used[name] }))
  if (!r.solution) return { techniques, hardest: BEYOND_LOGIC, tier: MAX_TIER + 1 }
  // TECHNIQUES is sorted by tier, so the last one used is the hardest (within a tier, the later-tried one).
  const last = techniques[techniques.length - 1]
  return { techniques, hardest: last?.name ?? null, tier: last?.tier ?? -1 }
}

/** "x-wing" → "X-wing", "xy-wing" → "XY-wing", "hidden single" → "Hidden single" (or its German name), for display. */
export function techniqueLabel(name: string): string {
  const s = techniqueName(name).replace(/^x[yz]*(?=-)/, (m) => m.toUpperCase())
  return s.charAt(0).toUpperCase() + s.slice(1)
}
