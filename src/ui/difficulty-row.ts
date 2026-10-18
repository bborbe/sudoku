// Difficulty row, sudoku.com style: a "Difficulty" label, then one text button per level, the active one
// highlighted. Levels a board size does not offer are hidden. Picking a level hands it to onPick — the App
// deals the new game and calls show() once it is loaded.
import { levelLabel, t } from '../i18n'
import { LEVELS, levelsFor, type Level } from '../puzzle/difficulty'

export class DifficultyRow {
  readonly element: HTMLElement
  private readonly buttons = new Map<Level, HTMLButtonElement>()
  private readonly label: HTMLElement

  constructor(onPick: (level: Level) => void) {
    this.element = document.createElement('nav')
    this.element.className = 'difficulty'
    this.element.id = 'difficulty'
    this.label = document.createElement('span')
    this.label.className = 'difficulty-label'
    this.element.append(this.label)
    for (const level of LEVELS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'level'
      button.dataset.level = level
      button.setAttribute('aria-pressed', 'false')
      button.addEventListener('click', () => onPick(level))
      this.buttons.set(level, button)
      this.element.append(button)
    }
    this.relabel()
  }

  /** Writes the label and level names in the current language. */
  relabel(): void {
    this.element.setAttribute('aria-label', t('difficulty'))
    this.label.textContent = t('difficulty')
    for (const [level, button] of this.buttons) button.textContent = levelLabel(level)
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
