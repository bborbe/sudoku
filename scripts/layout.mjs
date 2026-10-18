// Layout check: at phone (390×844) and desktop (960×540) size, every board size fits without horizontal
// overflow, the board and number pad sit inside the viewport, and phone cells stay legible.
// Usage: node scripts/layout.mjs [url]   (default: `vite preview` of the current build)
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4176
let target = process.argv[2] || process.env.E2E_URL || ''
const views = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 960, height: 540 },
]
// Minimum cell width on the phone per box size (4×4 has no floor beyond fitting).
const minCellPhone = { 2: 0, 3: 36, 4: 20, 5: 13 }

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

let failures = 0
const browser = await chromium.launch({ args: ['--mute-audio'] })
try {
  for (const v of views) {
    const page = await browser.newPage({ viewport: { width: v.width, height: v.height } })
    await page.goto(target)
    for (const n of [2, 3, 4, 5]) {
      await page.evaluate(() => localStorage.clear())
      await page.selectOption('#size', String(n))
      await page.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
      await page.waitForFunction((c) => document.querySelectorAll('[role=gridcell]').length === c, n ** 4, { timeout: 30_000 })
      const m = await page.evaluate(() => {
        const box = (sel) => {
          const r = document.querySelector(sel).getBoundingClientRect()
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
        }
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          board: box('#board'),
          pad: box('#pad'),
          cell: document.querySelector('[role=gridcell]').getBoundingClientRect().width,
          vw: window.innerWidth,
          vh: window.innerHeight,
        }
      })
      const inside = (r) => r.left >= 0 && r.top >= 0 && r.right <= m.vw && r.bottom <= m.vh
      const floor = v.name === 'phone' ? minCellPhone[n] : 0
      const problems = []
      if (m.overflow) problems.push('horizontal overflow')
      if (!inside(m.board)) problems.push(`board outside viewport ${JSON.stringify(m.board)}`)
      if (!inside(m.pad)) problems.push(`pad outside viewport ${JSON.stringify(m.pad)}`)
      if (m.cell < floor) problems.push(`cell ${m.cell.toFixed(1)} px < ${floor} px`)
      if (problems.length) failures++
      console.log(`${problems.length ? '✗' : '✓'} ${v.name} ${n * n}×${n * n}: cell ${m.cell.toFixed(1)} px${problems.length ? ' — ' + problems.join('; ') : ''}`)
    }
    await page.close()
  }
} finally {
  await browser.close()
  server?.kill()
}

console.log(failures ? `\n${failures} case(s) failed` : '\nall 8 cases pass')
process.exit(failures ? 1 : 0)
