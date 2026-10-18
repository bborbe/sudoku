// DOM UI: renders the Game, routes mouse / touch / keyboard input into it, runs the clock and persists.
// The board is a CSS Grid with ARIA grid semantics; every dimension comes from the game's Size.
import { Game } from '../engine/game'
import { BOX_SIZES, isBoxSize, symbolOf, valueOf, type BoxSize } from '../engine/size'
import { clampLevel, defaultLevel, LEVEL_LABELS, type Level } from '../puzzle/difficulty'
import { generate, parsePuzzleId, randomSeed, type Puzzle } from '../puzzle/generator'
import type { GenerateRequest, GenerateResponse } from '../puzzle/worker'
import { loadGame, loadSettings, saveGame, saveSettings } from '../store/storage'
import { Clock, formatTime } from './clock'
import { DifficultyRow } from './difficulty-row'

const SAVE_EVERY_MS = 1000

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
  private readonly board: HTMLElement
  private readonly boardWrap: HTMLElement
  private readonly overlay: HTMLElement
  private readonly spinner: HTMLElement
  private readonly pad: HTMLElement
  private readonly status: HTMLElement
  private readonly undoButton: HTMLButtonElement
  private readonly redoButton: HTMLButtonElement
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
    this.pauseButton = el('button', { class: 'icon', id: 'pause', type: 'button', text: 'Pause' })
    const newButton = el('button', { id: 'new-game', type: 'button', text: 'New game' })

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
    this.undoButton = el('button', { id: 'undo', type: 'button', text: 'Undo' })
    this.redoButton = el('button', { id: 'redo', type: 'button', text: 'Redo' })
    const eraseButton = el('button', { id: 'erase', type: 'button', text: 'Erase' })
    const restartButton = el('button', { id: 'restart', type: 'button', text: 'Restart' })
    const actions = el('div', { class: 'actions', role: 'group', 'aria-label': 'Actions' }, this.undoButton, this.redoButton, eraseButton, restartButton)
    this.status = el('p', { class: 'status', id: 'status', 'aria-live': 'polite' })

    this.dialogText = el('p', { id: 'done-text' })
    const dialogNew = el('button', { id: 'done-new', type: 'button', text: 'New game', autofocus: '' })
    const dialogClose = el('button', { id: 'done-close', type: 'button', class: 'secondary', text: 'Close' })
    this.dialog = el('dialog', { id: 'done', 'aria-labelledby': 'done-title' }, el('h2', { id: 'done-title', text: 'Solved!' }), this.dialogText, el('div', { class: 'dialog-actions' }, dialogNew, dialogClose))

    this.footerId = el('span', { id: 'puzzle-id' })
    const commit = __COMMIT_SHA__.slice(0, 7)
    const footer = el('footer', {}, this.footerId, el('span', { text: `v${__APP_VERSION__} · ${commit}` }))

    const header = el('header', {}, el('h1', { text: 'Sudoku' }), el('div', { class: 'header-controls' }, this.sizeSelect, this.timer, this.pauseButton, newButton))
    const side = el('div', { class: 'side' }, this.pad, actions, this.status)
    root.append(header, this.difficulty.element, el('main', {}, this.boardWrap, side), footer, this.dialog)

    this.sizeSelect.addEventListener('change', () => {
      const n = Number(this.sizeSelect.value)
      if (isBoxSize(n)) this.newGame(n)
    })
    newButton.addEventListener('click', () => this.newGame(this.currentBoxSize()))
    this.pauseButton.addEventListener('click', () => this.setPaused(!this.paused))
    this.overlay.querySelector('button')!.addEventListener('click', () => this.setPaused(false))
    this.undoButton.addEventListener('click', () => this.act(() => this.game!.undo()))
    this.redoButton.addEventListener('click', () => this.act(() => this.game!.redo()))
    eraseButton.addEventListener('click', () => this.enter(0))
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

  /** A game's level from its puzzle ID; a legacy ID has none, so the row shows the size's saved level. */
  private levelOf(game: Game): Level {
    return parsePuzzleId(game.puzzleId)?.level ?? savedLevel(game.size.n as BoxSize)
  }

  private buildBoard(): void {
    const { N, n, row, col } = this.game!.size
    this.board.replaceChildren()
    this.board.style.setProperty('--N', String(N))
    this.board.dataset.n = String(n)
    this.cells = []
    for (let r = 0; r < N; r++) {
      const rowEl = el('div', { role: 'row', class: 'row' })
      for (let c = 0; c < N; c++) {
        const i = r * N + c
        const cell = el('div', { role: 'gridcell', class: 'cell', tabindex: '-1' })
        cell.dataset.index = String(i)
        cell.dataset.row = String(row[i])
        cell.dataset.col = String(col[i])
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
    const conflicts = g.conflicts()
    const sel = this.selected
    const selValue = g.value(sel)
    const { row, col, box } = size
    for (let i = 0; i < size.cells; i++) {
      const cell = this.cells[i]
      const v = g.value(i)
      const sym = v ? symbolOf(v) : ''
      if (cell.textContent !== sym) cell.textContent = sym
      const given = g.isGiven(i)
      cell.classList.toggle('given', given)
      cell.classList.toggle('entry', !given && v !== 0)
      cell.classList.toggle('selected', i === sel)
      cell.classList.toggle('related', i !== sel && (row[i] === row[sel] || col[i] === col[sel] || box[i] === box[sel]))
      cell.classList.toggle('same', i !== sel && selValue !== 0 && v === selValue)
      const bad = conflicts.has(i)
      cell.classList.toggle('conflict', bad)
      cell.tabIndex = i === sel ? 0 : -1
      if (given) cell.setAttribute('aria-readonly', 'true')
      else cell.removeAttribute('aria-readonly')
      if (bad) cell.setAttribute('aria-invalid', 'true')
      else cell.removeAttribute('aria-invalid')
      cell.setAttribute('aria-selected', String(i === sel))
      cell.setAttribute('aria-label', `Row ${row[i] + 1}, column ${col[i] + 1}, ${sym || 'empty'}${given ? ', given' : ''}${bad ? ', conflict' : ''}`)
    }
    const remaining = g.remaining()
    this.padKeys.forEach((key, k) => {
      const left = remaining[k + 1]
      key.querySelector('.count')!.textContent = String(Math.max(0, left))
      key.classList.toggle('done', left <= 0)
      key.setAttribute('aria-label', `${symbolOf(k + 1)}, ${Math.max(0, left)} left`)
    })
    this.undoButton.disabled = !g.canUndo()
    this.redoButton.disabled = !g.canRedo()
    this.board.classList.toggle('is-paused', this.paused)
    this.overlay.hidden = !this.paused
    this.pauseButton.textContent = this.paused ? 'Resume' : 'Pause'
    this.pauseButton.setAttribute('aria-pressed', String(this.paused))
    if (conflicts.size > 0) this.status.textContent = `${conflicts.size} cells conflict — the same symbol twice in a row, column or box.`
    else if (this.status.textContent?.includes('conflict')) this.status.textContent = ''
    this.updateTimer()
  }

  private inputBlocked(): boolean {
    return !this.game || this.paused || this.generating || this.dialog.open
  }

  private select(i: number, focus: boolean): void {
    if (this.inputBlocked() || i < 0 || i >= this.game!.size.cells) return
    this.selected = i
    this.render()
    if (focus) this.cells[i].focus({ preventScroll: true })
  }

  private enter(d: number): void {
    if (this.inputBlocked()) return
    this.act(() => this.game!.set(this.selected, d))
  }

  private act(change: () => boolean): void {
    if (this.inputBlocked()) return
    if (!change()) return
    this.render()
    this.save(true)
    if (this.game!.completed) this.finish()
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
    this.dialog.showModal()
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
