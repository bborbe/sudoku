# Changelog

All notable changes to this project will be documented in this file.

Please choose versions by [Semantic Versioning](http://semver.org/).

* MAJOR version when you make incompatible API changes,
* MINOR version when you add functionality in a backwards-compatible manner, and
* PATCH version when you make backwards-compatible bug fixes.

Each release is a `vX.Y.Z` tag; `release.yml` runs the fast and slow test tiers and publishes the tag's section below as the GitHub release notes. Add changes under `## Unreleased`; a release renames it.

## Unreleased

- feat: Settings — a gear in the top bar opens one dialog of assist switches: hints, same-digit highlight, row/column/box highlight, mistake check (reject a wrong digit), rule conflicts, auto-remove notes, timer. Each difficulty sets the defaults (Easy all on; Medium mistake check off; Hard and up also same-digit highlight and note cleanup off); a switch the player flips overrides every level's default until Reset to defaults. Applied live, saved in localStorage and mirrored into the URL (`assists=h0s1`); a switched-off assist hides its UI (Hint button and H, timer). The old Auto-remove notes checkbox moved into the dialog, its saved choice kept
- feat: a rule conflict also shows a wavy underline under the digit, so it reads without colour
- fix: the top bar fits a 390 px phone again — phones show the logo tile without the word and hide the disabled Killer tab

## v0.11.0

- fix: no layout shift while the first puzzle loads — the number pad is built before the puzzle arrives and each key reserves its count line, so New game and the settings below no longer jump down (CLS 0.033 → 0 at 960×540, 0.012 → 0 at 390×844); the browser test asserts CLS 0 at both sizes
- feat: daily puzzle and statistics — a calendar button in the top bar deals today's 9×9 Medium, the same puzzle for every player on the same local date (seed = hash of the date), separate from free play; a chart button opens Statistics: solved count, best and average time per size × level, kept in localStorage (`sudoku.stats`), no streaks

## v0.10.0

- feat: the URL mirrors the board size, difficulty, puzzle and theme (`?size=9&level=hard&puzzle=3-hard-…&theme=dark`) through `history.replaceState`, so a reload or a copied link opens the same puzzle at the same settings; the URL beats localStorage, and an unknown or invalid value falls back to the stored settings or defaults

## v0.9.1

- test: the browser test types letters on a 16×16 board (lower and upper case), so every key in the key table is driven from the keyboard
- test: the pad-pick and Esc highlight checks pick their given and digit from the board instead of by arithmetic and wait on the Esc state, so a puzzle where the chosen digit appears only once no longer fails them

## v0.9.0

- feat: Easy rejects a wrong digit — a digit that is not the cell's solution is not placed; the cell shakes with a dashed outline (outline only under reduced motion), the status line says so, and a Mistakes counter beside the difficulty row goes up (saved with the game, reset on restart); notes and the other levels are unchanged

## v0.8.1

- fix: the browser test runs its own `vite preview` on a free port per run, fails within seconds (with the exit code and stderr) when that server exits, and checks the page it serves is this checkout's `dist/index.html` — parallel worktrees no longer test each other's build

## v0.8.0

- feat: technique breakdown in the completion dialog — the level next to size and time, then every technique the logical solver's path through the puzzle needed with its step count, easiest first, and the hardest step named (Extreme: chains or trial and error); rows fade in one by one, shown at once under reduced motion
- test: `breakdown.slow.test.ts` validates the grading over 200 9×9 seeds per level — every breakdown's hardest step is its level's tier, Master puzzles cannot be finished without an X-wing-class technique (nor without a swordfish-class one) and swordfish itself appears, Extreme puzzles cannot be finished without a swordfish-class one nor with every technique; the browser test solves a 9×9 Expert under reduced motion and checks the list, the hardest step and the motion

## v0.7.1

- fix: board structure readable in both themes — dark related cells are a lighter blue tint, thin lines are lifted, box lines are periwinkle so they no longer compete with the cyan selection, and same-digit is indigo; light related cells are a shade darker; `make contrast` now also checks related vs empty cell (1.3:1), thin and box lines vs the cell (1.5:1 / 3:1) and box line vs selection (ΔE ≥ 10), from rendered borders, and `make test` pins the same four bars on the token values of both themes

## v0.7.0

- feat: graduated hints — the Hint button or `H` (where `H` is not a board symbol) first highlights the row, column or box holding the next logical move, then names the technique and where (e.g. "Locked candidates, then a hidden single in row 3 (box 2)"), then fills the digit; a wrong entry is pointed out before anything else, and when no known technique applies the third press reveals the most constrained cell. Hinted digits carry a bulb mark, the completion dialog shows the hint count, both survive a reload. Built on the logical solver (new `onStep` hook); a property test plays 500 puzzles to the end on hints alone, plus 100 per 9×9 level in the slow tier, and no hint ever contradicts the solution

## v0.6.0

- feat: keyboard and touch controls — Esc closes the Solved dialog, resumes a paused game or drops the pad pick; picking a digit on the number pad highlights every cell and pencil-mark candidate holding it and outlines its key; on a 390 px phone the 9×9 pad wraps to 5 + 4 keys and New game shares a 44 px row with the Auto-remove notes setting, so every tap target is ≥ 44 px with nothing scrolling; erase and pad picks do nothing while input is blocked (paused, dialog, completion)
- test: the browser test covers the full key table (Delete, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Esc, keys ignored in a text field), the pad highlight on cells and candidates, a keyboard-only 9×9 from New game to Solved, and a 390×844 touch run (select, enter, notes, erase, undo); `E2E_PORT` moves its preview server off 4174
- feat: pencil-mark notes — a Notes button and the `N` key switch symbols to toggling candidates, shown in a 3×3 mini-grid per cell (n×n on other board sizes); placing a digit removes it from the notes of its row, column and box (Auto-remove notes setting, default on); erase clears value and notes; undo/redo restore notes exactly, and notes are saved with the game

## v0.5.0

- feat: the theme button cycles system → light → dark (`aria-label="Theme: <mode>"`, monitor / sun / moon); system sets no `data-theme` and the page follows the OS live through a `prefers-color-scheme` copy of the dark tokens, kept identical to the explicit one by a unit test; the browser test walks all three modes with a reload each

## v0.4.0

- feat: sudoku.com Classic look — white page, top bar with logo and Classic / Killer (disabled) mode tabs, thin slate givens and blue entries, grey inner lines with navy box lines, blue-grey selection / peer / same-digit tints, a green check on correct entries, round icon actions with labels, tile number pad with remaining counts, digit fade-in and a box-by-box completion wave before the dialog (off under reduced motion); every colour is a `:root` token
- test: `make contrast` (light-palette WCAG contrast and ΔE between cell tints, read from computed styles) and `make layout` (4×4–25×25 at 390×844 and 960×540: no overflow, board and pad on screen, phone cell floors); the browser test now covers the top bar, check marks, transition timing and the completion animation
- feat: dark theme and a theme toggle in the top bar — first load follows the OS `prefers-color-scheme`, the toggle overrides it and persists in `sudoku.settings`, an inline head script applies it before first paint (no light flash), and switching moves nothing on the page; dark look: navy radial-gradient page, dark slate cells, glowing cyan box lines (static box-shadows, no filter), muted givens, bold cyan entries and a solid cyan selected cell with dark digits, every pair at AA
- test: `make contrast` checks both themes from rendered cells in every state (given / entry × plain / selected / related / same-digit / conflict), colour math in `scripts/color.mjs` pinned by unit tests; the browser test covers OS-preference first load in both directions, toggle persistence across reload, identical board and top-bar boxes on toggle, and the no-flash head script with the app bundle blocked; `make shots` writes light and dark PNGs
- fix: buttons get their base style back (border, radius, padding, centred label) — in v0.3.0 the difficulty-row rule had taken over the `button` selector

## v0.3.0

- feat: Difficulty row under the header — Easy · Medium · Hard · Expert · Master · Extreme as text links, the active one blue, only the levels the board size offers; picking one deals a new game at that level, and the choice is remembered per board size across reloads

## v0.2.0

- feat: difficulty levels Easy · Medium · Hard · Expert · Master · Extreme in the engine — a logical solver (singles, locked candidates, naked/hidden subsets, X-wing, swordfish, jellyfish, XY/XYZ-wing, simple coloring) rates every puzzle by the hardest technique it needs, and the generator retries from the seed until the rating is the requested level inside the level's clue range; puzzle IDs `<n>-<level>-<seed>`, legacy `<n>-<seed>` IDs unchanged; 9×9 offers all six levels (≤ 0.1 s each), 16×16 up to Hard, 25×25 up to Medium, 4×4 Easy

## v0.1.1

- fix: footer shows the released version — the Pages build reads it from the latest `v*` tag (`git describe --tags`, full-history checkout) instead of the unbumped package.json `0.0.0`

## v0.1.0

- feat: playable Sudoku MVP — seeded generator with exactly one solution per puzzle (singles-solvable, medium clue count scaled by board size), box size 2–5 via a size picker (4×4, 9×9, 16×16 with letters, 25×25 generated in a Web Worker), selection with row/column/box and same-digit highlighting, conflict marking with `aria-invalid`, number pad with remaining counts, undo/redo/erase/restart, pause, timer that stops on a hidden tab, completion dialog, and the game saved in localStorage across reloads
- chore: tooling from driftline — vitest fast/slow tiers, playwright browser test in CI, GitHub Pages deploy with PR previews and `<meta name="commit">`, release on `v*` tags, nightly slow run, secret scan, `do-not-merge` check, `.maintainer.yaml` auto-release
