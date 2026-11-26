import { describe, expect, it } from 'vitest'
import { puzzleId } from '../puzzle/generator'
import { redealTarget } from './redeal'

const id = puzzleId(3, 42, 'hard')

describe('redealTarget', () => {
  it('deals a fresh puzzle at the link size and level when the id was already shown', () => {
    expect(redealTarget({ puzzle: id }, [id])).toEqual({ n: 3, level: 'hard' })
  })

  it('keeps a legacy `<n>-<seed>` link level-less', () => {
    const legacy = puzzleId(2, 7)
    expect(redealTarget({ puzzle: legacy }, [legacy])).toEqual({ n: 2 })
  })

  it('opens the URL puzzle when it was never shown', () => {
    expect(redealTarget({ puzzle: id }, [])).toBeNull()
  })

  it('always opens a `beat` share link, shown or not', () => {
    expect(redealTarget({ puzzle: id, beat: 125 }, [id])).toBeNull()
  })

  it('ignores a URL with no puzzle', () => {
    expect(redealTarget({ n: 3 }, [id])).toBeNull()
  })

  it('ignores an id that does not parse as a puzzle id', () => {
    expect(redealTarget({ puzzle: 'not-a-puzzle-id' }, ['not-a-puzzle-id'])).toBeNull()
  })
})
