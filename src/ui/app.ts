// DOM UI: renders the Game, routes mouse / touch / keyboard input into it, runs the clock and persists.
// The board is a CSS Grid with ARIA grid semantics; every dimension comes from the game's Size.
import { Game } from '../engine/game'
import { BOX_SIZES, isBoxSize, symbolOf, valueOf, type BoxSize } from '../engine/size'
import { clampLevel, defaultLevel, LEVEL_LABELS, type Level } from '../puzzle/difficulty'
import { generate, parsePuzzleId, randomSeed, type Puzzle } from '../puzzle/generator'
import type { GenerateRequest, GenerateResponse } from '../puzzle/worker'
import { loadGame, loadSettings, saveGame, saveSettings, THEMES, type Theme } from '../store/storage'
import { applyTheme, nextTheme } from './theme'
import { Clock, formatTime } from './clock'
import { DifficultyRow } from './difficulty-row'

const SAVE_EVERY_MS = 1000
// Completion wave: each box flashes in turn, then the dialog opens. Matches the `solved` keyframes in style.css.
const SOLVE_WAVE_MS = 700
const WRONG_MS = 600

// Line icons, 24×24, stroked with currentColor (style.css `.icon svg`); the logo is a filled grid tile.
const ICONS: Record<string, string> = {
  logo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="currentColor"/><path d="M8.5 1.5v21M15.5 1.5v21M1.5 8.5h21M1.5 15.5h21" stroke-width="1.4" opacity=".75"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
  erase: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19"/><path d="M22 21H7M5 11l9 9"/></svg>',
  notes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 4 13 8-13 8z"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
}

const THEME_ICONS: Record<Theme, string> = { system: 'monitor', light: 'sun', dark: 'moon' }

function icon(name: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'icon'
  span.innerHTML = ICONS[name]
  return span
}

// A round icon button with its label underneath (side-panel actions).
function actionButton(id: string, iconName: string, label: string): HTMLButtonElement {
  return el('button', { id, type: 'button', class: 'action' }, icon(iconName), el('span', { class: 'label', text: label }))
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = v
    else node.setAttribute(k, v)
  }
  node.append(...children)
  return node
}

// A cell's pencil marks: one span per noted candidate, placed at its slot in an n×n mini-grid. The symbol is drawn
// by CSS from data-sym, so the cell's textContent stays its value (empty) and notes never read as an entry.
function notesGrid(mask: number, n: number, N: number): HTMLElement {
  const grid = el('span', { class: 'notes', 'aria-hidden': 'true' })
  for (let d = 1; d <= N; d++) {
    if (!(mask & (1 << (d - 1)))) continue
    const note = el('span', { class: 'note', 'data-sym': symbolOf(d) })
    note.style.gridRow = String(Math.floor((d - 1) / n) + 1)
    note.style.gridColumn = String(((d - 1) % n) + 1)
    grid.append(note)
  }
  return grid
}

function noteList(mask: number, N: number): string {
  const out: string[] = []
  for (let d = 1; d <= N; d++) if (mask & (1 << (d - 1))) out.push(symbolOf(d))
  return out.join(' ')
}

function sizeLabel(n: number): string {
  return `${n * n}×${n * n}`
}

/** The difficulty a board size deals at: the one last picked there, else the size's default. */
function savedLevel(n: BoxSize): Level {
  return loadSettings().levels[n] ?? defaultLevel(n)
}

export class App {
  private game: Game | null = null
  private selected = 0
  private paused = false
  // Notes mode: pad keys and typed symbols toggle pencil marks instead of placing digits.
  private notesMode = false
  private cleanNotes = loadSettings().cleanNotes
  private celebrating = false
  private waveTimer = 0
  private generating = false
  private requestId = 0
  private lastSave = 0
  private readonly clock = new Clock()
  private readonly worker = new Worker(new URL('../puzzle/worker.ts', import.meta.url), { type: 'module' })
  private pending: GenerateRequest | null = null

