// Game clock: accumulates time only while active (game running, not paused, tab visible). Time is passed in,
// so the clock is deterministic under test.

export class Clock {
  private base: number
  private since: number | null = null

  constructor(elapsedMs = 0) {
    this.base = elapsedMs
  }

  setActive(active: boolean, now: number): void {
    if (active && this.since === null) this.since = now
    else if (!active && this.since !== null) {
      this.base += Math.max(0, now - this.since)
      this.since = null
    }
  }

  get active(): boolean {
    return this.since !== null
  }

  elapsed(now: number): number {
    return this.base + (this.since === null ? 0 : Math.max(0, now - this.since))
  }

  reset(elapsedMs = 0, now: number): void {
    this.base = elapsedMs
    if (this.since !== null) this.since = now
  }
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
