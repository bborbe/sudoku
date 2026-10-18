import { describe, expect, it } from 'vitest'
import { Clock, formatTime } from './clock'

describe('Clock', () => {
  it('counts only while active', () => {
    const c = new Clock(1000)
    expect(c.elapsed(0)).toBe(1000)
    c.setActive(true, 0)
    expect(c.elapsed(500)).toBe(1500)
    c.setActive(false, 500)
    expect(c.elapsed(9000)).toBe(1500)
    c.setActive(true, 9000)
    c.setActive(true, 9100) // a repeated activation does not restart the span
    expect(c.elapsed(9500)).toBe(2000)
  })

  it('resets while keeping its running state', () => {
    const c = new Clock()
    c.setActive(true, 0)
    c.reset(0, 4000)
    expect(c.elapsed(5000)).toBe(1000)
    expect(c.active).toBe(true)
  })
})

describe('formatTime', () => {
  it('shows mm:ss, and hours when needed', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(65_999)).toBe('01:05')
    expect(formatTime(3_725_000)).toBe('1:02:05')
  })
})
