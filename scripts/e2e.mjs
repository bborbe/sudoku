// Browser test against the production build (`vite preview`) or, with E2E_URL, a deployed site.
// Drives the real UI with mouse and keyboard: selection, entry, conflicts, erase, pencil-mark notes, the size picker,
// the difficulty row, graduated hints, a full 4×4 solve to the completion dialog, the technique breakdown (9×9 Expert,
// reduced motion), reload persistence and the hidden-tab clock pause,
// the key table (Esc, Delete, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, keys ignored in a text field), the pad-digit highlight,
// a keyboard-only 9×9 from New game to Solved, and a 390×844 touch run.
// Fails on any console error. Usage: npm run build && npm run e2e   (E2E_PORT=<port> pins the preview port; default: a free one)
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

  // Top bar: logo, Classic tab selected, Killer tab shown but disabled.
  check(await page.locator('.topbar .brand svg').isVisible(), 'top bar shows the logo')
  check((await page.getAttribute('#mode-classic', 'aria-selected')) === 'true', 'Classic tab is the selected mode')
  check(await page.locator('#mode-killer').isDisabled(), 'Killer tab is shown disabled')
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
  await page.click('#clean-notes')
  check(!(await page.isChecked('#clean-notes')), 'Auto-remove notes can be switched off')
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
  check(!(await page.isChecked('#clean-notes')), 'reload keeps the Auto-remove setting')
  await page.click('#clean-notes')
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
      const targets = [...document.querySelectorAll('#pad .pad-key, .actions .action .icon, #new-game, label.setting')]
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

  check(consoleErrors.length === 0, `no console errors${consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''}`)
} finally {
  await browser.close()
  server?.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
