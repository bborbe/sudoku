// Browser test against the production build (`vite preview`) or, with E2E_URL, a deployed site.
// Drives the real UI with mouse and keyboard: selection, entry, conflicts, erase, pencil-mark notes, the size picker,
// the difficulty row, graduated hints, a full 4×4 solve to the completion dialog, the technique breakdown (9×9 Expert,
// reduced motion), reload persistence and the hidden-tab clock pause,
// the key table (Esc, Delete, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, keys ignored in a text field), the pad-digit highlight,
// the settings dialog (gear, 9 assists live + persisted, per-level defaults, overrides, reset, URL, colour-blind
// conflict cue), a keyboard-only 9×9 from New game to Solved, and a 390×844 touch run.
// Fails on any console error. Usage: npm run build && npm run e2e   (E2E_PORT=<port> pins the preview port; default: a free one)
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { servesBuild, startPreview } from './preview.mjs'

let failures = 0
function check(ok, label) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failures++
}

// Our own preview on a free port (see preview.mjs), or the deployed site under E2E_URL.
let server
let url = process.env.E2E_URL
if (!url) {
  ;({ url, child: server } = await startPreview(Number(process.env.E2E_PORT) || undefined))
  if (!(await servesBuild(url))) {
    server.kill()
    throw new Error(`preview at ${url} is not serving this checkout's dist/index.html`)
  }
  console.log(`✓ preview at ${url} serves this checkout's build`)
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
  // Settings dialog: open from the gear, set one assist switch, close.
  const setAssist = async (name, on) => {
    await page.click('#settings-open')
    await page.setChecked(`#assist-${name}`, on)
    await page.click('#settings-close')
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

  // Zero layout shift from first paint until the puzzle is on screen, on desktop and phone, for a plain visit and an
  // Easy link (Easy shows the mistake counter beside the size picker).
  for (const [viewport, query] of [{ width: 960, height: 540 }, { width: 390, height: 844 }].flatMap((v) => [[v, ''], [v, '?level=easy']])) {
    const ctx = await browser.newContext({ viewport })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => consoleErrors.push(String(e)))
    await p.addInitScript(() => {
      window.__cls = 0
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__cls += e.value))).observe({ type: 'layout-shift', buffered: true })
    })
    await p.goto(`${url}${query}`)
    await p.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
    await p.locator('[role=gridcell]').first().waitFor()
    await p.waitForTimeout(500)
    const cls = await p.evaluate(() => window.__cls)
    check(cls === 0, `no layout shift while the first puzzle loads at ${viewport.width}×${viewport.height}${query} (CLS ${cls})`)
    await ctx.close()
  }

  // Top bar: logo, Classic tab selected, no other mode tab.
  check(await page.locator('.topbar .brand svg').isVisible(), 'top bar shows the logo')
  check((await page.getAttribute('#mode-classic', 'aria-selected')) === 'true', 'Classic tab is the selected mode')
  check((await page.locator('.topbar [role=tab]').count()) === 1 && !(await page.locator('.topbar').innerText()).includes('soon'), 'top bar has no Killer tab or "soon" label')
  const durations = await cells.first().evaluate((c) => getComputedStyle(c).transitionDuration.split(',').map((d) => parseFloat(d) * (d.trim().endsWith('ms') ? 1 : 1000)))
  check(durations.length > 0 && durations.every((ms) => ms >= 120 && ms <= 180), `cell transitions run 120–180 ms (${durations.join(', ')} ms)`)

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

  // Correct entries get the green check, wrong ones do not.
  check(!(await page.locator('.cell.correct').count()), 'no check mark on a board without correct entries')
  const solution9 = await page.evaluate(() => window.__sudoku.solution())
  await cell.click()
  await page.keyboard.press(String(solution9[target.index]))
  check(await cell.evaluate((c) => c.classList.contains('correct')), 'a correct entry gets the check mark')
  await page.keyboard.press(String((solution9[target.index] % 9) + 1))
  check(await cell.evaluate((c) => !c.classList.contains('correct')), 'a wrong entry has no check mark')
  await page.keyboard.press('Backspace')

  // Pause hides the board and blocks input.
  await page.click('#pause')
  check(await page.locator('#paused').isVisible(), 'pause shows the overlay')
  check((await cells.nth(0).evaluate((c) => getComputedStyle(c).color)) === 'rgba(0, 0, 0, 0)', 'paused board hides its symbols')
  await page.keyboard.press(target.digit)
  check((await cell.textContent()) === '', 'input is blocked while paused')
  await page.click('#resume')
  check(!(await page.locator('#paused').isVisible()), 'resume hides the overlay')

  // Hints: H highlights where to look, H again names the technique, H a third time fills the digit with a bulb.
  const indexes = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((c) => Number(c.dataset.index)), sel)
  const statusText = () => page.locator('#status').textContent()
  await page.keyboard.press('h')
  const region = await indexes('.cell.hint-region')
  check(region.length === 9, `first H highlights one row, column or box (${region.length} cells)`)
  check((await statusText()) === 'Hint: the next move is in the highlighted cells.', 'first H says where to look, not what')
  await page.keyboard.press('h')
  const named = await statusText()
  check(/^Hint: (.+, then a )?(Hidden|hidden|Naked|naked) single in (row|column|box) \d/.test(named), `second H names the technique and where (${named})`)
  await page.keyboard.press('h')
  const hinted = await indexes('.cell.hinted')
  check(hinted.length === 1 && region.includes(hinted[0]), 'third H fills one cell inside the highlighted region')
  const hintedCell = cells.nth(hinted[0])
  check((await hintedCell.textContent()) === String(solution9[hinted[0]]), 'the hinted digit is the solution digit')
  check((await hintedCell.getAttribute('aria-label')).includes(', hinted'), 'the hinted cell says so to screen readers')
  check((await hintedCell.evaluate((c) => getComputedStyle(c, '::before').content)) !== 'none', 'the hinted cell carries the bulb mark')
  check((await page.locator('.cell.hint-region').count()) === 0, 'the region highlight clears once the digit is in')
  // A wrong digit is pointed out before any other hint; the Hint button works like H.
  await cell.click()
  await page.keyboard.press(String((solution9[target.index] % 9) + 1))
  await page.click('#hint')
  check((await indexes('.cell.hint-region')).includes(target.index), 'a hint with a wrong digit on the board highlights its box')
  check((await statusText()) === 'Hint: something in the highlighted box is wrong.', 'the hint says something there is wrong')
  await page.click('#hint')
  await page.click('#hint')
  check((await cell.textContent()) === String(solution9[target.index]), 'the third press replaces the wrong digit with the right one')

  // Key table: Delete erases, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z redoes, Esc resumes a paused game.
  await cell.click()
  await page.keyboard.press(target.digit)
  await page.keyboard.press('Delete')
  check((await cell.textContent()) === '', 'Delete erases the entry')
  await page.keyboard.press('Control+z')
  check((await cell.textContent()) === target.digit, 'Ctrl+Z undoes the erase')
  await page.keyboard.press('Control+Shift+z')
  check((await cell.textContent()) === '', 'Ctrl+Shift+Z redoes it')
  await page.keyboard.press('Meta+z')
  check((await cell.textContent()) === target.digit, 'Cmd+Z undoes too')
  await page.keyboard.press('Meta+Shift+z')
  check((await cell.textContent()) === '', 'Cmd+Shift+Z redoes too')
  await page.click('#pause')
  await page.keyboard.press('Escape')
  check(!(await page.locator('#paused').isVisible()), 'Esc resumes a paused game')

  // Keys are ignored while typing in a text field: the digit lands in the field, the board and selection stay.
  const selectedBefore = await page.locator('.cell.selected').getAttribute('data-index')
  await page.evaluate(() => document.body.append(Object.assign(document.createElement('input'), { id: 'probe', type: 'text' })))
  await page.focus('#probe')
  await page.keyboard.type(`${target.digit}9`)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')
  check((await page.inputValue('#probe')) === '9', 'typing in a text field edits the field')
  check((await cell.textContent()) === '' && (await page.locator('.cell.selected').getAttribute('data-index')) === selectedBefore, 'typing in a text field leaves the board alone')
  await page.evaluate(() => document.getElementById('probe').remove())

  // Pad digit: picking one highlights every filled cell holding it and outlines its key; counts stay visible.
  // Pick from the board, never by arithmetic: a given whose digit also sits elsewhere, and a different digit on the board,
  // so both highlights have cells to light whatever the puzzle.
  const { givenCell, padDigit } = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[role=gridcell]')]
    const n = (d) => all.filter((c) => c.textContent === d).length
    const given = all.find((c) => c.classList.contains('given') && n(c.textContent) >= 2)
    const other = all.find((c) => c.textContent && c.textContent !== given.textContent)
    return { givenCell: Number(given.dataset.index), padDigit: other.textContent }
  })
  await cells.nth(givenCell).click()
  await page.click(`#pad button[data-value="${padDigit}"]`)
  const holders = await page.evaluate((d) => [...document.querySelectorAll('[role=gridcell]')].filter((c) => c.textContent === d).length, padDigit)
  check(holders > 0 && (await page.locator('.cell.same').count()) === holders, `pad ${padDigit} highlights every cell holding it (${holders})`)
  check(await page.locator(`#pad button[data-value="${padDigit}"]`).evaluate((k) => k.classList.contains('active')), 'the picked pad key is marked active')
  check((await cells.nth(givenCell).textContent()) !== padDigit, 'picking a digit on a given leaves the given unchanged')
  const counts = await page.locator('#pad .count').evaluateAll((els) => els.map((e) => e.checkVisibility() && /^\d+$/.test(e.textContent)))
  check(counts.length === 9 && counts.every(Boolean), 'every pad key shows a visible remaining count')
  const ownDigit = await cells.nth(givenCell).textContent()
  await page.keyboard.press('Escape')
  // Wait on the state Esc produces (the selected given's key active), then read it.
  await page.waitForFunction((d) => document.querySelector('#pad .active')?.dataset.value === d, ownDigit, { timeout: 2000 }).catch(() => {})
  const ownHolders = await page.evaluate((d) => [...document.querySelectorAll('[role=gridcell]')].filter((c) => c.textContent === d).length, ownDigit)
  const sameAfter = await page.locator('.cell.same').allTextContents()
  const activeAfter = await page.locator('#pad .active').getAttribute('data-value')
  check(sameAfter.length === ownHolders - 1 && sameAfter.every((t) => t === ownDigit) && activeAfter === ownDigit, `Esc clears the pad pick; the highlight falls back to the selected cell's ${ownDigit} (${sameAfter.length}/${ownHolders - 1})`)

  // Notes: N toggles notes mode, symbols then toggle pencil marks in a 3×3 mini-grid; placing a digit removes it from
  // its row/column/box peers' notes (unless Auto-remove notes is off); undo/redo and reload restore notes exactly.
  const notesOf = (i) => cells.nth(i).evaluate((c) => [...c.querySelectorAll('.note')].map((n) => n.dataset.sym))
  const spots = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[role=gridcell]')]
    const empty = all.filter((c) => !c.textContent)
    const peer = (a, b) => a.dataset.row === b.dataset.row || a.dataset.col === b.dataset.col || getComputedStyle(a).getPropertyValue('--box') === getComputedStyle(b).getPropertyValue('--box')
    for (const a of empty) {
      const p = empty.find((c) => c !== a && c.dataset.row === a.dataset.row)
      const q = empty.find((c) => c !== a && !peer(a, c))
      if (p && q) return { a: Number(a.dataset.index), p: Number(p.dataset.index), q: Number(q.dataset.index) }
    }
    return null
  })
  check(spots !== null, 'found an empty cell with an empty peer and an empty non-peer')
  const { a: noteA, p: noteP, q: noteQ } = spots
  await page.keyboard.press('n')
  check((await page.getAttribute('#notes', 'aria-pressed')) === 'true', 'N turns notes mode on')
  await cells.nth(noteP).click()
  await page.keyboard.press('1')
  await page.keyboard.press('2')
  check((await notesOf(noteP)).join(',') === '1,2', 'two symbols in notes mode add two pencil marks')
  check((await cells.nth(noteP).textContent()) === '', 'notes do not count as an entry')
  const cols9 = await cells.nth(noteP).evaluate((c) => getComputedStyle(c.querySelector('.notes')).gridTemplateColumns.split(' ').length)
  check(cols9 === 3, `9×9 notes sit in a 3×3 mini-grid (${cols9} columns)`)
  await cells.nth(noteQ).click()
  await page.keyboard.press('1')
  await page.keyboard.press('n')
  check((await page.getAttribute('#notes', 'aria-pressed')) === 'false', 'N turns notes mode off')
  await cells.nth(noteA).click()
  await page.keyboard.press('1')
  check((await notesOf(noteP)).join(',') === '2', 'placing 1 removes it from a row peer\'s notes')
  check((await notesOf(noteQ)).join(',') === '1', 'a non-peer keeps its note')
  await page.keyboard.press('Control+z')
  check((await notesOf(noteP)).join(',') === '1,2' && (await cells.nth(noteA).textContent()) === '', 'undo restores the removed note and the empty cell')
  await page.keyboard.press('Control+Shift+z')
  check((await notesOf(noteP)).join(',') === '2' && (await cells.nth(noteA).textContent()) === '1', 'redo removes the note again')
  await page.click('#erase')
  await setAssist('cleanNotes', false)
  await page.click('#settings-open')
  check(!(await page.isChecked('#assist-cleanNotes')), 'Auto-remove notes can be switched off')
  await page.click('#settings-close')
  await page.click('#notes')
  await cells.nth(noteP).click()
  await page.keyboard.press('1')
  await page.click('#notes')
  await cells.nth(noteA).click()
  await page.keyboard.press('1')
  check((await notesOf(noteP)).join(',') === '1,2', 'with Auto-remove off, a peer keeps its note')
  await page.reload()
  await waitBoard(81)
  check((await notesOf(noteP)).join(',') === '1,2' && (await notesOf(noteQ)).join(',') === '1', 'reload restores the notes')
  await page.click('#settings-open')
  check(!(await page.isChecked('#assist-cleanNotes')), 'reload keeps the Auto-remove setting')
  await page.click('#settings-reset')
  // Auto notes: off by default on Medium; switched on, it fills every empty cell with exactly its candidates as one undoable move.
  check(await page.locator('#fill-notes').isHidden(), 'Auto notes button is hidden by default on Medium')
  await page.click('#assist-autoNotes')
  await page.click('#settings-close')
  const notesBefore = await page.evaluate(() => [...document.querySelectorAll('[role=gridcell]')].map((c) => c.querySelectorAll('.note').length))
  await page.click('#fill-notes')
  const filled = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[role=gridcell]')]
    const box = (c) => getComputedStyle(c).getPropertyValue('--box')
    return all.every((c) => {
      if (c.textContent) return true
      const seen = new Set(all.filter((p) => p !== c && (p.dataset.row === c.dataset.row || p.dataset.col === c.dataset.col || box(p) === box(c))).map((p) => p.textContent).filter(Boolean))
      const notes = [...c.querySelectorAll('.note')].map((n) => n.dataset.sym)
      return notes.join() === ['1', '2', '3', '4', '5', '6', '7', '8', '9'].filter((d) => !seen.has(d)).join()
    })
  })
  check(filled, 'Auto notes fills every empty cell with exactly the digits its row, column and box lack')
  await page.keyboard.press('Control+z')
  const undone = await page.evaluate(() => [...document.querySelectorAll('[role=gridcell]')].map((c) => c.querySelectorAll('.note').length))
  check(undone.join() === notesBefore.join(), 'one undo removes the auto notes')
  await page.click('#settings-open')
  await page.click('#settings-reset')
  await page.click('#settings-close')
  check(await page.locator('#fill-notes').isHidden(), 'Reset to defaults hides Auto notes again on Medium')
  for (const i of [noteA, noteP, noteQ]) {
    await cells.nth(i).click()
    await page.keyboard.press('Backspace')
  }
  check((await notesOf(noteP)).length === 0 && (await cells.nth(noteA).textContent()) === '', 'Backspace erases a value and a cell\'s notes')

  // Pad digit on candidates: picking 3 on the pad (from a given, so nothing is entered) highlights the 3 candidate only.
  await page.keyboard.press('n')
  await cells.nth(noteP).click()
  await page.keyboard.press('3')
  await page.keyboard.press('4')
  await page.keyboard.press('n')
  await cells.nth(givenCell).click()
  await page.click('#pad button[data-value="3"]')
  const hl = await cells.nth(noteP).evaluate((c) => [...c.querySelectorAll('.note')].map((n) => `${n.dataset.sym}:${n.classList.contains('hl')}`).join(','))
  check(hl === '3:true,4:false', `pad 3 highlights the 3 candidate, not the 4 (${hl})`)
  await page.keyboard.press('Escape')
  // After Esc the highlight is the selected given's own digit, so only a candidate of that digit may stay lit.
  const givenDigit = await cells.nth(givenCell).textContent()
  const litAfter = (await page.locator('.note.hl').evaluateAll((ns) => ns.map((n) => n.dataset.sym))).join(',')
  check(litAfter === (['3', '4'].includes(givenDigit) ? givenDigit : ''), `Esc drops the pad pick from the candidates (lit: "${litAfter}", given ${givenDigit})`)
  await cells.nth(noteP).click()
  await page.keyboard.press('Backspace')

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

  // Hard (and every level above Easy) keeps a wrong-but-legal digit and shows no mistake counter.
  const pickEmpty = () => page.evaluate(() => Number([...document.querySelectorAll('[role=gridcell]')].find((c) => !c.textContent).dataset.index))
  const wrongDigit = (sol, i) => String((sol[i] % 9) + 1)
  let sol = await page.evaluate(() => window.__sudoku.solution())
  let wi = await pickEmpty()
  await cells.nth(wi).click()
  await page.keyboard.press(wrongDigit(sol, wi))
  check((await cells.nth(wi).textContent()) === wrongDigit(sol, wi), 'Hard: a wrong digit stays in the cell')
  check(await page.locator('#mistakes').isHidden(), 'Hard: no mistake counter')
  await page.keyboard.press('Backspace')

  // Easy refuses a digit that is not the solution: nothing placed, shake + dashed outline, mistake count up.
  await page.click('#difficulty .level[data-level=easy]')
  await waitBoard(81)
  check((await page.locator('#mistakes').textContent()) === 'Mistakes: 0', 'Easy shows a mistake counter at 0')
  sol = await page.evaluate(() => window.__sudoku.solution())
  wi = await pickEmpty()
  const wcell = cells.nth(wi)
  await wcell.click()
  await page.keyboard.press(wrongDigit(sol, wi))
  check((await wcell.textContent()) === '', 'Easy: a wrong digit is not placed')
  check(await wcell.evaluate((c) => c.classList.contains('wrong') && getComputedStyle(c).animationName === 'wrong' && getComputedStyle(c).outlineStyle === 'dashed'), 'Easy: the cell shakes with a dashed outline')
  check((await page.locator('#mistakes').textContent()) === 'Mistakes: 1', 'Easy: the mistake count goes up')
  check(/not right here — mistake 1/.test(await page.locator('#status').textContent()), 'Easy: the status line names the mistake (not colour-only)')
  check(!(await page.locator('#undo').isEnabled()), 'Easy: a rejected digit leaves nothing to undo')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.keyboard.press(wrongDigit(sol, wi))
  check(await wcell.evaluate((c) => c.classList.contains('wrong') && getComputedStyle(c).animationName === 'none' && getComputedStyle(c).outlineStyle === 'dashed'), 'Easy, reduced motion: no shake, the outline stays')
  await page.emulateMedia({ reducedMotion: null })
  check((await page.locator('#mistakes').textContent()) === 'Mistakes: 2', 'Easy: each wrong digit counts')
  await page.click('#notes')
  await page.keyboard.press(wrongDigit(sol, wi))
  check((await notesOf(wi)).join(',') === wrongDigit(sol, wi) && (await page.locator('#mistakes').textContent()) === 'Mistakes: 2', 'Easy: notes take any digit and count no mistake')
  await page.click('#notes')
  await page.keyboard.press(String(sol[wi]))
  check((await wcell.textContent()) === String(sol[wi]) && (await notesOf(wi)).length === 0, 'Easy: the correct digit places as before and clears the notes')
  await page.reload()
  await waitBoard(81)
  check((await page.locator('#mistakes').textContent()) === 'Mistakes: 2', 'Easy: the mistake count survives a reload')
  await page.click('#restart')
  check((await page.locator('#mistakes').textContent()) === 'Mistakes: 0', 'Easy: restart resets the mistake count')
  await page.click('#difficulty .level[data-level=hard]')
  await waitBoard(81)

  // Size picker: 4×4, 16×16 (letters), 25×25 (worker + spinner). Each size offers its own levels.
  await pickSize(2)
  check((await cells.count()) === 16, '4×4 renders 16 cells')
  const empty4 = await page.evaluate(() => Number([...document.querySelectorAll('[role=gridcell]')].find((c) => !c.textContent).dataset.index))
  await cells.nth(empty4).click()
  await page.click('#notes')
  await page.keyboard.press('4')
  const cols4 = await cells.nth(empty4).evaluate((c) => getComputedStyle(c.querySelector('.notes')).gridTemplateColumns.split(' ').length)
  check(cols4 === 2, `4×4 notes sit in a 2×2 mini-grid (${cols4} columns)`)
  await page.keyboard.press('4')
  await page.click('#notes')
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
  // Letters are typed like digits: an empty cell whose solution is a letter takes it in either case.
  const sol16 = await page.evaluate(() => window.__sudoku.solution())
  const letterCell = await page.evaluate((sol) => [...document.querySelectorAll('[role=gridcell]')].map((c) => Number(c.dataset.index)).find((i) => !document.querySelectorAll('[role=gridcell]')[i].textContent && sol[i] > 9), sol16)
  const letter = String.fromCharCode(64 + sol16[letterCell] - 9)
  await cells.nth(letterCell).click()
  await page.keyboard.press(letter.toLowerCase())
  check((await cells.nth(letterCell).textContent()) === letter, `typing ${letter.toLowerCase()} on 16×16 enters ${letter}`)
  await page.keyboard.press('Backspace')
  await page.keyboard.press(`Shift+${letter}`)
  check((await cells.nth(letterCell).textContent()) === letter, `typing ${letter} on 16×16 enters ${letter}`)
  await page.keyboard.press('Backspace')
  await pickSize(5)
  check((await cells.count()) === 625, '25×25 renders 625 cells')

  // Solve a 4×4 to the completion dialog through the UI, one digit by hint.
  await pickSize(2)
  const solution = await page.evaluate(() => window.__sudoku.solution())
  for (let k = 0; k < 3; k++) await page.keyboard.press('h')
  const empties = await page.evaluate(() => [...document.querySelectorAll('[role=gridcell]')].filter((c) => !c.textContent).map((c) => Number(c.dataset.index)))
  for (const i of empties) {
    await cells.nth(i).click()
    await page.keyboard.press(String(solution[i]))
  }
  check(await page.locator('#board').evaluate((b) => b.classList.contains('solved')), 'finishing the puzzle starts the completion animation')
  check(!(await page.locator('#done').isVisible()), 'the dialog waits for the animation')
  await page.locator('#done').waitFor({ state: 'visible', timeout: 3000 })
  check(await page.locator('#done').isVisible(), 'finishing the puzzle opens the completion dialog')
  check(/^4×4 Easy solved in \d\d:\d\d with 1 hint\.$/.test(await page.locator('#done-text').textContent()), 'dialog names the size, level, time and hint count')
  const rows = page.locator('#done-techniques li')
  check((await rows.count()) >= 1 && (await rows.allTextContents()).every((t) => /^[A-Z][a-z -]+×\d+$/.test(t)), 'dialog lists each technique used with a count')
  check(/^Hardest step: (Hidden|Naked) single$/.test(await page.locator('#done-hardest').textContent()), 'a 4×4 names a single as its hardest step')
  check((await rows.first().evaluate((r) => getComputedStyle(r).animationName)) === 'rise', 'breakdown rows fade in')
  await page.click('#done-new')
  await waitBoard(16)
  check(!(await page.locator('#done').isVisible()), 'New game closes the dialog and deals a new 4×4')

  // Statistics: the solve above is counted per size × level and survives a reload; Esc closes the dialog.
  await page.reload()
  await waitBoard(16)
  await page.click('#stats-open')
  const statRow = await page.locator('#stats tbody tr').allTextContents()
  check(statRow.length === 1 && /^4×4 Easy1(\d\d:\d\d)\1$/.test(statRow[0]), `stats list the 4×4 Easy solve after a reload (${statRow.join(' | ')})`)
  await page.keyboard.press('Escape')
  check(!(await page.locator('#stats').isVisible()), 'Esc closes the statistics')

  // Daily puzzle: a 9×9 Medium whose ID is the same on every press (and for every player) that day.
  await page.click('#daily')
  await waitBoard(81)
  const dailyId = await page.evaluate(() => window.__sudoku.puzzleId())
  check(/^3-medium-/.test(dailyId), `the daily puzzle is a 9×9 Medium (${dailyId})`)
  check((await page.locator('#status').textContent()).startsWith('Daily puzzle '), 'the status line names the daily puzzle')
  await pickSize(2)
  await page.click('#daily')
  await waitBoard(81)
  check((await page.evaluate(() => window.__sudoku.puzzleId())) === dailyId, 'the daily puzzle is the same puzzle on a second press')

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
  await page.goto(`${url}?debug=1&puzzle=3-master-sudoku`)
  await waitBoard(81)
  check((await pressed()) === 'Master', 'a levelled link shows its level')
  await page.goto(`${url}?debug=1`)
  await waitBoard(81)
  check((await page.evaluate(() => window.__sudoku.puzzleId())) === '3-master-sudoku', 'the linked game resumes without its link')
  await page.click('#new-game')
  await waitBoard(81)
  check((await page.evaluate(() => window.__sudoku.puzzleId())).startsWith('3-hard-'), "opening a link does not change the level 9×9 remembers (Hard)")

  // URL state: size, level, puzzle and theme mirror into the query via replaceState (no history entries), a reload or a
  // copied link opens the same puzzle, and invalid values fall back to the defaults.
  const query = () => page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)))
  const givens = (p) => p.evaluate(() => [...document.querySelectorAll('[role=gridcell]')].map((c) => (c.classList.contains('given') ? c.textContent : '')).join(','))
  await page.goto(`${url}?debug=1`)
  await waitBoard(81)
  const historyStart = await page.evaluate(() => history.length)
  let q = await query()
  check(q.size === '9' && q.level === (await pressed()).toLowerCase() && q.puzzle === (await page.evaluate(() => window.__sudoku.puzzleId())), 'the URL names the size, level and puzzle on screen')
  await pickSize(4)
  await page.click('#difficulty .level[data-level=hard]')
  await waitBoard(256)
  q = await query()
  check(q.size === '16' && q.level === 'hard' && q.puzzle.startsWith('4-hard-'), 'changing size and level updates the URL')
  await page.click('#new-game')
  await waitBoard(256)
  check((await query()).puzzle !== q.puzzle, 'a new game updates the puzzle in the URL')
  await page.click('#theme')
  const sharedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.settings')).theme)
  check((await query()).theme === sharedTheme, `changing the theme updates the URL (${sharedTheme})`)
  const shared = await page.evaluate(() => location.href)
  check((await page.evaluate(() => history.length)) === historyStart, 'URL updates add no history entries (replaceState)')
  const sharedId = await page.evaluate(() => window.__sudoku.puzzleId())
  const sharedGivens = await givens(page)
  await page.reload()
  await waitBoard(256)
  check((await page.evaluate(() => window.__sudoku.puzzleId())) === sharedId && (await givens(page)) === sharedGivens, 'reload restores the same puzzle')
  check((await page.inputValue('#size')) === '4' && (await pressed()) === 'Hard', 'reload restores size and level')
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === sharedTheme, 'reload restores the theme')
  const fresh = await browser.newContext({ viewport: { width: 960, height: 540 } })
  const other = await fresh.newPage()
  other.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  other.on('pageerror', (e) => consoleErrors.push(String(e)))
  await other.goto(shared)
  await other.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
  await other.waitForFunction(() => document.querySelectorAll('[role=gridcell]').length === 256, null, { timeout: 30_000 })
  check((await other.evaluate(() => window.__sudoku.puzzleId())) === sharedId && (await givens(other)) === sharedGivens, 'the copied URL opens the same puzzle in a fresh browser')
  check((await other.inputValue('#size')) === '4' && (await other.locator('#difficulty .level[aria-pressed=true]').textContent()) === 'Hard', 'the copied URL opens at the same size and level')
  check((await other.evaluate(() => document.documentElement.dataset.theme)) === sharedTheme, 'the copied URL opens in the same theme')
  await fresh.close()
  const clean = await browser.newContext({ viewport: { width: 960, height: 540 } })
  const blank = await clean.newPage()
  blank.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  blank.on('pageerror', (e) => consoleErrors.push(String(e)))
  await blank.goto(`${url}?debug=1&size=7&level=foo&theme=sepia`)
  await blank.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
  await blank.waitForFunction(() => document.querySelectorAll('[role=gridcell]').length === 81, null, { timeout: 30_000 })
  const defaults = await blank.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)))
  check(defaults.size === '9' && defaults.level === 'medium' && defaults.puzzle.startsWith('3-medium-') && defaults.theme === 'system', 'invalid ?size=7&level=foo&theme=sepia in a fresh browser loads the defaults (9×9 Medium, system theme)')
  await clean.close()

  // Settings: the gear beside pause / timer / theme opens one dialog of assist switches. Each switch applies live
  // and survives a reload; each level sets the defaults, a switch the player flipped survives a level change, Reset
  // drops the overrides, and the overrides ride in the URL (`assists=`).
  {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } })
    const p = await ctx.newPage()
    p.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
    p.on('pageerror', (e) => consoleErrors.push(String(e)))
    const ready = async () => {
      await p.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
      await p.waitForFunction(() => document.querySelectorAll('[role=gridcell]').length > 0, null, { timeout: 30_000 })
    }
    const box = (a) => p.isChecked(`#assist-${a}`)
    const assist = async (a, on) => {
      await p.click('#settings-open')
      await p.setChecked(`#assist-${a}`, on)
      await p.click('#settings-close')
    }
    const peek = async (a) => {
      await p.click('#settings-open')
      const on = await box(a)
      await p.click('#settings-close')
      return on
    }
    // An empty cell with a given in its row: the given's digit clashes, a digit that is not the solution is wrong.
    const spot = () =>
      p.evaluate(() => {
        const all = [...document.querySelectorAll('[role=gridcell]')]
        const sol = window.__sudoku.solution()
        for (const c of all) {
          if (c.textContent) continue
          const clash = all.find((o) => o !== c && o.dataset.row === c.dataset.row && o.classList.contains('given'))
          if (!clash) continue
          const i = Number(c.dataset.index)
          return { i, clash: clash.textContent, clashAt: Number(clash.dataset.index), wrong: String(sol[i] === 1 ? 2 : 1) === clash.textContent ? String(sol[i] === 3 ? 4 : 3) : String(sol[i] === 1 ? 2 : 1) }
        }
        return null
      })
    const cellsP = p.locator('[role=gridcell]')
    const reload = async () => {
      await p.reload()
      await ready()
    }
    await p.goto(`${url}?debug=1&size=9&level=medium`)
    await p.evaluate(() => localStorage.clear())
    await reload()

    // The gear: in the top bar beside the theme button, keyboard-reachable, Esc closes, focus returns to it.
    check((await p.locator('.topbar-actions > *').evaluateAll((els) => els.map((e) => e.id))).join(',').endsWith('theme,lang,settings-open'), 'the gear sits in the top bar after the theme and language buttons')
    check((await p.locator('.topbar-actions #timer, .topbar-actions #pause').count()) === 2, 'timer and pause share the gear\'s group')
    await p.focus('#settings-open')
    await p.keyboard.press('Enter')
    check(await p.locator('#settings').evaluate((d) => d.open), 'Enter on the focused gear opens Settings')
    check((await p.locator('#settings input[type=checkbox]').count()) === 9, 'Settings lists 9 assist switches')
    check(await p.evaluate(() => document.querySelector('#settings').contains(document.activeElement)), 'focus moves into the dialog')
    await p.keyboard.press('Escape')
    check(!(await p.locator('#settings').evaluate((d) => d.open)), 'Esc closes Settings')
    check((await p.evaluate(() => document.activeElement?.id)) === 'settings-open', 'focus returns to the gear')
    await p.keyboard.press('Space')
    await p.click('#settings-close')
    check((await p.evaluate(() => document.activeElement?.id)) === 'settings-open', 'Close returns focus to the gear')

    // Medium defaults: hints, same digit, related, conflicts, note cleanup, timer on; mistake check off.
    await p.click('#settings-open')
    const mediumDefaults = { hints: true, sameDigit: true, related: true, strict: false, conflicts: true, cleanNotes: true, timer: true }
    let ok = true
    for (const [a, on] of Object.entries(mediumDefaults)) ok &&= (await box(a)) === on
    check(ok, 'Medium shows its defaults (mistake check off, the rest on)')
    await p.click('#settings-close')

    // Hints off: the Hint button disappears and H does nothing; persists across reload.
    await assist('hints', false)
    check(await p.locator('#hint').isHidden(), 'hints off hides the Hint button')
    const t = await spot()
    await cellsP.nth(t.i).click()
    await p.keyboard.press('h')
    check((await p.locator('.cell.hint-region').count()) === 0 && !(await p.textContent('#status')).startsWith('Hint'), 'hints off: H gives no hint')
    await reload()
    check(await p.locator('#hint').isHidden() && !(await peek('hints')), 'reload keeps hints off')
    await assist('hints', true)
    check(await p.locator('#hint').isVisible(), 'hints back on shows the Hint button')

    // Timer off hides the timer, live and after reload.
    await assist('timer', false)
    check(await p.locator('#timer').isHidden(), 'timer off hides the timer')
    await reload()
    check(await p.locator('#timer').isHidden() && !(await peek('timer')), 'reload keeps the timer hidden')
    await assist('timer', true)
    check(await p.locator('#timer').isVisible(), 'timer back on shows it')

    // Related highlight off: selecting a cell tints no peers.
    await cellsP.nth(t.i).click()
    check((await p.locator('.cell.related').count()) === 20, 'related highlight on: 20 peers tinted')
    await assist('related', false)
    await cellsP.nth(t.i).click()
    check((await p.locator('.cell.related').count()) === 0, 'related highlight off: no peers tinted')
    await reload()
    await cellsP.nth(t.i).click()
    check((await p.locator('.cell.related').count()) === 0 && !(await peek('related')), 'reload keeps the related highlight off')
    await assist('related', true)

    // Same-digit highlight off: selecting a given highlights no other cell holding its digit.
    await cellsP.nth(t.clashAt).click()
    check((await p.locator('.cell.same').count()) >= 1, 'same-digit highlight on: matching digits highlighted')
    await assist('sameDigit', false)
    await cellsP.nth(t.clashAt).click()
    check((await p.locator('.cell.same').count()) === 0, 'same-digit highlight off: none highlighted')
    await reload()
    await cellsP.nth(t.clashAt).click()
    check((await p.locator('.cell.same').count()) === 0 && !(await peek('sameDigit')), 'reload keeps the same-digit highlight off')
    await assist('sameDigit', true)

    // Conflicts off: a clashing digit lands without the conflict mark.
    await assist('conflicts', false)
    await cellsP.nth(t.i).click()
    await p.keyboard.press(t.clash)
    check((await cellsP.nth(t.i).textContent()) === t.clash && (await p.locator('.cell.conflict, [aria-invalid=true]').count()) === 0, 'conflicts off: a clash is not marked')
    await reload()
    check((await p.locator('.cell.conflict').count()) === 0 && !(await peek('conflicts')), 'reload keeps conflicts off')
    await assist('conflicts', true)
    check(await cellsP.nth(t.i).evaluate((c) => c.classList.contains('conflict')), 'conflicts back on marks the clash')

    // Colour vision deficiency: the conflict carries a non-colour cue (wavy underline) under simulated deuteranopia.
    const cdp = await ctx.newCDPSession(p)
    for (const type of ['deuteranopia', 'protanopia', 'achromatopsia']) {
      await cdp.send('Emulation.setEmulatedVisionDeficiency', { type })
      const deco = await cellsP.nth(t.i).evaluate((c) => getComputedStyle(c).textDecorationLine + ' ' + getComputedStyle(c).textDecorationStyle)
      check(deco.includes('underline') && deco.includes('wavy'), `${type}: the conflict shows a wavy underline (${deco})`)
    }
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' })
    await cellsP.nth(t.i).click()
    await p.keyboard.press('Backspace')

    // Mistake check on (Medium): a wrong digit is refused and counted.
    await assist('strict', true)
    await cellsP.nth(t.i).click()
    await p.keyboard.press(t.wrong)
    check((await cellsP.nth(t.i).textContent()) === '' && (await p.locator('#mistakes').isVisible()), 'mistake check on: a wrong digit is refused and Mistakes shows')
    await reload()
    check((await p.locator('#mistakes').isVisible()) && (await peek('strict')), 'reload keeps the mistake check on')
    await assist('strict', false)
    await cellsP.nth(t.i).click()
    await p.keyboard.press(t.wrong)
    check((await cellsP.nth(t.i).textContent()) === t.wrong && (await p.locator('#mistakes').isHidden()), 'mistake check off: the digit is placed, no counter')
    await p.keyboard.press('Backspace')

    // Note cleanup off persists (behaviour is covered in the notes section above).
    await assist('cleanNotes', false)
    await reload()
    check(!(await peek('cleanNotes')), 'reload keeps Auto-remove notes off')

    // Level change: reset first, then Hard applies Hard's defaults; an override survives Hard → Easy; Reset restores.
    await p.click('#settings-open')
    await p.click('#settings-reset')
    check((await box('cleanNotes')) && !(await box('strict')), 'Reset to defaults restores Medium\'s defaults')
    await p.click('#settings-close')
    check(!('assists' in (await p.evaluate(() => Object.fromEntries(new URLSearchParams(location.search))))), 'no overrides: the URL carries no assists')
    await p.click('#difficulty .level[data-level=hard]')
    await ready()
    await p.click('#settings-open')
    check(!(await box('sameDigit')) && !(await box('cleanNotes')) && (await box('hints')), 'Hard applies its defaults (same digit and note cleanup off)')
    await p.setChecked('#assist-sameDigit', true)
    await p.setChecked('#assist-hints', false)
    await p.click('#settings-close')
    check((await p.evaluate(() => new URLSearchParams(location.search).get('assists'))) === 'h0s1', 'overrides mirror into the URL (assists=h0s1)')
    await p.click('#difficulty .level[data-level=easy]')
    await ready()
    await p.click('#settings-open')
    check((await box('sameDigit')) && !(await box('hints')) && (await box('strict')), 'Hard → Easy: overrides stay, Easy\'s defaults fill the rest (mistake check on)')
    await p.click('#settings-close')
    check(await p.locator('#hint').isHidden(), 'the hints override still hides the Hint button on Easy')
    const link = await p.evaluate(() => location.href)
    await p.click('#settings-open')
    await p.click('#settings-reset')
    check((await box('hints')) && (await box('strict')) && (await box('sameDigit')), 'Reset restores Easy\'s defaults')
    await p.click('#settings-close')
    check(await p.locator('#hint').isVisible(), 'after Reset the Hint button is back')
    await ctx.close()

    // A copied link carries the overrides into a fresh browser.
    const ctx2 = await browser.newContext({ viewport: { width: 960, height: 540 } })
    const p2 = await ctx2.newPage()
    p2.on('pageerror', (e) => consoleErrors.push(String(e)))
    await p2.goto(link)
    await p2.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
    check(await p2.locator('#hint').isHidden(), 'a link with assists=h0s1 opens with hints off')
    await p2.click('#settings-open')
    check((await p2.isChecked('#assist-sameDigit')) && !(await p2.isChecked('#assist-hints')), 'the link\'s overrides show in Settings')
    await ctx2.close()
  }

  // Keyboard only: Tab to New game, Enter, then arrows and digits to the solved dialog; Esc closes it.
  {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => consoleErrors.push(String(e)))
    await p.goto(`${url}?debug=1`)
    await p.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
    const firstId = await p.evaluate(() => window.__sudoku.puzzleId())
    let tabs = 0
    while ((await p.evaluate(() => document.activeElement?.id)) !== 'new-game' && tabs++ < 60) await p.keyboard.press('Tab')
    check(tabs <= 60, `Tab reaches New game (${tabs} presses)`)
    await p.keyboard.press('Enter')
    await p.waitForFunction((id) => window.__sudoku.puzzleId() !== id, firstId, { timeout: 30_000 })
    await p.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
    const sol = await p.evaluate(() => window.__sudoku.solution())
    const todo = await p.evaluate(() => [...document.querySelectorAll('[role=gridcell]')].filter((c) => !c.textContent).map((c) => Number(c.dataset.index)))
    let at = Number(await p.locator('.cell.selected').getAttribute('data-index'))
    for (const i of todo) {
      const dr = Math.floor(i / 9) - Math.floor(at / 9)
      const dc = (i % 9) - (at % 9)
      for (let k = 0; k < Math.abs(dr); k++) await p.keyboard.press(dr > 0 ? 'ArrowDown' : 'ArrowUp')
      for (let k = 0; k < Math.abs(dc); k++) await p.keyboard.press(dc > 0 ? 'ArrowRight' : 'ArrowLeft')
      await p.keyboard.press(String(sol[i]))
      at = i
    }
    await p.locator('#done').waitFor({ state: 'visible', timeout: 3000 })
    check(await p.locator('#done').isVisible(), `keyboard only: ${todo.length} entries from New game reach the Solved dialog`)
    await p.keyboard.press('Escape')
    check(!(await p.locator('#done').isVisible()), 'Esc closes the Solved dialog')
    await ctx.close()
  }

  // Touch on a 390×844 phone: tap a cell, a pad digit, erase and undo — every control on screen without scrolling,
  // every tap target at least 44 px.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => consoleErrors.push(String(e)))
    await p.goto(`${url}?debug=1`)
    await p.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
    await p.waitForFunction(() => document.querySelectorAll('[role=gridcell]').length === 81)
    const fit = await p.evaluate(() => {
      const targets = [...document.querySelectorAll('#pad .pad-key, .actions .action:not([hidden]) .icon, #new-game')]
      const rects = targets.map((t) => t.getBoundingClientRect())
      return {
        scroll: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
        onScreen: rects.every((r) => r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth),
        small: rects.filter((r) => r.width < 44 || r.height < 44).length,
        min: Math.min(...rects.map((r) => Math.min(r.width, r.height))),
      }
    })
    check(fit.scroll, 'phone: the page does not scroll')
    check(fit.onScreen, 'phone: board controls are all on screen')
    check(fit.small === 0, `phone: pad keys and actions are ≥ 44 px (smallest ${fit.min.toFixed(1)} px)`)
    const phoneSol = await p.evaluate(() => window.__sudoku.solution())
    const spot = await p.evaluate(() => Number([...document.querySelectorAll('[role=gridcell]')].find((c) => !c.textContent).dataset.index))
    const tapCell = p.locator('[role=gridcell]').nth(spot)
    await tapCell.tap()
    check(await tapCell.evaluate((c) => c.classList.contains('selected')), 'phone: tapping a cell selects it')
    await p.locator(`#pad button[data-value="${phoneSol[spot]}"]`).tap()
    check((await tapCell.textContent()) === String(phoneSol[spot]), 'phone: tapping a pad digit enters it')
    await p.locator('#erase').tap()
    check((await tapCell.textContent()) === '', 'phone: tapping Erase clears it')
    await p.locator('#undo').tap()
    check((await tapCell.textContent()) === String(phoneSol[spot]), 'phone: tapping Undo restores it')
    await p.locator('#erase').tap()
    await p.locator('#notes').tap()
    await p.locator('#pad button[data-value="1"]').tap()
    await p.locator('#pad button[data-value="2"]').tap()
    await p.locator('#notes').tap()
    const phoneNotes = await tapCell.evaluate((c) => [...c.querySelectorAll('.note')].map((n) => n.dataset.sym).join(','))
    check(phoneNotes === '1,2', `phone: tapping Notes then two digits pencils them in (${phoneNotes})`)
    check(await p.evaluate(() => scrollY === 0), 'phone: the touch run never scrolled')
    await ctx.close()
  }

  // Themes, each in a fresh context so storage starts empty and the OS preference is emulated.
  const LIGHT_CANVAS = 'rgb(255, 255, 255)'
  const DARK_CANVAS = 'rgb(11, 36, 66)'
  const canvas = (p) => p.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
  const attr = (p) => p.evaluate(() => document.documentElement.getAttribute('data-theme'))
  const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('sudoku.settings') || '{}').theme)
  // `shown` is what actually renders, not the hidden attribute: a display rule on .icon can override the attribute.
  const button = (p) =>
    p.evaluate(() => {
      const b = document.querySelector('#theme')
      return { label: b.getAttribute('aria-label'), shown: [...b.querySelectorAll('[data-theme-icon]')].filter((i) => i.getBoundingClientRect().width > 0).map((i) => i.dataset.themeIcon) }
    })
  const themePage = async (colorScheme) => {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, colorScheme })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => consoleErrors.push(String(e)))
    await p.goto(url)
    await p.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
    await p.locator('[role=gridcell]').first().waitFor()
    return { ctx, p }
  }
  {
    // System is the default: no attribute, and the page follows the OS preference in both directions.
    const light = await themePage('light')
    check((await attr(light.p)) === null && (await canvas(light.p)) === LIGHT_CANVAS, 'theme: system under OS light → light canvas, no data-theme')
    await light.ctx.close()
    const { ctx, p } = await themePage('dark')
    check((await attr(p)) === null && (await canvas(p)) === DARK_CANVAS, 'theme: system under OS dark → dark canvas, no data-theme')
    const b0 = await button(p)
    check(b0.label === 'Theme: system' && b0.shown.join() === 'system', `theme: button reads Theme: system with only its icon shown (${b0.label}, ${b0.shown})`)
    // One press per state, each surviving a reload; the board and top bar keep their exact boxes throughout.
    const boxes = () => Promise.all(['#board', 'header'].map((s) => p.locator(s).boundingBox()))
    const before = JSON.stringify(await boxes())
    for (const [mode, want] of [
      ['light', LIGHT_CANVAS],
      ['dark', DARK_CANVAS],
      ['system', DARK_CANVAS],
    ]) {
      await p.click('#theme')
      const b = await button(p)
      check(b.label === `Theme: ${mode}` && b.shown.join() === mode, `theme: a press → Theme: ${mode} with only its icon shown (${b.shown})`)
      check((await attr(p)) === (mode === 'system' ? null : mode) && (await canvas(p)) === want, `theme: ${mode} sets data-theme=${mode === 'system' ? 'none' : mode} and its canvas`)
      check(JSON.stringify(await boxes()) === before, `theme: no layout shift on the press to ${mode}`)
      await p.reload()
      await p.locator('[role=gridcell]').first().waitFor()
      check((await stored(p)) === mode && (await canvas(p)) === want && (await button(p)).label === `Theme: ${mode}`, `theme: ${mode} survives a reload`)
    }
    // Back on system, an OS switch is followed live, with no reload and no script.
    await p.emulateMedia({ colorScheme: 'light' })
    check((await canvas(p)) === LIGHT_CANVAS, 'theme: system follows an OS switch to light live')
    await ctx.close()
  }
  {
    // No flash: with the app bundle blocked, only the inline <head> script can set the stored theme.
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, colorScheme: 'light' })
    await ctx.addInitScript(() => localStorage.setItem('sudoku.settings', JSON.stringify({ n: 3, theme: 'dark' })))
    await ctx.route('**/assets/*.js', (r) => r.abort())
    const p = await ctx.newPage()
    await p.goto(url)
    const theme = await attr(p)
    check(theme === 'dark' && (await canvas(p)) === DARK_CANVAS, `theme: stored dark applies before the app script runs (${theme})`)
    await ctx.close()
  }

  // Technique breakdown on a 9×9 Expert, under reduced motion: the dialog opens at once, the rows do not animate,
  // and the hardest step is an X-wing-class technique (the Expert tier).
  {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion: 'reduce' })
    const p = await ctx.newPage()
    p.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
    p.on('pageerror', (e) => consoleErrors.push(String(e)))
    await p.goto(`${url}?puzzle=3-expert-7&debug=1`)
    await p.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
    await p.waitForFunction(() => document.querySelectorAll('[role=gridcell]').length === 81, null, { timeout: 30_000 })
    const sol = await p.evaluate(() => window.__sudoku.solution())
    const open = await p.evaluate(() => [...document.querySelectorAll('[role=gridcell]')].filter((c) => !c.textContent).map((c) => Number(c.dataset.index)))
    const grid = p.locator('[role=gridcell]')
    for (const i of open) {
      await grid.nth(i).click()
      await p.keyboard.press(String(sol[i]))
    }
    await p.locator('#done').waitFor({ state: 'visible', timeout: 500 })
    check(await p.locator('#done').isVisible(), 'reduced motion: the dialog opens without the wave delay')
    check(/^9×9 Expert solved in \d\d:\d\d without hints\.$/.test(await p.locator('#done-text').textContent()), 'breakdown: dialog names 9×9 Expert, the time and no hints')
    const hardest = (await p.locator('#done-hardest strong').textContent()) ?? ''
    check(['X-wing', 'XY-wing', 'Naked triple', 'Hidden triple'].includes(hardest), `breakdown: an Expert names an X-wing-class hardest step (${hardest})`)
    const names = await p.locator('#done-techniques .name').allTextContents()
    check(names.includes(hardest) && names.includes('Hidden single'), `breakdown: the list carries the hardest step and the singles (${names.join(', ')})`)
    check((await p.locator('#done-techniques li').first().evaluate((r) => getComputedStyle(r).animationName)) === 'none', 'reduced motion: breakdown rows do not animate')
    await ctx.close()
  }

  // Language: EN ↔ DE. The browser's language is the default (any de* → DE), the language button beside the theme
  // button switches it and the pick persists, `?lang=` beats both, <html lang> follows. Then a sweep of every screen in
  // German — board, hint, notes, a conflict, a rejected digit, pause, Settings, Statistics, the completion dialog — finds
  // no English string, and the 390 px header still fits.
  {
    // The tables, read from the source: an English string that differs from its German one must never show in German.
    const src = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
    const table = (name) => {
      const body = src.slice(src.indexOf(`const ${name}`), src.indexOf('\n}\n', src.indexOf(`const ${name}`)))
      return Object.fromEntries([...body.matchAll(/^\s+'?([\w -]+)'?: '((?:[^'\\]|\\.)*)',$/gm)].map((m) => [m[1], m[2]]))
    }
    const en = table('EN')
    const de = table('DE')
    check(Object.keys(en).length > 100 && Object.keys(en).length === Object.keys(de).length, `language: both tables parse with the same key count (${Object.keys(en).length}, ${Object.keys(de).length})`)
    const deText = Object.values(de).join('\n')
    const esc = (f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Fragments of every English string between its placeholders, ≥ 4 letters, absent from every German string.
    const englishOnly = [...new Set(Object.keys(en).filter((k) => en[k] !== de[k]).flatMap((k) => en[k].split(/\{\w+\}/).map((f) => f.replace(/^[\s,.:·—()]+|[\s,.:·—()]+$/g, ''))))]
      .filter((f) => /[A-Za-z]{4}/.test(f) && !new RegExp(`\\b${esc(f)}\\b`).test(deText))
      .map((f) => ({ f, re: new RegExp(`(^|[^\\p{L}])${esc(f)}($|[^\\p{L}])`, 'u') }))
    const english = (p) =>
      p.evaluate(() => {
        const out = [document.body.innerText]
        for (const e of document.querySelectorAll('*')) for (const a of ['aria-label', 'title', 'aria-description']) if (e.getAttribute(a)) out.push(e.getAttribute(a))
        return out.join('\n')
      }).then((text) => englishOnly.filter(({ re }) => re.test(text)).map(({ f }) => f))
    const ready = async (p, cells) => {
      await p.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
      await p.waitForFunction((n) => document.querySelectorAll('[role=gridcell]').length === n, cells, { timeout: 30_000 })
    }
    const lang = (p) => p.evaluate(() => ({ html: document.documentElement.lang, button: document.querySelector('#lang').textContent, label: document.querySelector('#lang').getAttribute('aria-label'), url: new URLSearchParams(location.search).get('lang'), stored: (JSON.parse(localStorage.getItem('sudoku.settings') || '{}')).lang ?? null, newGame: document.querySelector('#new-game').textContent }))

    for (const [locale, want] of [['de-DE', 'de'], ['de-AT', 'de'], ['en-US', 'en'], ['fr-FR', 'en']]) {
      const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, locale })
      const p = await ctx.newPage()
      p.on('pageerror', (e) => consoleErrors.push(String(e)))
      await p.goto(`${url}?debug=1`)
      await ready(p, 81)
      const l = await lang(p)
      check(l.html === want && l.button === want.toUpperCase() && l.url === want && l.stored === null && l.newGame === (want === 'de' ? 'Neues Spiel' : 'New game'), `language: browser ${locale} defaults to ${want} (html lang ${l.html}, button ${l.button}, url ${l.url}, nothing stored)`)
      await ctx.close()
    }

    {
      const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, locale: 'en-US' })
      const p = await ctx.newPage()
      p.on('pageerror', (e) => consoleErrors.push(String(e)))
      await p.goto(`${url}?debug=1`)
      await ready(p, 81)
      const order = await p.locator('.topbar-actions > *').evaluateAll((els) => els.map((e) => e.id))
      check(order[order.indexOf('theme') + 1] === 'lang', `language: the button sits next to the theme button (${order.join(',')})`)
      await p.focus('#lang')
      await p.keyboard.press('Enter')
      let l = await lang(p)
      check(l.html === 'de' && l.button === 'DE' && l.url === 'de' && l.stored === 'de' && l.newGame === 'Neues Spiel' && l.label.startsWith('DE — Sprache'), `language: Enter on the focused button switches to German, stored and in the URL (${JSON.stringify(l)})`)
      check((await p.locator('#difficulty .level[data-level=medium]').textContent()) === 'Mittel' && (await p.locator('#theme').getAttribute('aria-label')).startsWith('Design'), 'language: the switch relabels the difficulty row and the theme button live')
      check((await p.locator('[role=gridcell]').first().getAttribute('aria-label')).startsWith('Zeile 1, Spalte 1'), 'language: the switch relabels the board cells live')
      check((await english(p)).length === 0, `language: no English left on the board after the switch (${(await english(p)).join(' | ')})`)
      await p.reload()
      await ready(p, 81)
      l = await lang(p)
      check(l.html === 'de' && l.newGame === 'Neues Spiel', 'language: the pick survives a reload')
      await p.keyboard.press('Tab') // focus leaves the body so Space on the button is a real press
      await p.focus('#lang')
      await p.keyboard.press('Space')
      l = await lang(p)
      check(l.html === 'en' && l.stored === 'en' && l.url === 'en' && l.newGame === 'New game', 'language: Space switches back to English')
      // `?lang=` beats the stored pick and becomes it.
      await p.goto(`${url}?debug=1&lang=de`)
      await ready(p, 81)
      l = await lang(p)
      check(l.html === 'de' && l.stored === 'de', `language: ?lang=de beats the stored English and becomes the pick (${l.html}, stored ${l.stored})`)
      await p.goto(`${url}?debug=1&lang=xx`)
      await ready(p, 81)
      check((await lang(p)).html === 'de', 'language: an invalid ?lang= is ignored')
      await ctx.close()
    }

    // German sweep of every screen, on a 4×4 Easy (mistake counter on) played to the end.
    {
      const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, locale: 'de-DE', reducedMotion: 'reduce' })
      const p = await ctx.newPage()
      p.on('pageerror', (e) => consoleErrors.push(String(e)))
      const sweep = async (screen) => {
        const left = await english(p)
        check(left.length === 0, `language: German ${screen} shows no English string${left.length ? ': ' + left.join(' | ') : ''}`)
      }
      await p.goto(`${url}?puzzle=2-easy-5&debug=1`)
      await ready(p, 16)
      await sweep('board')
      const sol = await p.evaluate(() => window.__sudoku.solution())
      const open = await p.evaluate(() => [...document.querySelectorAll('[role=gridcell]')].filter((c) => !c.textContent).map((c) => Number(c.dataset.index)))
      await p.locator('[role=gridcell]').nth(open[0]).click()
      await p.keyboard.press(String((sol[open[0]] % 4) + 1))
      await sweep('rejected digit')
      await p.click('#hint')
      await sweep('hint, first press')
      await p.click('#hint')
      check((await p.locator('#status').textContent()).startsWith('Tipp: '), `language: the named hint is German (${await p.locator('#status').textContent()})`)
      await sweep('hint, technique named')
      await p.click('#hint')
      await sweep('hint, digit placed')
      await p.click('#notes')
      await sweep('notes on')
      await p.click('#notes')
      await p.click('#settings-open')
      await p.setChecked('#assist-strict', false)
      await sweep('Settings')
      await p.click('#settings-close')
      const rest = await p.evaluate(() => [...document.querySelectorAll('[role=gridcell]')].filter((c) => !c.textContent).map((c) => Number(c.dataset.index)))
      const clash = await p.evaluate((i) => {
        const all = [...document.querySelectorAll('[role=gridcell]')]
        return all.find((o) => o.dataset.row === all[i].dataset.row && o.textContent)?.textContent ?? null
      }, rest[0])
      await p.locator('[role=gridcell]').nth(rest[0]).click()
      await p.keyboard.press(clash)
      check((await p.locator('#status').textContent()).includes('Konflikt'), `language: the conflict line is German (${await p.locator('#status').textContent()})`)
      await sweep('rule conflict')
      await p.keyboard.press('Delete')
      await p.click('#pause')
      await sweep('pause')
      await p.click('#resume')
      await p.click('#stats-open')
      await sweep('empty Statistics')
      await p.keyboard.press('Escape')
      for (const i of rest) {
        await p.locator('[role=gridcell]').nth(i).click()
        await p.keyboard.press(String(sol[i]))
      }
      await p.locator('#done').waitFor({ state: 'visible', timeout: 1000 })
      await sweep('completion dialog')
      check((await p.locator('#done-title').textContent()) === 'Gelöst!' && (await p.locator('#done-techniques li .name').first().textContent()) === 'Versteckter Single', 'language: the completion dialog and its breakdown are German')
      await p.click('#done-close')
      await p.click('#stats-open')
      await sweep('Statistics')
      check((await p.locator('#stats th[scope=row]').first().textContent()) === '4×4 Leicht', 'language: Statistics names the level in German')
      await p.keyboard.press('Escape')
      await ctx.close()
    }

    // The 390×844 header fits in both languages with ≥ 12 px between the tabs and the buttons, slack for wider fonts
    // (CI measured 20–22 px, macOS 32–33 px), and no horizontal scroll.
    for (const l of ['en', 'de']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
      const p = await ctx.newPage()
      p.on('pageerror', (e) => consoleErrors.push(String(e)))
      await p.goto(`${url}?debug=1&lang=${l}&level=easy`)
      await ready(p, 81)
      const fit = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, slack: document.querySelector('.topbar-actions').getBoundingClientRect().left - document.querySelector('.modes').getBoundingClientRect().right }))
      check(fit.scroll <= 390 && fit.slack >= 12, `language: the ${l} header fits 390×844 with room to spare (scrollWidth ${fit.scroll}, ${Math.round(fit.slack)} px between tabs and buttons)`)
      await ctx.close()
    }
  }

  // Accessibility: axe-core (WCAG 2.0–2.2 A/AA rules) on the board, Settings, Statistics and the completion dialog,
  // in both themes — 0 serious or critical violations. Then the screen-reader path on a 4×4 Easy: arrows move focus
  // onto the gridcell (its accessible name is the cell), an entry is announced in the live region, and a rejected digit
  // and the solve each give a haptic tick where navigator.vibrate exists, off with the Haptics assist.
  {
    const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
    const scan = async (p, label) => {
      await p.addScriptTag({ content: axeSource })
      const r = await p.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }))
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      check(bad.length === 0, `axe: ${label} has 0 serious/critical violations${bad.length ? ': ' + bad.map((v) => `${v.id} (${v.nodes.length}: ${v.nodes[0].target.join(' ')})`).join(', ') : ''}`)
    }
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion: 'reduce' })
      const p = await ctx.newPage()
      p.on('pageerror', (e) => consoleErrors.push(String(e)))
      await p.goto(`${url}?puzzle=2-easy-5&theme=${theme}&debug=1`)
      await p.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
      await p.waitForFunction(() => document.querySelectorAll('[role=gridcell]').length === 16, null, { timeout: 30_000 })
      await scan(p, `${theme} board`)
      await p.click('#settings-open')
      await scan(p, `${theme} Settings`)
      await p.click('#settings-close')
      await p.click('#stats-open')
      await scan(p, `${theme} Statistics`)
      await p.keyboard.press('Escape')
      const sol = await p.evaluate(() => window.__sudoku.solution())
      const open = await p.evaluate(() => [...document.querySelectorAll('[role=gridcell]')].filter((c) => !c.textContent).map((c) => Number(c.dataset.index)))
      for (const i of open) {
        await p.locator('[role=gridcell]').nth(i).click()
        await p.keyboard.press(String(sol[i]))
      }
      await p.locator('#done').waitFor({ state: 'visible', timeout: 1000 })
      await scan(p, `${theme} completion dialog`)
      await ctx.close()
    }

    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion: 'reduce' })
    await ctx.addInitScript(() => {
      window.__buzz = []
      navigator.vibrate = (pattern) => (window.__buzz.push(pattern), true)
    })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => consoleErrors.push(String(e)))
    await p.goto(`${url}?puzzle=2-easy-5&debug=1`)
    await p.locator('#spinner').waitFor({ state: 'hidden', timeout: 30_000 })
    await p.waitForFunction(() => document.querySelectorAll('[role=gridcell]').length === 16, null, { timeout: 30_000 })
    const focusedName = () => p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
    const sol = await p.evaluate(() => window.__sudoku.solution())
    const open = await p.evaluate(() => [...document.querySelectorAll('[role=gridcell]')].filter((c) => !c.textContent).map((c) => Number(c.dataset.index)))
    const first = open[0]
    await p.locator('[role=gridcell]').nth(first).click()
    const r = Math.floor(first / 4) + 1
    const c = (first % 4) + 1
    check((await focusedName()) === `Row ${r}, column ${c}, empty`, `screen reader: the focused gridcell names its row, column and content (${await focusedName()})`)
    const target = first % 4 === 3 ? first - 1 : first + 1
    await p.keyboard.press(first % 4 === 3 ? 'ArrowLeft' : 'ArrowRight')
    check((await focusedName()).startsWith(`Row ${Math.floor(target / 4) + 1}, column ${(target % 4) + 1}, `), `screen reader: an arrow moves focus to the next gridcell (${await focusedName()})`)
    await p.locator('[role=gridcell]').nth(first).click()
    const wrong = (sol[first] % 4) + 1
    await p.keyboard.press(String(wrong))
    check((await p.locator('#announce').textContent()) === `${wrong} rejected, row ${r}, column ${c}`, `screen reader: a rejected digit is announced (${await p.locator('#announce').textContent()})`)
    check((await p.evaluate(() => window.__buzz.length)) === 1, 'haptics: a rejected Easy digit vibrates once')
    await p.keyboard.press(String(sol[first]))
    check((await focusedName()) === `Row ${r}, column ${c}, ${sol[first]}`, `screen reader: after an entry the focused gridcell names the digit (${await focusedName()})`)
    check((await p.locator('#announce').textContent()) === `${sol[first]} entered, row ${r}, column ${c}`, `screen reader: the entry is announced (${await p.locator('#announce').textContent()})`)
    check((await p.locator('#announce').getAttribute('aria-live')) === 'polite', 'screen reader: the announcer is a polite live region')
    for (const i of open.slice(1)) {
      await p.locator('[role=gridcell]').nth(i).click()
      await p.keyboard.press(String(sol[i]))
    }
    await p.locator('#done').waitFor({ state: 'visible', timeout: 1000 })
    check((await p.evaluate(() => window.__buzz.length)) === 2, 'haptics: the solve vibrates')
    await p.keyboard.press('Escape')
    await p.click('#settings-open')
    await p.setChecked('#assist-haptics', false)
    await p.click('#settings-close')
    await p.goto(`${url}?puzzle=2-easy-6&debug=1`)
    await p.waitForFunction(() => document.querySelectorAll('[role=gridcell]').length === 16, null, { timeout: 30_000 })
    const sol2 = await p.evaluate(() => window.__sudoku.solution())
    const empty2 = await p.evaluate(() => [...document.querySelectorAll('[role=gridcell]')].findIndex((c) => !c.textContent))
    await p.evaluate(() => (window.__buzz = []))
    await p.locator('[role=gridcell]').nth(empty2).click()
    await p.keyboard.press(String((sol2[empty2] % 4) + 1))
    check((await p.evaluate(() => window.__buzz.length)) === 0, 'haptics: switched off in Settings, a rejected digit does not vibrate')
    await ctx.close()
  }

  check(consoleErrors.length === 0, `no console errors${consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''}`)
} finally {
  await browser.close()
  server?.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
