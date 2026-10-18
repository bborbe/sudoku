import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The dark palette exists twice in style.css: under [data-theme='dark'] for an explicit choice, and inside the
// prefers-color-scheme block for `system`. A token edited in one copy only would make dark look different
// depending on how it was chosen, so the two must declare exactly the same properties with the same values.
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

function declarations(opener: string): string[] {
  const start = css.indexOf(opener)
  expect(start, `block ${opener}`).toBeGreaterThanOrEqual(0)
  expect(css.indexOf(opener, start + 1), `block ${opener} appears once`).toBe(-1)
  const body = css.slice(start + opener.length, css.indexOf('}', start))
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
