import { describe, expect, it } from 'vitest'
import { contrast, deltaE2000, parseColor } from './color.mjs'

describe('parseColor', () => {
  it('reads hex and the rgb() forms getComputedStyle returns', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255])
    expect(parseColor('#1E293B')).toEqual([30, 41, 59])
    expect(parseColor('rgb(30, 41, 59)')).toEqual([30, 41, 59])
    expect(parseColor('rgba(30, 41, 59, 0.5)')).toEqual([30, 41, 59])
    expect(parseColor('rgb(30 41 59 / 0.5)')).toEqual([30, 41, 59])
  })

  it('throws on anything else, so an unresolved token cannot pass silently', () => {
    expect(() => parseColor('transparent')).toThrow()
  })
})

describe('contrast', () => {
  it('matches the WCAG reference points', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
    expect(contrast([255, 255, 255], [255, 255, 255])).toBe(1)
    // #767676 on white is the well-known 4.54:1 AA threshold grey.
    expect(contrast(parseColor('#767676'), [255, 255, 255])).toBeCloseTo(4.54, 2)
  })
})

describe('deltaE2000', () => {
  // Reference pairs from Sharma, Wu & Dalal (2005), table 1.
  const cases = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ]
  it.each(cases)('%j vs %j', (a, b, want) => {
    expect(deltaE2000(a, b)).toBeCloseTo(want, 3)
  })
})
