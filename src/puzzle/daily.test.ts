import { describe, expect, it } from 'vitest'
import { dailySeed, DAILY_BOX_SIZE, DAILY_LEVEL, localDate } from './daily'
import { generate } from './generator'

describe('daily puzzle', () => {
  it('formats the local date', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localDate(new Date(2026, 9, 18, 0, 1))).toBe('2026-10-18')
  })

  it('gives one seed per date, different across dates', () => {
    expect(dailySeed('2026-10-18')).toBe(dailySeed('2026-10-18'))
    const seeds = new Set(Array.from({ length: 366 }, (_, i) => dailySeed(localDate(new Date(2026, 0, 1 + i)))))
    expect(seeds.size).toBe(366)
  })

  it('deals the same puzzle for the same date', () => {
    const a = generate(DAILY_BOX_SIZE, dailySeed('2026-10-18'), DAILY_LEVEL)
    const b = generate(DAILY_BOX_SIZE, dailySeed('2026-10-18'), DAILY_LEVEL)
    expect(a.id).toBe(b.id)
    expect(a.givens).toEqual(b.givens)
  })
})
