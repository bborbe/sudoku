import { describe, expect, it } from 'vitest'
import { nextTheme, resolveTheme } from './theme'

describe('resolveTheme', () => {
  it('follows the OS preference for system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('lets an explicit choice override the OS preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('nextTheme', () => {
  it('stores the opposite of what is on screen, so a toggle always leaves system', () => {
    expect(nextTheme('dark')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
  })
})
