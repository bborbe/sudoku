// Contrast check of the light palette, read from the page's computed styles (not from constants).
// Text pairs need WCAG AA 4.5:1, box lines 3:1 against the board (non-text), and the five cell
// backgrounds must stay pairwise distinguishable (CIEDE2000 ΔE >= 5).
// Usage: node scripts/contrast.mjs [url] [--override <token>=<colour> ...]
//   default url: `vite preview` of the current build; --override forces a token to prove the check can fail.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4175
const args = process.argv.slice(2)
const overrides = {}
let target = process.env.E2E_URL || ''
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--override') {
    const [k, v] = (args[++i] || '').split('=')
    if (!k || !v) throw new Error('--override needs <token>=<colour>')
    overrides[k.replace(/^--/, '')] = v
  } else target = args[i]
}

const TEXT_MIN = 4.5
const NONTEXT_MIN = 3
const DELTA_E_MIN = 5
const backgrounds = ['board', 'selected', 'related', 'same', 'conflict-bg']
const pairs = [
  ...backgrounds.flatMap((bg) => [
    ['given', bg, TEXT_MIN],
    ['entry', bg, TEXT_MIN],
  ]),
  ['conflict-ink', 'conflict-bg', TEXT_MIN],
  ['entry', 'pad-bg', TEXT_MIN],
  ['muted', 'pad-bg', TEXT_MIN],
  ['muted', 'canvas', TEXT_MIN],
  ['on-accent', 'accent', TEXT_MIN],
  ['box-line', 'board', NONTEXT_MIN],
  ['ok', 'board', NONTEXT_MIN],
]

async function waitForServer(url, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`server at ${url} did not start`)
}

let server
if (!target) {
  target = `http://localhost:${PORT}/sudoku/`
  server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  await waitForServer(target)
}

const browser = await chromium.launch({ args: ['--mute-audio'] })
let colours
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, colorScheme: 'light' })
  await page.goto(target)
  const tokens = [...new Set([...pairs.flat().filter((t) => typeof t === 'string'), ...backgrounds])]
  colours = await page.evaluate(
    ({ tokens, overrides }) => {
      const root = document.documentElement
      for (const [k, v] of Object.entries(overrides)) root.style.setProperty(`--${k}`, v)
      const probe = document.createElement('span')
      document.body.append(probe)
      const out = {}
      for (const t of tokens) {
        probe.style.color = `var(--${t})`
        out[t] = getComputedStyle(probe).color
      }
      probe.remove()
      return out
    },
    { tokens, overrides },
  )
} finally {
  await browser.close()
  server?.kill()
}

function rgb(css) {
  const m = css.match(/[\d.]+/g)
  if (!m || m.length < 3) throw new Error(`unparsed colour ${css}`)
  return m.slice(0, 3).map(Number)
}

function luminance([r, g, b]) {
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function lab([r, g, b]) {
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (t * 24389) / 27 / 116 + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

// CIEDE2000 colour difference.
function deltaE([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h = (b, a) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360)
  const h1p = h(b1, a1p)
  const h2p = h(b2, a2p)
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) dhp = Math.abs(h2p - h1p) <= 180 ? h2p - h1p : h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad)
  const Lm = (L1 + L2) / 2
  const Cmp = (C1p + C2p) / 2
  let hm = h1p + h2p
  if (C1p * C2p !== 0) hm = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad)
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2)
  const Sc = 1 + 0.045 * Cmp
  const Sh = 1 + 0.015 * Cmp * T
  const Rt = -Math.sin(2 * dTheta * rad) * Rc
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))
}

let failures = 0
for (const [fg, bg, min] of pairs) {
  const r = ratio(rgb(colours[fg]), rgb(colours[bg]))
  const ok = r >= min
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} --${fg} on --${bg}: ${r.toFixed(2)}:1 (min ${min}:1)`)
}
for (let i = 0; i < backgrounds.length; i++) {
  for (let j = i + 1; j < backgrounds.length; j++) {
    const [a, b] = [backgrounds[i], backgrounds[j]]
    const d = deltaE(lab(rgb(colours[a])), lab(rgb(colours[b])))
    const ok = d >= DELTA_E_MIN
    if (!ok) failures++
    console.log(`${ok ? '✓' : '✗'} --${a} vs --${b}: ΔE ${d.toFixed(1)} (min ${DELTA_E_MIN})`)
  }
}
console.log(failures ? `\n${failures} pair(s) below the bar` : '\nall pairs pass')
process.exit(failures ? 1 : 0)
