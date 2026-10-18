// Types for scripts/color.mjs, so src/ tests can pin palette bars with the same math the contrast check uses.
export type RGB = [number, number, number]
export function parseColor(css: string): RGB
export function luminance(rgb: RGB): number
export function contrast(a: RGB, b: RGB): number
export function toLab(rgb: RGB): [number, number, number]
export function deltaE2000(a: [number, number, number], b: [number, number, number]): number
export const deltaE: (a: RGB, b: RGB) => number
