// DOM UI: renders the Game, routes mouse / touch / keyboard input into it, runs the clock and persists.
// The board is a CSS Grid with ARIA grid semantics; every dimension comes from the game's Size.
import { Game } from '../engine/game'
import { BOX_SIZES, isBoxSize, symbolOf, valueOf, type BoxSize } from '../engine/size'
import { clampLevel, defaultLevel, LEVEL_LABELS, levelOf, levelsFor, type Level } from '../puzzle/difficulty'
import { BEYOND_LOGIC, techniqueBreakdown, techniqueLabel, type Breakdown } from '../puzzle/breakdown'
import { generate, parsePuzzleId, puzzleId, randomSeed, type Puzzle } from '../puzzle/generator'
import { dailySeed, DAILY_BOX_SIZE, DAILY_LEVEL, localDate } from '../puzzle/daily'
import { findHint, type Hint } from '../puzzle/hint'
import type { GenerateRequest, GenerateResponse } from '../puzzle/worker'
import { loadGame, loadSettings, saveGame, saveSettings, THEMES, type Theme } from '../store/storage'
import { ASSIST_LABELS, ASSISTS, resolveAssists, type Assist, type AssistOverrides, type Assists } from '../store/assists'
import { averageMs, loadStats, recordSolve, statKey } from '../store/stats'
import { applyTheme, nextTheme } from './theme'
import { Clock, formatTime } from './clock'
import { DifficultyRow } from './difficulty-row'
import { readUrl, syncUrl, type UrlRequest } from './url-state'

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
  hint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  notes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 4 13 8-13 8z"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  stats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
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

