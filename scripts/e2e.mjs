// Browser test against the production build (`vite preview`) or, with E2E_URL, a deployed site.
// Drives the real UI with mouse and keyboard: selection, entry, conflicts, erase, the size picker,
// the difficulty row, a full 4×4 solve to the completion dialog, reload persistence and the hidden-tab clock pause.
// Fails on any console error. Usage: npm run build && npm run e2e
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4174
const url = process.env.E2E_URL || `http://localhost:${PORT}/sudoku/`

let failures = 0
function check(ok, label) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failures++
}

async function waitForServer(target, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if ((await fetch(target)).ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`server at ${target} did not start`)
}

let server
if (!process.env.E2E_URL) {
  server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  await waitForServer(url)
}

const browser = await chromium.launch({ args: ['--mute-audio'] })
const consoleErrors = []
try {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } })
  const page = await context.newPage()
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  const cells = page.locator('[role=gridcell]')
  const waitBoard = async (count) => {
    await page.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
    await page.waitForFunction((n) => document.querySelectorAll('[role=gridcell]').length === n, count, { timeout: 30_000 })
  }
  const pickSize = async (n) => {
    await page.selectOption('#size', String(n))
    await waitBoard(n ** 4)
  }

  // Fresh start: default 9×9.
  await page.goto(`${url}?debug=1`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await waitBoard(81)
  check((await cells.count()) === 81, 'default board is 9×9 (81 cells)')
  check((await page.locator('[role=grid] [role=row]').count()) === 9, 'grid has 9 ARIA rows')

  // Select an empty cell, enter a digit that clashes with a given in its row, see the conflict, erase it.
  const target = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[role=gridcell]')]
    for (const c of all) {
      if (c.textContent) continue
      const clash = all.find((o) => o !== c && o.dataset.row === c.dataset.row && o.classList.contains('given'))
      if (clash) return { index: Number(c.dataset.index), digit: clash.textContent }
    }
    return null
  })
  check(target !== null, 'found an empty cell with a given in its row')
  const cell = cells.nth(target.index)
  await cell.click()
  check(await cell.evaluate((c) => c.classList.contains('selected') && c.getAttribute('aria-selected') === 'true'), 'clicked cell is selected')
  check((await page.locator('.cell.related').count()) === 20, 'row, column and box peers are highlighted (20)')
  await page.keyboard.press(target.digit)
  check((await cell.textContent()) === target.digit, `typed ${target.digit} lands in the cell`)
  check(await cell.evaluate((c) => c.classList.contains('conflict') && c.getAttribute('aria-invalid') === 'true'), 'clashing entry shows the conflict class and aria-invalid')
  check((await page.locator('.cell.same').count()) >= 1, 'cells with the same digit are highlighted')
  await page.keyboard.press('Backspace')
  check((await cell.textContent()) === '', 'Backspace erases the entry')
  check((await page.locator('.cell.conflict').count()) === 0, 'conflict clears after erase')
  await page.keyboard.press(target.digit)
  await page.keyboard.press('0')
  check((await cell.textContent()) === '', '0 erases too')
  await page.click('#undo')
  check((await cell.textContent()) === target.digit, 'undo restores the erased entry')
  await page.click('#redo')
  check((await cell.textContent()) === '', 'redo erases it again')

  // Difficulty row: six levels on 9×9, Medium by default; picking one deals a puzzle at that level.
  const pressed = () => page.locator('#difficulty .level[aria-pressed=true]').textContent()
  const shownLevels = () => page.locator('#difficulty .level:visible').allTextContents()
  check((await shownLevels()).join(' ') === 'Easy Medium Hard Expert Master Extreme', '9×9 offers all six levels')
  check((await pressed()) === 'Medium', 'Medium is the default level')
  check((await page.evaluate(() => window.__sudoku.puzzleId())).startsWith('3-medium-'), 'the default puzzle is a Medium one')
  await page.click('#difficulty .level[data-level=extreme]')
  await waitBoard(81)
  check((await pressed()) === 'Extreme', 'picking Extreme marks it active')
  check((await page.evaluate(() => window.__sudoku.puzzleId())).startsWith('3-extreme-'), 'picking Extreme deals an Extreme puzzle')
  check(/New 9×9 Extreme puzzle, \d+ clues\./.test(await page.locator('#status').textContent()), 'status names the level')
  await page.click('#difficulty .level[data-level=hard]')
  await waitBoard(81)
  const hardId = await page.evaluate(() => window.__sudoku.puzzleId())
  check(hardId.startsWith('3-hard-'), 'picking Hard deals a Hard puzzle')
  await page.reload()
  await waitBoard(81)
  check((await pressed()) === 'Hard', 'the level survives a reload')
  check((await page.evaluate(() => window.__sudoku.puzzleId())) === hardId, 'reload resumes the Hard puzzle')

  // Pause hides the board and blocks input.
  await page.click('#pause')
  check(await page.locator('#paused').isVisible(), 'pause shows the overlay')
  check((await cells.nth(0).evaluate((c) => getComputedStyle(c).color)) === 'rgba(0, 0, 0, 0)', 'paused board hides its symbols')
  await page.keyboard.press(target.digit)
  check((await cell.textContent()) === '', 'input is blocked while paused')
  await page.click('#resume')
  check(!(await page.locator('#paused').isVisible()), 'resume hides the overlay')

  // Size picker: 4×4, 16×16 (letters), 25×25 (worker + spinner). Each size offers its own levels.
  await pickSize(2)
  check((await cells.count()) === 16, '4×4 renders 16 cells')
  check((await shownLevels()).join(' ') === 'Easy', '4×4 offers Easy only')
  await pickSize(4)
  check((await cells.count()) === 256, '16×16 renders 256 cells')
  check((await shownLevels()).join(' ') === 'Easy Medium Hard', '16×16 offers Easy to Hard')
  check((await pressed()) === 'Medium', '16×16 opens at Medium')
  await page.click('#difficulty .level[data-level=easy]')
  await waitBoard(256)
  check((await page.evaluate(() => window.__sudoku.puzzleId())).startsWith('4-easy-'), 'picking Easy on 16×16 deals an Easy 16×16')
  const pad16 = await page.locator('#pad .sym').allTextContents()
  check(pad16.join('') === '123456789ABCDEFG', '16×16 pad shows 1–9 then A–G')
  const boardSymbols = new Set(await cells.allTextContents())
  check(['A', 'B', 'C', 'D', 'E', 'F', 'G'].some((s) => boardSymbols.has(s)), '16×16 board shows letter symbols')
  await pickSize(5)
  check((await cells.count()) === 625, '25×25 renders 625 cells')

  // Solve a 4×4 to the completion dialog through the UI.
  await pickSize(2)
  const solution = await page.evaluate(() => window.__sudoku.solution())
  const empties = await page.evaluate(() => [...document.querySelectorAll('[role=gridcell]')].filter((c) => !c.textContent).map((c) => Number(c.dataset.index)))
  for (const i of empties) {
    await cells.nth(i).click()
    await page.keyboard.press(String(solution[i]))
  }
  check(await page.locator('#done').isVisible(), 'finishing the puzzle opens the completion dialog')
  check(/4×4 solved in \d\d:\d\d/.test(await page.locator('#done-text').textContent()), 'dialog names the size and time')
  await page.click('#done-new')
  await waitBoard(16)
  check(!(await page.locator('#done').isVisible()), 'New game closes the dialog and deals a new 4×4')

  // Persistence: a 9×9 in progress survives a reload with its entry, clock and size.
  await pickSize(3)
  const empty = await page.evaluate(() => Number([...document.querySelectorAll('[role=gridcell]')].find((c) => !c.textContent).dataset.index))
  await cells.nth(empty).click()
  await page.keyboard.press('5')
  await page.waitForTimeout(3000)
  const before = await page.evaluate(() => window.__sudoku.elapsedMs())
  const idBefore = await page.evaluate(() => window.__sudoku.puzzleId())
  await page.reload()
  await waitBoard(81)
  const after = await page.evaluate(() => window.__sudoku.elapsedMs())
  check((await page.evaluate(() => window.__sudoku.puzzleId())) === idBefore, 'reload restores the same puzzle')
  check((await cells.nth(empty).textContent()) === '5', 'reload restores the entry')
  check(Math.abs(after - before) <= 2000, `reload restores the clock (${Math.round(before)} → ${Math.round(after)} ms)`)
  check((await page.inputValue('#size')) === '3', 'reload restores the size')
  check((await pressed()) === 'Hard', '9×9 keeps its own level (Hard) after 16×16 was set to Easy')
  await pickSize(4)
  check((await pressed()) === 'Easy', '16×16 remembers Easy')
  await pickSize(3)

  // Hidden tab: the clock stops, then resumes when visible again.
  const setVisibility = (state) =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
      document.dispatchEvent(new Event('visibilitychange'))
    }, state)
  await setVisibility('hidden')
  const hiddenStart = await page.evaluate(() => window.__sudoku.elapsedMs())
  await page.waitForTimeout(5000)
  const hiddenEnd = await page.evaluate(() => window.__sudoku.elapsedMs())
  check(hiddenEnd - hiddenStart < 1000, `clock advances < 1 s while hidden (${Math.round(hiddenEnd - hiddenStart)} ms)`)
  await setVisibility('visible')
  await page.waitForTimeout(2000)
  const resumed = await page.evaluate(() => window.__sudoku.elapsedMs())
  check(resumed - hiddenEnd >= 1500, `clock resumes when visible (${Math.round(resumed - hiddenEnd)} ms in 2 s)`)

  // A shared puzzle link opens that puzzle, and reloading the link keeps the progress made on it.
  await page.goto(`${url}?debug=1&puzzle=2-sudoku`)
  await waitBoard(16)
  check((await page.evaluate(() => window.__sudoku.puzzleId())) === '2-sudoku', '?puzzle= opens the named puzzle')
  const linkCell = await page.evaluate(() => Number([...document.querySelectorAll('[role=gridcell]')].find((c) => !c.textContent).dataset.index))
  await cells.nth(linkCell).click()
  await page.keyboard.press('1')
  await page.reload()
  await waitBoard(16)
  check((await cells.nth(linkCell).textContent()) === '1', 'reloading a ?puzzle= link keeps its progress')

  check(consoleErrors.length === 0, `no console errors${consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''}`)
} finally {
  await browser.close()
  server?.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
