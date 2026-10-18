// Screenshots of a running site at desktop (960×540) and phone (390×844) size, in the light and the dark theme, into shots/.
// Usage: node scripts/shots.mjs [url]   (default: the live site)
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.argv[2] || 'https://bborbe.github.io/sudoku/'
const views = [
  { name: 'desktop', width: 960, height: 540 },
  { name: 'mobile', width: 390, height: 844 },
]

mkdirSync('shots', { recursive: true })
const browser = await chromium.launch({ args: ['--mute-audio'] })
try {
  for (const v of views) for (const theme of ['light', 'dark']) {
    // The emulated OS preference picks the theme: storage starts empty, so the game follows `system`.
    const page = await browser.newPage({ viewport: { width: v.width, height: v.height }, colorScheme: theme })
    await page.goto(url)
    await page.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
    await page.locator('[role=gridcell]').first().waitFor()
    // Select a cell so the shot shows the selection, peer and same-digit tints.
    await page.locator('[role=gridcell].given').first().click()
    await page.waitForTimeout(400) // let the 140 ms tint transitions settle
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    const board = await page.locator('#board').boundingBox()
    const file = `shots/${v.name}-${theme}.png`
    await page.screenshot({ path: file })
    console.log(`${file}  board ${Math.round(board.width)}×${Math.round(board.height)} at (${Math.round(board.x)},${Math.round(board.y)})  horizontal overflow: ${overflow}`)
    await page.close()
  }
} finally {
  await browser.close()
}