/** Today's daily puzzle ID: the same for every player on the same local date. */
function dailyId(date = localDate(new Date())): string {
  return puzzleId(DAILY_BOX_SIZE, dailySeed(date), DAILY_LEVEL)
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
  /** The page's boot query, parsed once: the theme applies in the constructor, the rest in start(). */
  private readonly url: UrlRequest = readUrl(location.search)
  private selected = 0
  // The digit last picked on the pad (0 = none): every cell holding it, and every candidate of it, is highlighted.
  private highlight = 0
  private paused = false
  // Notes mode: pad keys and typed symbols toggle pencil marks instead of placing digits.
  private notesMode = false
  /** The assists the player switched explicitly; the rest follow the current level's defaults (assists.ts). */
  private overrides: AssistOverrides = {}
  private celebrating = false
  private waveTimer = 0
  private generating = false
  private requestId = 0
  private lastSave = 0
  private readonly clock = new Clock()
  private readonly worker = new Worker(new URL('../puzzle/worker.ts', import.meta.url), { type: 'module' })
  private pending: GenerateRequest | null = null
  /** The hint in progress and how far it has been told (1 = region shown, 2 = technique named). */
  private hint: { h: Hint; stage: 1 | 2; region: Set<number> } | null = null

  private readonly sizeSelect: HTMLSelectElement
  private readonly difficulty: DifficultyRow
  private readonly timer: HTMLElement
  private readonly pauseButton: HTMLButtonElement
  private readonly themeButton: HTMLButtonElement
  private readonly statsDialog: HTMLDialogElement
  private readonly settingsButton: HTMLButtonElement
  private readonly settingsDialog: HTMLDialogElement
  private readonly assistBoxes = new Map<Assist, HTMLInputElement>()
  private readonly statsBody: HTMLElement
  private readonly board: HTMLElement
  private readonly boardWrap: HTMLElement
  private readonly overlay: HTMLElement
  private readonly spinner: HTMLElement
  private readonly pad: HTMLElement
  private readonly status: HTMLElement
  private readonly mistakesEl: HTMLElement
  private readonly undoButton: HTMLButtonElement
  private readonly redoButton: HTMLButtonElement
  private readonly hintButton: HTMLButtonElement
  private readonly notesButton: HTMLButtonElement
  private readonly dialog: HTMLDialogElement
  private readonly dialogText: HTMLElement
  private readonly dialogHardest: HTMLElement
  private readonly dialogTechniques: HTMLElement
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
    const dailyButton = el('button', { class: 'round', id: 'daily', type: 'button', 'aria-label': 'Daily puzzle', title: 'Daily puzzle' }, icon('calendar'))
    const statsButton = el('button', { class: 'round', id: 'stats-open', type: 'button', 'aria-label': 'Statistics', title: 'Statistics' }, icon('stats'))
    this.settingsButton = el('button', { class: 'round', id: 'settings-open', type: 'button', 'aria-label': 'Settings', title: 'Settings', 'aria-haspopup': 'dialog' }, icon('gear'))

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
    this.hintButton = actionButton('hint', 'hint', 'Hint')
    this.hintButton.setAttribute('aria-keyshortcuts', 'H')
    const actions = el('div', { class: 'actions', role: 'group', 'aria-label': 'Actions' }, this.undoButton, this.redoButton, eraseButton, this.notesButton, this.hintButton, restartButton)
    this.status = el('p', { class: 'status', id: 'status', 'aria-live': 'polite' })
    this.mistakesEl = el('span', { class: 'mistakes', id: 'mistakes', hidden: '' })

    this.dialogText = el('p', { id: 'done-text' })
    const dialogNew = el('button', { id: 'done-new', type: 'button', text: 'New game', autofocus: '' })
    const dialogClose = el('button', { id: 'done-close', type: 'button', class: 'secondary', text: 'Close' })
    // Technique breakdown: the techniques the logical solver's path through this puzzle needed, and the hardest.
    this.dialogHardest = el('p', { id: 'done-hardest', class: 'hardest' })
    this.dialogTechniques = el('ul', { id: 'done-techniques', class: 'techniques', 'aria-label': 'Techniques used' })
    this.dialog = el(
      'dialog',
      { id: 'done', 'aria-labelledby': 'done-title' },
      el('h2', { id: 'done-title', text: 'Solved!' }),
      this.dialogText,
      this.dialogHardest,
      this.dialogTechniques,
      el('div', { class: 'dialog-actions' }, dialogNew, dialogClose),
    )

    // Statistics: solved count, best and average time per size × level, from localStorage — counts only, no streaks.
    this.statsBody = el('div', { id: 'stats-body' })
    const statsClose = el('button', { id: 'stats-close', type: 'button', class: 'secondary', text: 'Close' })
    this.statsDialog = el(
      'dialog',
      { id: 'stats', 'aria-labelledby': 'stats-title' },
      el('h2', { id: 'stats-title', text: 'Statistics' }),
      this.statsBody,
      el('div', { class: 'dialog-actions' }, statsClose),
    )
    statsClose.addEventListener('click', () => this.statsDialog.close())

    // Settings: one switch per assist, applied live. The current level sets each default; a switch the player
    // flips becomes an override that survives a level change, until Reset to defaults drops them all.
    const assistList = el('div', { class: 'assists', role: 'group', 'aria-label': 'Assists' })
    for (const a of ASSISTS) {
      const box = el('input', { type: 'checkbox', id: `assist-${a}` })
      box.addEventListener('change', () => this.setAssist(a, box.checked))
      this.assistBoxes.set(a, box)
      assistList.append(el('label', { class: 'setting' }, box, el('span', { text: ASSIST_LABELS[a] })))
    }
    const settingsReset = el('button', { id: 'settings-reset', type: 'button', class: 'secondary', text: 'Reset to defaults' })
    const settingsClose = el('button', { id: 'settings-close', type: 'button', text: 'Close' })
    this.settingsDialog = el(
      'dialog',
      { id: 'settings', 'aria-labelledby': 'settings-title' },
      el('h2', { id: 'settings-title', text: 'Settings' }),
      el('p', { id: 'settings-level', class: 'settings-level' }),
      assistList,
      el('div', { class: 'dialog-actions' }, settingsReset, settingsClose),
    )
    settingsReset.addEventListener('click', () => this.resetAssists())
    settingsClose.addEventListener('click', () => this.settingsDialog.close())
    // Focus goes back to the gear, however the dialog closed (button, Esc).
    this.settingsDialog.addEventListener('close', () => this.settingsButton.focus())

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
    const header = el('header', { class: 'topbar' }, brand, modes, el('div', { class: 'topbar-actions' }, this.timer, this.pauseButton, dailyButton, statsButton, this.themeButton, this.settingsButton))
    const info = el('div', { class: 'game-info' }, this.difficulty.element, this.mistakesEl, el('label', { class: 'size-pick' }, el('span', { text: 'Size' }), this.sizeSelect))
    // New game and the notes setting share a row on phones (stacked on wide screens), so the phone page never scrolls.
    const side = el('div', { class: 'side' }, actions, this.pad, el('div', { class: 'side-row' }, newButton), this.status)
    root.append(header, info, el('main', {}, this.boardWrap, side), footer, this.dialog, this.statsDialog, this.settingsDialog)

    this.sizeSelect.addEventListener('change', () => {
      const n = Number(this.sizeSelect.value)
      if (isBoxSize(n)) this.newGame(n)
    })
    newButton.addEventListener('click', () => this.newGame(this.currentBoxSize()))
    dailyButton.addEventListener('click', () => this.daily())
    statsButton.addEventListener('click', () => this.showStats())
    this.settingsButton.addEventListener('click', () => this.showSettings())
    this.pauseButton.addEventListener('click', () => this.setPaused(!this.paused))
    this.themeButton.addEventListener('click', () => {
      const theme = nextTheme(loadSettings().theme)
      saveSettings({ theme })
      applyTheme(theme)
      this.renderThemeButton(theme)
      this.writeUrl()
    })
    // A `?theme=` link wins over the stored choice and becomes it, like the size and level do.
    if (this.url.theme) saveSettings({ theme: this.url.theme })
    applyTheme(loadSettings().theme)
    this.renderThemeButton(loadSettings().theme)
    // `?assists=` likewise replaces the stored overrides.
    if (this.url.assists) saveSettings({ assists: this.url.assists })
    this.overrides = loadSettings().assists
    this.overlay.querySelector('button')!.addEventListener('click', () => this.setPaused(false))
    this.undoButton.addEventListener('click', () => this.act(() => this.game!.undo()))
    this.redoButton.addEventListener('click', () => this.act(() => this.game!.redo()))
    eraseButton.addEventListener('click', () => this.erase())
    this.notesButton.addEventListener('click', () => this.toggleNotesMode())
    restartButton.addEventListener('click', () => this.restart())
    this.hintButton.addEventListener('click', () => this.nextHint())
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
      if (!key) return
      if (this.inputBlocked()) return
      this.highlight = Number(key.dataset.value)
      // A change renders through act(); a given (no change) still needs one render to move the highlight.
      if (!this.enter(this.highlight)) this.render()
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

  /** The URL wins over storage: a named puzzle opens (or resumes) that puzzle; a named size or level deals a new game at it. */
  start(): void {
    const url = this.url
    const saved = loadGame()
    const matchesUrl = (id: string, n: number) =>
      url.puzzle ? id === url.puzzle : (url.n === undefined || n === url.n) && (url.level === undefined || parsePuzzleId(id)?.level === url.level)
    if (saved && !saved.completed && matchesUrl(saved.puzzleId, saved.n)) {
      this.load(new Game(saved))
      return
    }
    const parsed = url.puzzle ? parsePuzzleId(url.puzzle) : null
    if (parsed && isBoxSize(parsed.n)) this.generate(parsed.n, parsed.seed, parsed.level)
    else {
      const n = url.n ?? loadSettings().n
      this.newGame(n, url.level ?? savedLevel(n))
    }
  }

  /** Today's daily puzzle: resumes it when it is the saved game, else deals it. Never changes the remembered level. */
  private daily(): void {
    if (this.generating || this.celebrating) return
    if (this.dialog.open) this.dialog.close()
    const id = dailyId()
    if (this.game?.puzzleId === id && !this.game.completed) return
    const parsed = parsePuzzleId(id)!
    this.generate(DAILY_BOX_SIZE, parsed.seed, DAILY_LEVEL)
  }

  private showStats(): void {
    const stats = loadStats()
    const rows: HTMLElement[] = []
    for (const n of BOX_SIZES)
      for (const level of levelsFor(n)) {
        const s = stats[statKey(n, level)]
        if (!s) continue
        rows.push(
          el('tr', {}, el('th', { scope: 'row', text: `${sizeLabel(n)} ${LEVEL_LABELS[level]}` }), el('td', { text: String(s.solved) }), el('td', { text: formatTime(s.bestMs) }), el('td', { text: formatTime(averageMs(s)) })),
        )
      }
    this.statsBody.replaceChildren(
      rows.length
        ? el(
            'table',
            { class: 'stats' },
            el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'Puzzle' }), el('th', { scope: 'col', text: 'Solved' }), el('th', { scope: 'col', text: 'Best' }), el('th', { scope: 'col', text: 'Average' }))),
            el('tbody', {}, ...rows),
          )
        : el('p', { text: 'No puzzles solved yet.' }),
    )
    this.statsDialog.showModal()
  }

  /** The assists in effect for the game on screen: its level's defaults with the player's overrides on top. */
  private assists(): Assists {
    const level = this.game ? this.levelOf(this.game) : savedLevel(this.currentBoxSize())
    // A legacy `<n>-<seed>` link has no level of its own, so it never defaults to the mistake check.
    const legacy = !!this.game && !parsePuzzleId(this.game.puzzleId)?.level
    return resolveAssists(level, legacy ? { strict: false, ...this.overrides } : this.overrides)
  }

  private showSettings(): void {
    if (this.settingsDialog.open) return
    this.renderSettings()
    this.settingsDialog.showModal()
  }

  private renderSettings(): void {
    const a = this.assists()
    for (const [name, box] of this.assistBoxes) box.checked = a[name]
    const level = this.game ? this.levelOf(this.game) : savedLevel(this.currentBoxSize())
    const custom = Object.keys(this.overrides).length
    this.settingsDialog.querySelector('#settings-level')!.textContent = `Defaults for ${LEVEL_LABELS[level]}${custom ? ` · ${custom} changed by you` : ''}.`
  }

  private setAssist(a: Assist, on: boolean): void {
    this.overrides = { ...this.overrides, [a]: on }
    this.applyAssists()
  }

  private resetAssists(): void {
    this.overrides = {}
    this.applyAssists()
  }

  private applyAssists(): void {
    saveSettings({ assists: this.overrides })
    if (!this.assists().hints) this.hint = null
    this.renderSettings()
    this.render()
    this.writeUrl()
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
    this.buildPad(n)
    // Settle the mistake counter for the level being dealt now, so the size picker beside it does not jump when it arrives.
    const strict = resolveAssists(level ? clampLevel(n, level) : savedLevel(n), this.overrides).strict
    if (strict && this.mistakesEl.hidden) this.mistakesEl.textContent = 'Mistakes: 0'
    this.mistakesEl.hidden = !strict
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
    this.hint = null
    window.clearTimeout(this.waveTimer)
    this.celebrating = false
    this.board.classList.remove('solved')
    if (this.dialog.open) this.dialog.close()
    this.clock.setActive(false, performance.now())
    this.clock.reset(game.elapsedMs, performance.now())
    this.sizeSelect.value = String(game.size.n)
    saveSettings({ n: game.size.n as BoxSize })
    const level = puzzle?.level ?? this.levelOf(game)
    this.difficulty.show(game.size.n, level)
    this.writeUrl(level)
    this.footerId.textContent = `Puzzle ${game.puzzleId}`
    this.buildBoard()
    this.highlight = 0
    this.selected = Math.max(0, Array.from({ length: game.size.cells }, (_, i) => i).find((i) => !game.value(i)) ?? 0)
    const daily = game.puzzleId === dailyId() ? `Daily puzzle ${localDate(new Date())}: ` : ''
    this.status.textContent = puzzle ? `${daily}New ${sizeLabel(game.size.n)} ${LEVEL_LABELS[puzzle.level]} puzzle, ${puzzle.clues} clues.` : daily
    this.render()
    this.syncClock()
    this.save(true)
  }

  /** Mirror the game on screen and the theme into the URL; nothing to write until the first puzzle is on screen. */
  private writeUrl(level?: Level): void {
    const game = this.game
    if (!game) return
    syncUrl({ n: game.size.n as BoxSize, level: level ?? this.levelOf(game), puzzle: game.puzzleId, theme: loadSettings().theme, assists: this.overrides })
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
    this.buildPad(n as BoxSize)
  }

  /** The pad for box size n; generate() builds it before the puzzle arrives, so the controls below it never move on load. */
  private buildPad(n: BoxSize): void {
    const N = n * n
    if (this.padKeys.length === N) return
    this.pad.replaceChildren()
    // Pad layout: one row of N keys on a phone up to 9×9, a square-ish block beside the board on wide screens.
    // Up to 4×4 the phone pad is one row; 9×9 wraps to 5 + 4 so each key stays ≥ 44 px wide on a 390 px phone.
    this.pad.style.setProperty('--cols-narrow', String(N <= 4 ? N : N <= 9 ? Math.ceil(N / 2) : N <= 16 ? 8 : 9))
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
    const assists = this.assists()
    const conflicts = assists.conflicts ? g.conflicts() : new Set<number>()
    const sel = this.selected
    // Same-digit highlight: the digit picked on the pad, else the selected cell's digit (off: nothing highlighted).
    const focusValue = this.highlight || g.value(sel)
    const sameValue = assists.sameDigit ? focusValue : 0
    const focusSym = focusValue ? symbolOf(focusValue) : ''
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
      cell.classList.toggle('related', assists.related && i !== sel && (row[i] === row[sel] || col[i] === col[sel] || box[i] === box[sel]))
      cell.classList.toggle('same', i !== sel && sameValue !== 0 && v === sameValue)
      cell.classList.toggle('hint-region', this.hint?.region.has(i) ?? false)
      const hinted = g.isHinted(i) && v !== 0 && v === g.solution[i]
      cell.classList.toggle('hinted', hinted)
      // Candidates (pencil marks) of the focused digit; a cell without notes has no .note spans.
      if (!v) for (const note of cell.querySelectorAll<HTMLElement>('.note')) note.classList.toggle('hl', sameValue !== 0 && note.dataset.sym === focusSym)
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
      cell.setAttribute('aria-label', `Row ${row[i] + 1}, column ${col[i] + 1}, ${sym || 'empty'}${noteText}${given ? ', given' : ''}${hinted ? ', hinted' : ''}${bad ? ', conflict' : ''}`)
    }
    const remaining = g.remaining()
    this.padKeys.forEach((key, k) => {
      const left = remaining[k + 1]
      key.querySelector('.count')!.textContent = String(Math.max(0, left))
      key.classList.toggle('done', left <= 0)
      key.setAttribute('aria-label', `${symbolOf(k + 1)}, ${Math.max(0, left)} left`)
      key.classList.toggle('active', k + 1 === focusValue)
    })
    this.notesButton.setAttribute('aria-pressed', String(this.notesMode))
    this.pad.classList.toggle('notes-mode', this.notesMode)
    this.undoButton.disabled = !g.canUndo()
    this.redoButton.disabled = !g.canRedo()
    this.hintButton.disabled = g.completed
    this.hintButton.hidden = !assists.hints
    this.timer.hidden = !assists.timer
    this.board.classList.toggle('is-paused', this.paused)
    this.overlay.hidden = !this.paused
    this.pauseButton.replaceChildren(icon(this.paused ? 'play' : 'pause'))
    this.pauseButton.setAttribute('aria-label', this.paused ? 'Resume' : 'Pause')
    this.pauseButton.setAttribute('aria-pressed', String(this.paused))
    if (conflicts.size > 0) this.status.textContent = `${conflicts.size} cells conflict — the same symbol twice in a row, column or box.`
    else if (this.status.textContent?.includes('conflict')) this.status.textContent = ''
    this.mistakesEl.hidden = !assists.strict
    this.mistakesEl.textContent = `Mistakes: ${g.mistakes}`
    this.updateTimer()
  }

  private inputBlocked(): boolean {
    return !this.game || this.paused || this.generating || this.dialog.open || this.statsDialog.open || this.settingsDialog.open || this.celebrating
  }

  private select(i: number, focus: boolean): void {
    if (this.inputBlocked() || i < 0 || i >= this.game!.size.cells) return
    this.selected = i
    this.highlight = 0 // a new selection highlights its own digit
    this.render()
    if (focus) this.cells[i].focus({ preventScroll: true })
  }

  // In notes mode a symbol toggles that pencil mark; erase (d = 0) always clears the value and the notes.
  // Reports whether the board changed (a change has already rendered); a rejected Easy digit counts as rendered.
  private enter(d: number): boolean {
    if (this.inputBlocked()) return false
    if (d && this.notesMode) return this.act(() => this.game!.toggleNote(this.selected, d))
    const g = this.game!
    const i = this.selected
    const { strict, cleanNotes } = this.assists()
    if (d && strict) {
      let wrong = false
      const placed = this.act(() => {
        const r = g.place(i, d, cleanNotes)
        wrong = r === 'wrong'
        return r === true
      })
      if (wrong) {
        this.reject(i, d)
        return true
      }
      if (placed) this.pop(i)
      return placed
    }
    if (!this.act(() => g.set(i, d, cleanNotes))) return false
    this.pop(i)
    return true
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

  // Erase clears the selected cell and drops the pad highlight.
  private erase(): void {
    if (this.inputBlocked()) return
    this.highlight = 0
    if (!this.enter(0)) this.render()
  }

  // Esc closes the topmost thing: the completion dialog, else the pause overlay, else the pad highlight.
  private escape(): void {
    if (this.dialog.open) this.dialog.close()
    else if (this.paused) this.setPaused(false)
    else if (this.highlight) {
      this.highlight = 0
      this.render()
    }
  }

  // Applies a change and reports whether it changed anything.
  private act(change: () => boolean): boolean {
    if (this.inputBlocked()) return false
    if (!change()) return false
    this.hint = null // the board moved on: the next hint starts over
    this.render()
    this.save(true)
    if (this.game!.completed) this.finish()
    return true
  }

  private restart(): void {
    if (this.inputBlocked()) return
    this.game!.restart()
    this.hint = null
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
    // A legacy `<n>-<seed>` ID carries no level, so the dialog names the level the breakdown rates — never the
    // size's saved level, which could contradict the hardest step listed below it.
    const b = techniqueBreakdown(g.size, g.givens)
    const level = parsePuzzleId(g.puzzleId)?.level ?? levelOf(b.hardest !== BEYOND_LOGIC, b.tier)
    recordSolve(g.size.n as BoxSize, level, g.elapsedMs)
    const hints = g.hints ? `with ${g.hints} hint${g.hints === 1 ? '' : 's'}` : 'without hints'
    this.dialogText.textContent = `${sizeLabel(g.size.n)} ${LEVEL_LABELS[level]} solved in ${formatTime(g.elapsedMs)} ${hints}.`
    this.showBreakdown(b)
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

  // Lists the techniques the puzzle needed, easiest first, each with its step count; rows fade in one by one
  // (--i staggers them, style.css), and reduced motion shows them at once.
  private showBreakdown(b: Breakdown): void {
    this.dialogHardest.replaceChildren(...(b.hardest ? ['Hardest step: ', el('strong', { text: techniqueLabel(b.hardest) })] : []))
    this.dialogTechniques.replaceChildren(
      ...b.techniques.map((t, i) => {
        const row = el('li', {}, el('span', { class: 'name', text: techniqueLabel(t.name) }), el('span', { class: 'count', text: `×${t.count}` }))
        row.style.setProperty('--i', String(i))
        return row
      }),
    )
  }

  // Graduated hint: the first press highlights where to look, the second names the technique and its row / box,
  // the third fills the digit (marked with a bulb). Any change to the board drops a hint in progress.
  private nextHint(): void {
    if (this.inputBlocked() || !this.assists().hints) return
    const g = this.game!
    if (this.hint?.stage === 2) {
      const { cell, digit } = this.hint.h
      this.selected = cell
      if (!this.act(() => g.reveal(cell, digit, this.assists().cleanNotes))) return
      this.pop(cell)
      if (!g.completed) this.status.textContent = `Hint: ${symbolOf(digit)} goes in row ${g.size.row[cell] + 1}, column ${g.size.col[cell] + 1}.`
      return
    }
    if (this.hint) this.hint.stage = 2
    else {
      const h = findHint(
        g.size,
        Array.from({ length: g.size.cells }, (_, i) => g.value(i)),
        g.solution,
      )
      if (!h) return
      g.useHint()
      this.hint = { h, stage: 1, region: new Set(h.region) }
    }
    this.render()
    this.save(true)
    // After render, which would otherwise put a conflict message over the hint.
    const { h, stage } = this.hint
    if (stage === 2) this.status.textContent = `Hint: ${h.text}`
    else this.status.textContent = h.kind === 'mistake' ? 'Hint: something in the highlighted box is wrong.' : 'Hint: the next move is in the highlighted cells.'
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
    if (e.key === 'Escape') {
      // The dialog closes itself on Esc (cancel event); the rest is ours.
      if (!this.dialog.open && !this.statsDialog.open && !this.settingsDialog.open) this.escape()
      return
    }
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
      this.erase()
      return
    }
    const d = valueOf(e.key, N)
    if (d) {
      e.preventDefault()
      this.highlight = 0 // a typed digit highlights through the selected cell, not a stale pad pick
      this.enter(d)
      return
    }
    // H is a symbol on 25×25, so there the key enters it and the Hint button is the way in.
    if (e.key.toLowerCase() === 'h') {
      e.preventDefault()
      this.nextHint()
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
