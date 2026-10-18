import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, deltaE, parseColor } from '../../scripts/color.mjs'

// The dark palette exists twice in style.css: under [data-theme='dark'] for an explicit choice, and inside the
// prefers-color-scheme block for `system`. A token edited in one copy only would make dark look different
// depending on how it was chosen, so the two must declare exactly the same properties with the same values.
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

function declarations(opener: string): string[] {
  const start = css.indexOf(opener)
  expect(start, `block ${opener}`).toBeGreaterThanOrEqual(0)
  expect(css.indexOf(opener, start + 1), `block ${opener} appears once`).toBe(-1)
  const body = css.slice(start + opener.length, css.indexOf('}', start)).replace(/\/\*[\s\S]*?\*\//g, '')
  return body
    .split(';')
    .map((d) => d.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
}

describe('style.css dark palette', () => {
  it('declares the same tokens for an explicit dark choice and for system under a dark OS', () => {
    const explicit = declarations(":root[data-theme='dark'] {")
    const system = declarations(":root:not([data-theme='light']) {")
    expect(explicit.length).toBeGreaterThan(20)
    expect(system).toEqual(explicit)
  })
})

// The board's structure bars, pinned on the token values so a palette edit fails `make test` (and CI) without a
// browser. scripts/contrast.mjs checks the same bars on rendered cells; this is the fast tier of that check.
describe('style.css board structure', () => {
  const tokens = (opener: string): Record<string, string> =>
    Object.fromEntries(
      declarations(opener)
        .map((d) => d.match(/^--([\w-]+):\s*(#[0-9a-fA-F]{3,8})$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => [m[1], m[2]]),
    )
  for (const [theme, opener] of [
    ['light', ':root {'],
    ['dark', ":root[data-theme='dark'] {"],
  ] as const) {
    it(`${theme}: related tint, thin and box lines read against an empty cell, box lines stay apart from the selection`, () => {
      const t = tokens(opener)
      const c = (k: string) => {
        const v = t[k] ?? tokens(':root {')[k]
        expect(v, `--${k} in the ${theme} block`).toBeDefined()
        return parseColor(v)
      }
      expect(contrast(c('related'), c('board'))).toBeGreaterThanOrEqual(1.3)
      expect(contrast(c('line'), c('board'))).toBeGreaterThanOrEqual(1.5)
      expect(contrast(c('box-line'), c('board'))).toBeGreaterThanOrEqual(3)
      expect(deltaE(c('box-line'), c('selected'))).toBeGreaterThanOrEqual(10)
    })
  }
})
