// Contrast check of both themes, read from the page's computed styles (never from constants).
// Cell pairs come from a real gridcell put into every state combination (given / entry × plain / selected /
// related / same-digit / conflict), so a CSS rule wired to the wrong token fails here even if the tokens are fine.
// Text needs WCAG AA 4.5:1, box lines and the correct-entry check 3:1 against the board (non-text), and the five
// cell backgrounds must stay pairwise distinguishable (CIEDE2000 ΔE >= 5). The board's structure is checked from
// rendered borders too: the related tint reads against an empty cell (1.3:1), thin lines against the cell (1.5:1),
// box lines against the cell (3:1), and box lines stay clearly apart from the selected fill (ΔE >= 10).
// Usage: node scripts/contrast.mjs [url] [--override [light:|dark:]<token>=<colour> ...]
//   default url: `vite preview` of the current build; --override forces a token (in one theme, or both) to prove
//   the check can fail.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { contrast, deltaE, parseColor } from './color.mjs'

const PORT = 4175
const THEMES = ['light', 'dark']
const args = process.argv.slice(2)
const overrides = []
let target = process.env.E2E_URL || ''
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--override') {
    const m = (args[++i] || '').match(/^(?:(light|dark):)?(?:--)?([\w-]+)=(.+)$/)
    if (!m) throw new Error('--override needs [light:|dark:]<token>=<colour>')
    overrides.push({ theme: m[1] || null, token: m[2], value: m[3] })
  } else target = args[i]
}

const TEXT_MIN = 4.5
const NONTEXT_MIN = 3
const DELTA_E_MIN = 5
const RELATED_MIN = 1.3
const THIN_LINE_MIN = 1.5
const BOX_SELECTED_DELTA_E_MIN = 10
// Background states a digit can sit on; '' is a plain cell, which shows the board through.
const BG_STATES = ['', 'selected', 'related', 'same', 'conflict', 'conflict selected']
const DIGITS = ['given', 'entry']
// Non-cell pairs, read through the tokens they paint with.
const TOKEN_PAIRS = [
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
const read = {}
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
  await page.goto(target)
  await page.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
  await page.locator('[role=gridcell]').first().waitFor()
  // Tints fade over 140 ms; read the settled colour, not a mid-transition one.
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' })
  const css = overrides
    .map((o) => `${o.theme ? `:root[data-theme='${o.theme}']` : ':root[data-theme]'} { --${o.token}: ${o.value} !important; }`)
    .join('\n')
  if (css) await page.addStyleTag({ content: css })

  for (const theme of THEMES) {
    read[theme] = await page.evaluate(
      ({ theme, digits, bgStates, tokens }) => {
        document.documentElement.dataset.theme = theme
        const board = document.querySelector('#board')
        const boardBg = getComputedStyle(board).backgroundColor
        const transparent = (c) => c === 'transparent' || /,\s*0\)$|\/\s*0\)$/.test(c)
        // One real gridcell, put through every state and then restored.
        const cell = document.querySelector('[role=gridcell]')
        const saved = cell.className
        const cells = []
        for (const digit of digits) {
          for (const bg of bgStates) {
            cell.className = `cell ${digit} ${bg}`.trim()
            const s = getComputedStyle(cell)
            cells.push({ digit, bg: bg || 'plain', color: s.color, background: transparent(s.backgroundColor) ? boardBg : s.backgroundColor })
          }
        }
        // Structure: the related tint and both line weights, read from the same cell's own borders.
        cell.className = 'cell'
        const plain = getComputedStyle(cell)
        const lines = { thin: plain.borderRightColor, empty: transparent(plain.backgroundColor) ? boardBg : plain.backgroundColor }
        cell.className = 'cell box-r'
        lines.box = getComputedStyle(cell).borderRightColor
        cell.className = 'cell related'
        lines.related = getComputedStyle(cell).backgroundColor
        cell.className = 'cell selected'
        lines.selected = getComputedStyle(cell).backgroundColor
        cell.className = saved
        const probe = document.createElement('span')
        document.body.append(probe)
        const tokenValues = {}
        for (const t of tokens) {
          probe.style.color = `var(--${t})`
          tokenValues[t] = getComputedStyle(probe).color
        }
        probe.remove()
        return { cells, tokens: tokenValues, lines }
      },
      { theme, digits: DIGITS, bgStates: BG_STATES, tokens: [...new Set(TOKEN_PAIRS.flatMap(([a, b]) => [a, b]))] },
    )
  }
} finally {
  await browser.close()
  server?.kill()
}

let failures = 0
const report = (ok, line) => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${line}`)
}
for (const theme of THEMES) {
  const { cells, tokens, lines } = read[theme]
  console.log(`\n${theme}`)
  for (const c of cells) {
    const r = contrast(parseColor(c.color), parseColor(c.background))
    report(r >= TEXT_MIN, `${c.digit} on ${c.bg} cell: ${r.toFixed(2)}:1 (min ${TEXT_MIN}:1)`)
  }
  for (const [fg, bg, min] of TOKEN_PAIRS) {
    const r = contrast(parseColor(tokens[fg]), parseColor(tokens[bg]))
    report(r >= min, `--${fg} on --${bg}: ${r.toFixed(2)}:1 (min ${min}:1)`)
  }
  // One background per state, taken from the rendered given cells (the digit does not change the tint).
  const bgs = [...new Map(cells.filter((c) => c.digit === 'given' && c.bg !== 'conflict selected').map((c) => [c.bg, c.background]))]
  for (let i = 0; i < bgs.length; i++) {
    for (let j = i + 1; j < bgs.length; j++) {
      const d = deltaE(parseColor(bgs[i][1]), parseColor(bgs[j][1]))
      report(d >= DELTA_E_MIN, `${bgs[i][0]} vs ${bgs[j][0]} cell: ΔE ${d.toFixed(1)} (min ${DELTA_E_MIN})`)
    }
  }
  const [empty, related, thin, box, selected] = ['empty', 'related', 'thin', 'box', 'selected'].map((k) => parseColor(lines[k]))
  const rel = contrast(related, empty)
  report(rel >= RELATED_MIN, `related vs empty cell: ${rel.toFixed(2)}:1 (min ${RELATED_MIN}:1)`)
  const t = contrast(thin, empty)
  report(t >= THIN_LINE_MIN, `thin line vs empty cell: ${t.toFixed(2)}:1 (min ${THIN_LINE_MIN}:1)`)
  const b = contrast(box, empty)
  report(b >= NONTEXT_MIN, `box line vs empty cell: ${b.toFixed(2)}:1 (min ${NONTEXT_MIN}:1)`)
  const bs = deltaE(box, selected)
  report(bs >= BOX_SELECTED_DELTA_E_MIN, `box line vs selected fill: ΔE ${bs.toFixed(1)} (min ${BOX_SELECTED_DELTA_E_MIN})`)
}

console.log(failures ? `\n${failures} pair(s) below the bar` : '\nall pairs pass')
process.exit(failures ? 1 : 0)