  private readonly sizeSelect: HTMLSelectElement
  private readonly difficulty: DifficultyRow
  private readonly timer: HTMLElement
  private readonly pauseButton: HTMLButtonElement
  private readonly themeButton: HTMLButtonElement
  private readonly board: HTMLElement
  private readonly boardWrap: HTMLElement
  private readonly overlay: HTMLElement
  private readonly spinner: HTMLElement
  private readonly pad: HTMLElement
  private readonly status: HTMLElement
  private readonly mistakesEl: HTMLElement
  private readonly undoButton: HTMLButtonElement
  private readonly redoButton: HTMLButtonElement
  private readonly notesButton: HTMLButtonElement
  private readonly dialog: HTMLDialogElement
  private readonly dialogText: HTMLElement
  private readonly footerId: HTMLElement
  private cells: HTMLElement[] = []
  private padKeys: HTMLButtonElement[] = []

  constructor(root: HTMLElement) {
    this.sizeSelect = el('select', { id: 'size', 'aria-label': 'Board size' })
    for (const n of BOX_SIZES) this.sizeSelect.append(el('option', { value: String(n), text: sizeLabel(n) }))
    this.difficulty = new DifficultyRow((level) => this.newGame(this.currentBoxSize(), level))
    this.timer = el('span', { class: 'timer', id: 'timer', role: 'timer', 'aria-label': 'Elapsed time', text: '00:00' })
    this.pauseButton = el('button', { class: 'round', id: 'pause', type: 'button', 'aria-label': 'Pause' }, icon('pause'))
    // One button cycles system → light → dark; all three icons are built once and only the current one is shown,
    // so a press swaps visibility, never the button's size.
    this.themeButton = el(
      'button',
      { class: 'round', id: 'theme', type: 'button' },
      ...THEMES.map((t) => {
        const span = icon(THEME_ICONS[t])
        span.dataset.themeIcon = t
        return span
      }),
    )
    const newButton = el('button', { id: 'new-game', type: 'button', class: 'primary', text: 'New game' })

    this.board = el('div', { class: 'board', id: 'board', role: 'grid', 'aria-label': 'Sudoku board' })
    this.overlay = el(
      'div',
      { class: 'overlay', id: 'paused', hidden: '' },
      el('p', { text: 'Paused' }),
      el('button', { id: 'resume', type: 'button', text: 'Resume' }),
    )
    this.spinner = el('div', { class: 'overlay spinner', id: 'spinner', role: 'status', hidden: '' }, el('span', { class: 'ring' }), el('p', { text: 'Building a puzzle…' }))
    this.boardWrap = el('div', { class: 'board-wrap' }, this.board, this.overlay, this.spinner)

    this.pad = el('div', { class: 'pad', id: 'pad', role: 'group', 'aria-label': 'Number pad' })
    this.undoButton = actionButton('undo', 'undo', 'Undo')
    this.redoButton = actionButton('redo', 'redo', 'Redo')
    const eraseButton = actionButton('erase', 'erase', 'Erase')
    this.notesButton = actionButton('notes', 'notes', 'Notes')
    this.notesButton.setAttribute('aria-pressed', 'false')
    this.notesButton.title = 'Notes (N)'
    const restartButton = actionButton('restart', 'restart', 'Restart')
    const actions = el('div', { class: 'actions', role: 'group', 'aria-label': 'Actions' }, this.undoButton, this.redoButton, eraseButton, this.notesButton, restartButton)
    const cleanBox = el('input', { type: 'checkbox', id: 'clean-notes' })
    cleanBox.checked = this.cleanNotes
    const cleanSetting = el('label', { class: 'setting' }, cleanBox, el('span', { text: 'Auto-remove notes' }))
    this.status = el('p', { class: 'status', id: 'status', 'aria-live': 'polite' })
    this.mistakesEl = el('span', { class: 'mistakes', id: 'mistakes', hidden: '' })

    this.dialogText = el('p', { id: 'done-text' })
    const dialogNew = el('button', { id: 'done-new', type: 'button', text: 'New game', autofocus: '' })
    const dialogClose = el('button', { id: 'done-close', type: 'button', class: 'secondary', text: 'Close' })
    this.dialog = el('dialog', { id: 'done', 'aria-labelledby': 'done-title' }, el('h2', { id: 'done-title', text: 'Solved!' }), this.dialogText, el('div', { class: 'dialog-actions' }, dialogNew, dialogClose))

    this.footerId = el('span', { id: 'puzzle-id' })
    const commit = __COMMIT_SHA__.slice(0, 7)
    const footer = el('footer', {}, this.footerId, el('span', { text: `v${__APP_VERSION__} · ${commit}` }))

    // Top bar: logo, mode tabs (Classic is the only playable mode; Killer is announced, disabled), timer + pause.
    const brand = el('h1', { class: 'brand' }, icon('logo'), el('span', { text: 'Sudoku' }))
    const modes = el(
      'nav',
      { class: 'modes', role: 'tablist', 'aria-label': 'Game mode' },
      el('button', { type: 'button', role: 'tab', class: 'mode', id: 'mode-classic', 'aria-selected': 'true', text: 'Classic' }),
      el('button', { type: 'button', role: 'tab', class: 'mode', id: 'mode-killer', 'aria-selected': 'false', disabled: '', title: 'Coming later' }, 'Killer', el('small', { text: 'soon' })),
    )
    const header = el('header', { class: 'topbar' }, brand, modes, el('div', { class: 'topbar-actions' }, this.timer, this.pauseButton, this.themeButton))
    const info = el('div', { class: 'game-info' }, this.difficulty.element, this.mistakesEl, el('label', { class: 'size-pick' }, el('span', { text: 'Size' }), this.sizeSelect))
    const side = el('div', { class: 'side' }, actions, this.pad, newButton, cleanSetting, this.status)
    root.append(header, info, el('main', {}, this.boardWrap, side), footer, this.dialog)

    this.sizeSelect.addEventListener('change', () => {
      const n = Number(this.sizeSelect.value)
      if (isBoxSize(n)) this.newGame(n)
    })
    newButton.addEventListener('click', () => this.newGame(this.currentBoxSize()))
    this.pauseButton.addEventListener('click', () => this.setPaused(!this.paused))
    this.themeButton.addEventListener('click', () => {
      const theme = nextTheme(loadSettings().theme)
      saveSettings({ theme })
      applyTheme(theme)
      this.renderThemeButton(theme)
    })
    applyTheme(loadSettings().theme)
    this.renderThemeButton(loadSettings().theme)
    this.overlay.querySelector('button')!.addEventListener('click', () => this.setPaused(false))
    this.undoButton.addEventListener('click', () => this.act(() => this.game!.undo()))
    this.redoButton.addEventListener('click', () => this.act(() => this.game!.redo()))
    eraseButton.addEventListener('click', () => this.enter(0))
    this.notesButton.addEventListener('click', () => this.toggleNotesMode())
    cleanBox.addEventListener('change', () => {
      this.cleanNotes = cleanBox.checked
      saveSettings({ cleanNotes: this.cleanNotes })
    })
    restartButton.addEventListener('click', () => this.restart())
    dialogNew.addEventListener('click', () => {
      this.dialog.close()
      this.newGame(this.currentBoxSize())
    })
    dialogClose.addEventListener('click', () => this.dialog.close())
    this.board.addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('[role=gridcell]')
      if (cell) this.select(Number(cell.dataset.index), true)
    })
    this.pad.addEventListener('click', (e) => {
      const key = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-value]')
      if (key) this.enter(Number(key.dataset.value))
    })
    document.addEventListener('keydown', (e) => this.onKey(e))
    document.addEventListener('visibilitychange', () => {
      this.syncClock()
      if (document.visibilityState === 'hidden') this.save(true)
    })
    window.addEventListener('pagehide', () => this.save(true))
    this.worker.addEventListener('message', (e: MessageEvent<GenerateResponse>) => this.onPuzzle(e.data))
    // A worker that fails to load or crashes must not leave the spinner up: generate on the main thread instead.
    this.worker.addEventListener('error', (e) => {
      e.preventDefault()
      const req = this.pending
      if (req) this.onPuzzle({ requestId: req.requestId, puzzle: generate(req.n, req.seed, req.level) })
    })
    window.setInterval(() => this.tick(), 250)

    if (new URLSearchParams(location.search).has('debug')) {
      ;(window as unknown as { __sudoku: unknown }).__sudoku = {
        solution: () => this.game?.solution.slice() ?? null,
        elapsedMs: () => this.clock.elapsed(performance.now()),
        puzzleId: () => this.game?.puzzleId ?? null,
        level: () => (this.game ? this.levelOf(this.game) : null),
      }
    }
  }

  // The button names and shows the current mode (system / light / dark); a press advances it.
  private renderThemeButton(theme: Theme): void {
    this.themeButton.setAttribute('aria-label', `Theme: ${theme}`)
    for (const span of this.themeButton.querySelectorAll<HTMLElement>('[data-theme-icon]')) span.hidden = span.dataset.themeIcon !== theme
  }

  start(): void {
    const requested = new URLSearchParams(location.search).get('puzzle')
    const saved = loadGame()
    const resumable = saved && !saved.completed && (!requested || saved.puzzleId === requested)
    if (saved && resumable) {
      this.load(new Game(saved))
      return
    }
    const parsed = requested ? parsePuzzleId(requested) : null
    if (parsed && isBoxSize(parsed.n)) this.generate(parsed.n, parsed.seed, parsed.level)
    else this.newGame(loadSettings().n)
  }

  private currentBoxSize(): BoxSize {
    const n = this.game?.size.n ?? Number(this.sizeSelect.value)
    return isBoxSize(n) ? n : loadSettings().n
  }

  /** A new random game; its level becomes the one this board size remembers. */
  private newGame(n: BoxSize, level: Level = savedLevel(n)): void {
    level = clampLevel(n, level)
    saveSettings({ levels: { ...loadSettings().levels, [n]: level } })
    this.generate(n, randomSeed(), level)
  }

  /** Deals puzzle (n, seed) at level; without a level it is a legacy `<n>-<seed>` link. A link's level is not remembered. */
  private generate(n: BoxSize, seed: number, level?: Level): void {
    this.generating = true
    this.sizeSelect.value = String(n)
    saveSettings({ n })
    this.difficulty.show(n, level ? clampLevel(n, level) : savedLevel(n))
    this.spinner.hidden = false
    this.syncClock()
    const request: GenerateRequest = { requestId: ++this.requestId, n, seed, level }
    this.pending = request
    this.worker.postMessage(request)
  }

  private onPuzzle({ requestId, puzzle }: GenerateResponse): void {
    if (requestId !== this.requestId) return // a newer request superseded this one
    this.pending = null
    this.generating = false
    this.spinner.hidden = true
    this.load(Game.fromPuzzle(puzzle.n, puzzle.id, puzzle.givens, puzzle.solution), puzzle)
  }

  private load(game: Game, puzzle?: Puzzle): void {
    this.game = game
    this.paused = false
    window.clearTimeout(this.waveTimer)
    this.celebrating = false
    this.board.classList.remove('solved')
    if (this.dialog.open) this.dialog.close()
    this.clock.setActive(false, performance.now())
    this.clock.reset(game.elapsedMs, performance.now())
    this.sizeSelect.value = String(game.size.n)
    saveSettings({ n: game.size.n as BoxSize })
    this.difficulty.show(game.size.n, puzzle?.level ?? this.levelOf(game))
    this.footerId.textContent = `Puzzle ${game.puzzleId}`
    this.buildBoard()
    this.selected = Math.max(0, Array.from({ length: game.size.cells }, (_, i) => i).find((i) => !game.value(i)) ?? 0)
    this.status.textContent = puzzle ? `New ${sizeLabel(game.size.n)} ${LEVEL_LABELS[puzzle.level]} puzzle, ${puzzle.clues} clues.` : ''
    this.render()
    this.syncClock()
    this.save(true)
  }

  /** Easy puzzles refuse wrong digits; a legacy `<n>-<seed>` link has no level, so it never does. */
  private strict(game: Game): boolean {
    return parsePuzzleId(game.puzzleId)?.level === 'easy'
  }

  /** A game's level from its puzzle ID; a legacy ID has none, so the row shows the size's saved level. */
  private levelOf(game: Game): Level {
    return parsePuzzleId(game.puzzleId)?.level ?? savedLevel(game.size.n as BoxSize)
  }

  private buildBoard(): void {
    const { N, n, row, col, box } = this.game!.size
    this.board.replaceChildren()
    this.board.style.setProperty('--N', String(N))
    this.board.style.setProperty('--wave-step', `${Math.round(SOLVE_WAVE_MS / 2 / N)}ms`)
    this.board.dataset.n = String(n)
    this.board.style.setProperty('--n', String(n))
    this.cells = []
    for (let r = 0; r < N; r++) {
      const rowEl = el('div', { role: 'row', class: 'row' })
      for (let c = 0; c < N; c++) {
        const i = r * N + c
        const cell = el('div', { role: 'gridcell', class: 'cell', tabindex: '-1' })
        cell.dataset.index = String(i)
        cell.dataset.row = String(row[i])
        cell.dataset.col = String(col[i])
        cell.style.setProperty('--box', String(box[i]))
        if (c % n === n - 1 && c !== N - 1) cell.classList.add('box-r')
        if (r % n === n - 1 && r !== N - 1) cell.classList.add('box-b')
        rowEl.append(cell)
        this.cells.push(cell)
      }
      this.board.append(rowEl)
    }
    this.pad.replaceChildren()
    // Pad layout: one row of N keys on a phone up to 9×9, a square-ish block beside the board on wide screens.
    this.pad.style.setProperty('--cols-narrow', String(N <= 9 ? N : N <= 16 ? 8 : 9))
    this.pad.style.setProperty('--cols-wide', String(n === 2 ? 4 : n))
    this.pad.classList.toggle('many', N > 9)
    this.padKeys = []
    for (let d = 1; d <= N; d++) {
      const key = el('button', { type: 'button', class: 'pad-key' }, el('span', { class: 'sym', text: symbolOf(d) }), el('span', { class: 'count' }))
      key.dataset.value = String(d)
      this.padKeys.push(key)
      this.pad.append(key)
    }
  }

  private render(): void {
    const g = this.game
    if (!g) return
    const { size } = g
    const { n, N } = size
    const conflicts = g.conflicts()
    const sel = this.selected
    const selValue = g.value(sel)
    const { row, col, box } = size
    for (let i = 0; i < size.cells; i++) {
      const cell = this.cells[i]
      const v = g.value(i)
      const sym = v ? symbolOf(v) : ''
      const notes = v ? 0 : g.notesOf(i)
      // Rebuild the cell's content only when what it shows changed: a 25×25 board has 625 cells.
      const shown = v ? `v${v}` : notes ? `n${notes}` : ''
      if (cell.dataset.shown !== shown) {
        if (notes) cell.replaceChildren(notesGrid(notes, n, N))
        else cell.textContent = sym
        cell.dataset.shown = shown
      }
      const given = g.isGiven(i)
      cell.classList.toggle('given', given)
      cell.classList.toggle('entry', !given && v !== 0)
      cell.classList.toggle('selected', i === sel)
      cell.classList.toggle('related', i !== sel && (row[i] === row[sel] || col[i] === col[sel] || box[i] === box[sel]))
      cell.classList.toggle('same', i !== sel && selValue !== 0 && v === selValue)
      const bad = conflicts.has(i)
      cell.classList.toggle('conflict', bad)
      // A player digit that matches the stored solution gets the --ok check mark (one valid grid has one solution).
      cell.classList.toggle('correct', !given && v !== 0 && !bad && v === g.solution[i])
      cell.tabIndex = i === sel ? 0 : -1
      if (given) cell.setAttribute('aria-readonly', 'true')
      else cell.removeAttribute('aria-readonly')
      if (bad) cell.setAttribute('aria-invalid', 'true')
      else cell.removeAttribute('aria-invalid')
      cell.setAttribute('aria-selected', String(i === sel))
      const noteText = notes ? `, notes ${noteList(notes, N)}` : ''
      cell.setAttribute('aria-label', `Row ${row[i] + 1}, column ${col[i] + 1}, ${sym || 'empty'}${noteText}${given ? ', given' : ''}${bad ? ', conflict' : ''}`)
    }
    const remaining = g.remaining()
    this.padKeys.forEach((key, k) => {
      const left = remaining[k + 1]
      key.querySelector('.count')!.textContent = String(Math.max(0, left))
      key.classList.toggle('done', left <= 0)
      key.setAttribute('aria-label', `${symbolOf(k + 1)}, ${Math.max(0, left)} left`)
    })
    this.notesButton.setAttribute('aria-pressed', String(this.notesMode))
    this.pad.classList.toggle('notes-mode', this.notesMode)
    this.undoButton.disabled = !g.canUndo()
    this.redoButton.disabled = !g.canRedo()
    this.board.classList.toggle('is-paused', this.paused)
    this.overlay.hidden = !this.paused
    this.pauseButton.replaceChildren(icon(this.paused ? 'play' : 'pause'))
    this.pauseButton.setAttribute('aria-label', this.paused ? 'Resume' : 'Pause')
    this.pauseButton.setAttribute('aria-pressed', String(this.paused))
    if (conflicts.size > 0) this.status.textContent = `${conflicts.size} cells conflict — the same symbol twice in a row, column or box.`
    else if (this.status.textContent?.includes('conflict')) this.status.textContent = ''
    this.mistakesEl.hidden = !this.strict(g)
    this.mistakesEl.textContent = `Mistakes: ${g.mistakes}`
    this.updateTimer()
  }

  private inputBlocked(): boolean {
    return !this.game || this.paused || this.generating || this.dialog.open || this.celebrating
  }

  private select(i: number, focus: boolean): void {
    if (this.inputBlocked() || i < 0 || i >= this.game!.size.cells) return
    this.selected = i
    this.render()
    if (focus) this.cells[i].focus({ preventScroll: true })
  }

  // In notes mode a symbol toggles that pencil mark; erase (d = 0) always clears the value and the notes.
  private enter(d: number): void {
    if (this.inputBlocked()) return
    if (d && this.notesMode) {
      this.act(() => this.game!.toggleNote(this.selected, d))
      return
    }
    const g = this.game!
    const i = this.selected
    if (d && this.strict(g)) {
      let wrong = false
      const placed = this.act(() => {
        const r = g.place(i, d, this.cleanNotes)
        wrong = r === 'wrong'
        return r === true
      })
      if (wrong) this.reject(i, d)
      else if (placed) this.pop(i)
      return
    }
    if (this.act(() => g.set(i, d, this.cleanNotes))) this.pop(i)
  }

  // Easy refuses a digit that is not the solution: the cell stays as it was, flashes, and the count goes up.
  private reject(i: number, d: number): void {
    const cell = this.cells[i]
    cell.classList.remove('wrong')
    void cell.offsetWidth // restart the animation
    cell.classList.add('wrong')
    window.clearTimeout(this.wrongTimer)
    this.wrongTimer = window.setTimeout(() => cell.classList.remove('wrong'), WRONG_MS)
    this.status.textContent = `${symbolOf(d)} is not right here — mistake ${this.game!.mistakes}.`
    this.render()
    this.save(true)
  }

  private toggleNotesMode(): void {
    if (this.inputBlocked()) return
    this.notesMode = !this.notesMode
    this.status.textContent = this.notesMode ? 'Notes on — symbols add or remove pencil marks.' : 'Notes off.'
    this.render()
  }

  // Applies a change and reports whether it changed anything.
  private act(change: () => boolean): boolean {
    if (this.inputBlocked()) return false
    if (!change()) return false
    this.render()
    this.save(true)
    if (this.game!.completed) this.finish()
    return true
  }

  private restart(): void {
    if (this.inputBlocked()) return
    this.game!.restart()
    this.clock.reset(0, performance.now())
    this.status.textContent = 'Restarted.'
    this.render()
    this.save(true)
  }

  private finish(): void {
    const g = this.game!
    this.syncClock()
    g.elapsedMs = this.clock.elapsed(performance.now())
    this.save(true)
    this.dialogText.textContent = `${sizeLabel(g.size.n)} solved in ${formatTime(g.elapsedMs)}.`
    this.status.textContent = 'Solved!'
    // Completion wave first (box by box), then the dialog; reduced motion skips straight to the dialog.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.celebrating = true
    this.board.classList.add('solved')
    this.waveTimer = window.setTimeout(
      () => {
        this.celebrating = false
        this.dialog.showModal()
      },
      still ? 0 : SOLVE_WAVE_MS,
    )
  }

  // Replays the short entry animation on a cell whose value just changed.
  private wrongTimer = 0

  private pop(i: number): void {
    const cell = this.cells[i]
    if (!cell || !this.game!.value(i)) return
    cell.classList.remove('pop')
    void cell.offsetWidth // restart the animation
    cell.classList.add('pop')
  }

  private setPaused(paused: boolean): void {
    if (!this.game || this.game.completed || this.generating) return
    this.paused = paused
    this.syncClock()
    this.render()
    this.save(true)
    if (!paused) this.cells[this.selected]?.focus({ preventScroll: true })
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null
    if (t && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))) return
    if (e.altKey) return
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      this.act(() => (e.shiftKey ? this.game!.redo() : this.game!.undo()))
      return
    }
    if (mod) return
    if (!this.game || this.inputBlocked()) return
    const { N } = this.game.size
    const r = Math.floor(this.selected / N)
    const c = this.selected % N
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    const move = moves[e.key]
    if (move) {
      e.preventDefault()
      this.select(((r + move[0] + N) % N) * N + ((c + move[1] + N) % N), true)
      return
    }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      e.preventDefault()
      this.enter(0)
      return
    }
    const d = valueOf(e.key, N)
    if (d) {
      e.preventDefault()
      this.enter(d)
      return
    }
    // N toggles notes — except on 25×25, where N is a symbol and the Notes button is the toggle.
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault()
      this.toggleNotesMode()
    }
  }

  private clockShouldRun(): boolean {
    return !!this.game && !this.game.completed && !this.paused && !this.generating && document.visibilityState === 'visible'
  }

  private syncClock(): void {
    const now = performance.now()
    this.clock.setActive(this.clockShouldRun(), now)
    if (this.game) this.game.elapsedMs = this.clock.elapsed(now)
    this.updateTimer()
  }

  private tick(): void {
    this.syncClock()
    if (this.clock.active && performance.now() - this.lastSave >= SAVE_EVERY_MS) this.save()
  }

  private updateTimer(): void {
    const text = formatTime(this.clock.elapsed(performance.now()))
    if (this.timer.textContent !== text) this.timer.textContent = text
  }

  private save(force = false): void {
    if (!this.game) return
    const now = performance.now()
    if (!force && now - this.lastSave < SAVE_EVERY_MS) return
    this.game.elapsedMs = this.clock.elapsed(now)
    this.lastSave = now
    saveGame(this.game.toData())
  }
}
