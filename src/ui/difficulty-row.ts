// Difficulty row, sudoku.com style: a "Difficulty" label, then one text button per level, the active one
// highlighted. Levels a board size does not offer are hidden. Picking a level hands it to onPick — the App
// deals the new game and calls show() once it is loaded.
import { LEVEL_LABELS, LEVELS, levelsFor, type Level } from '../puzzle/difficulty'

export class DifficultyRow {
  readonly element: HTMLElement
  private readonly buttons = new Map<Level, HTMLButtonElement>()

  constructor(onPick: (level: Level) => void) {
    this.element = document.createElement('nav')
    this.element.className = 'difficulty'
    this.element.id = 'difficulty'
    this.element.setAttribute('aria-label', 'Difficulty')
    const label = document.createElement('span')
    label.className = 'difficulty-label'
    label.textContent = 'Difficulty'
    this.element.append(label)
    for (const level of LEVELS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'level'
      button.dataset.level = level
      button.textContent = LEVEL_LABELS[level]
      button.setAttribute('aria-pressed', 'false')
      button.addEventListener('click', () => onPick(level))
      this.buttons.set(level, button)
      this.element.append(button)
    }
  }

  /** Shows the levels box size n offers, with active pressed. */
  show(n: number, active: Level): void {
    const offered = levelsFor(n)
    for (const [level, button] of this.buttons) {
      button.hidden = !offered.includes(level)
      button.setAttribute('aria-pressed', String(level === active))
    }
  }
}
