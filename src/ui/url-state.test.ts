import { describe, expect, it } from 'vitest'
import { readUrl, stateQuery } from './url-state'

describe('readUrl', () => {
  it('reads size as the side length, level and puzzle', () => {
    expect(readUrl('?size=16&level=hard&puzzle=4-hard-abc')).toEqual({ n: 4, level: 'hard', puzzle: '4-hard-abc' })
    expect(readUrl('?size=4')).toEqual({ n: 2 })
    expect(readUrl('?level=extreme')).toEqual({ level: 'extreme' })
  })

  it('drops unknown or invalid values', () => {
    expect(readUrl('')).toEqual({})
    expect(readUrl('?size=7&level=foo')).toEqual({})
    expect(readUrl('?size=3&puzzle=nope')).toEqual({})
    expect(readUrl('?size=1')).toEqual({})
    expect(readUrl('?size=36')).toEqual({})
    expect(readUrl('?size=9.0x')).toEqual({})
    expect(readUrl('?puzzle=9-medium-abc')).toEqual({})
  })

  it('drops a level the named size does not offer', () => {
    expect(readUrl('?size=4&level=hard')).toEqual({ n: 2 })
    expect(readUrl('?size=25&level=medium')).toEqual({ n: 5, level: 'medium' })
  })
})

describe('stateQuery', () => {
  const state = { n: 3, level: 'medium', puzzle: '3-medium-abc' } as const

  it('writes size, level and puzzle, keeping other parameters', () => {
    expect(stateQuery('?debug=1', state)).toBe('?debug=1&size=9&level=medium&puzzle=3-medium-abc')
    expect(stateQuery('', { n: 2, level: 'easy', puzzle: '2-sudoku' })).toBe('?size=4&level=easy&puzzle=2-sudoku')
  })

  it('replaces stale values in place', () => {
    expect(stateQuery('?size=16&puzzle=old&level=hard', state)).toBe('?size=9&puzzle=3-medium-abc&level=medium')
  })

  it('round-trips through readUrl', () => {
    expect(readUrl(stateQuery('', state))).toEqual(state)
  })
})
