// The daily puzzle: one 9×9 per local calendar date, the same for every player — its seed is a hash of the date.
import type { Level } from './difficulty'

export const DAILY_BOX_SIZE = 3
export const DAILY_LEVEL: Level = 'medium'

/** The local calendar date as YYYY-MM-DD (the player's day, not UTC). */
export function localDate(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** FNV-1a over the date string: deterministic, and neighbouring dates land far apart. */
export function dailySeed(date: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
