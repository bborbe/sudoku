# AGENTS.md

Instructions for coding agents working on sudoku: a browser Sudoku with unique puzzles, box size 2–5 (4×4 to 25×25), Vite + TypeScript, no framework.

## Commands

Use the Makefile targets; each installs dependencies first when `node_modules` is missing or stale.

| Command | Wraps | What it does |
|---|---|---|
| `make run` | `npm run dev` | Start the Vite dev server |
| `make test` | `npm test` | Fast unit tier (vitest) — must be green before every commit |
| `make test-all` | `npm run test:all` | Fast + slow tiers (release and nightly run this) |
| `make build` | `npm run build` | Typecheck (`tsc`) and production build |
| `make e2e` | `npm run build && npm run e2e` | Playwright browser test against `vite preview` (`E2E_URL=<url>` targets a deployed site instead; each run previews on a free port, `E2E_PORT=<port>` pins one) |
| `make shots` | `npm run shots` | Desktop 960×540 and phone 390×844 PNGs into `shots/` (`node scripts/shots.mjs <url>`; default is the live site) |
| `make contrast` | `npm run build && npm run contrast` | Contrast of both themes from computed styles of real cells in every state: text 4.5:1, box lines 3:1, cell backgrounds ΔE ≥ 5, related vs empty 1.3:1, thin lines 1.5:1, box line vs selection ΔE ≥ 10 (`node scripts/contrast.mjs <url>`; `--override [light:\|dark:]<token>=<colour>` proves it can fail; math in `scripts/color.mjs`) |
| `make layout` | `npm run build && npm run layout` | 4×4–25×25 at 390×844 and 960×540: no horizontal overflow, board + pad inside the viewport, phone cell floors (`node scripts/layout.mjs <url>`) |

## Layout

| Path | Role |
|---|---|
| `src/engine/size.ts` | Geometry for box size n: N = n² symbols, N² cells, rows/columns/boxes, peers, bitmask `full`. Symbols are 1–9 then letters (`symbolOf`, `valueOf`). |
| `src/engine/game.ts` | Rules and moves: givens locked, `conflicts()` by row/column/box, win = full grid with no conflict (any valid grid, not only the stored solution), pencil-mark notes as one bitmask per cell (`toggleNote` in empty cells; `set` clears the cell's notes and, with `cleanPeers`, removes the digit from row/column/box peers' notes), `place` (Easy's strict entry: a digit other than the solution is refused and counted in `mistakes`), undo/redo/restart — each `Move` carries the note changes it made, so undo/redo restore notes exactly, `remaining()` counts, `toData()` for storage. Pure — no DOM. |
| `src/puzzle/rng.ts` | Seeded PRNG (mulberry32) and shuffle. |
| `src/puzzle/solver.ts` | `countSolutions` — bitmask backtracking, most-constrained cell first, capped at a limit (the uniqueness check). `solveBySingles` — naked + hidden singles only; a grid it completes has exactly one solution. |
| `src/puzzle/logic.ts` | `solveLogically` — the human-technique solver behind ratings and hints (`onStep` sees every step and can stop the run): hidden single (tier 0), naked single (1), locked candidates + pairs (2), triples + X-wing + XY-wing (3), quads + swordfish + jellyfish + XYZ-wing + simple coloring (4), each step the easiest that progresses; returns the highest tier used. Every technique is sound, so a grid it completes has one solution. |
| `src/puzzle/hint.ts` | `findHint` — the next move for the player's board: a wrong entry first (`mistake`), else the solver's first placement and the eliminations before it (`step`, text names technique + row/column/box, region = the unit), else the most constrained cell (`reveal`). Every hinted digit equals the solution; `check-hints.ts` plays puzzles to the end on hints alone (`hint.test.ts` 500 puzzles, `hint.slow.test.ts` 100 per 9×9 level). |
| `src/puzzle/difficulty.ts` | Levels Easy · Medium · Hard · Expert · Master · Extreme = tiers 0–4, Extreme = beyond tier 4. Clue range per level (9×9 counts scaled by cell count), `levelsFor(n)` (4×4 Easy only, 9×9 all, 16×16 to Hard, 25×25 to Medium), `clampLevel`, `levelOf`. |
| `src/puzzle/generator.ts` | Puzzle ID `<n>-<level>-<seed base36>` → same puzzle every time; legacy `<n>-<seed>` keeps the MVP carving (singles-solvable, `clueRange(n)` medium count). Full grid = canonical pattern scrambled by the seed. A levelled puzzle retries from the seeded stream until `solveLogically` rates it at the level inside the level's clue range: 9×9 removes clues while unique then puts them back until the level's tier solves it; other sizes remove while the tier still solves it. |
| `src/puzzle/check-level.ts` | Test helper: a seed sweep asserting level, clue range, uniqueness and reproducibility. |
| `src/puzzle/breakdown.ts` | `techniqueBreakdown` — the techniques the logical solver's path through a puzzle used, each with its step count, and the hardest (`chains or trial and error` when the techniques run out); `techniqueLabel` for display. `breakdown.slow.test.ts` validates the grading over 200 9×9 seeds per level: Master needs an X-wing-class technique or harder, Extreme a swordfish-class one or beyond. |
| `src/puzzle/worker.ts` | Generates off the main thread; the UI shows a spinner meanwhile. |
| `src/store/storage.ts` | localStorage: `sudoku.game` (the unfinished game with its notes, validated on read; a save from before notes loads with none) and `sudoku.settings` (box size, theme, the difficulty last picked per box size, and `cleanNotes`, default on). `saveSettings` merges, so each caller writes only its own fields. |
| `src/ui/app.ts` | DOM UI: header (size picker, timer, pause, new game), board (CSS Grid, ARIA `grid`/`row`/`gridcell`, `aria-invalid` on conflicts), number pad with remaining counts, actions (Notes toggle with `aria-pressed`), Auto-remove notes checkbox, completion `<dialog>` (size, level, time, hints, then the technique breakdown: each technique with its count and the hardest step, rows fading in unless reduced motion). Hint button / `H` (not on 25×25, where H is a symbol): region → technique → digit, bulb on hinted cells, hint count in the dialog. Notes render as an n×n mini-grid of spans whose symbol comes from CSS `attr(data-sym)`, so a cell's `textContent` is always its value. Keyboard: symbols, arrows, Backspace/Delete/0 erase value and notes, N notes mode (on 25×25 N is a symbol, so only the button toggles), H hint, Ctrl/Cmd+Z undo, +Shift redo, Esc closes the dialog / resumes a pause / drops the pad pick; keys are ignored while focus is in a text field. A pad digit highlights every cell and candidate (`.note.hl`) holding it. Phone pad: 9×9 wraps to 5 + 4 keys so every tap target is ≥ 44 px. `?puzzle=<id>` opens a puzzle; `?debug=1` exposes `window.__sudoku` for the browser test. |
| `src/ui/difficulty-row.ts` | The Difficulty row: one text button per level, `aria-pressed` on the active one, levels the box size does not offer hidden. Picking one deals a new game at that level for the current size. |
| `src/ui/clock.ts` | Clock that runs only while the game is active, not paused, and the tab is visible. |
| `src/ui/theme.ts` | One button cycles system → light → dark. Light or dark is a `data-theme` attribute on `<html>`; system is no attribute, so style.css's `prefers-color-scheme` copy of the dark tokens applies (`src/ui/style.test.ts` keeps both copies identical). The inline script in `index.html` sets the attribute before first paint by the same rule — keep the two in step. |
| `src/ui/style.css` | Visual tokens (CSS variables at the top, the light `:root` block then `:root[data-theme='dark']` — no literal colour in any other rule) and layout: top bar, board beside the side panel on wide screens, controls below on phones. |
| `scripts/e2e.mjs` | Browser test: top bar (logo, Classic / disabled Killer tabs), selection, entry, conflict, correct-entry check, cell transition timing, erase, undo/redo, pause, hints (region, technique, digit + bulb, wrong digit first, count in the dialog), notes (N toggle, 3×3 and 4×4 2×2 mini-grids, peer cleanup vs non-peer, cleanup off, undo/redo and reload restore notes), difficulty row (default Medium, pick → `<n>-<level>-` puzzle, level per size, reload), size picker (4/9/16/25), full 4×4 solve → completion wave → dialog, technique breakdown on a 9×9 Expert under reduced motion, reload persistence, hidden-tab clock, theme (OS preference, toggle, no flash), the key table (Delete, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Esc, keys ignored in a text field), pad-digit highlight of cells and candidates, a keyboard-only 9×9 from New game to Solved, a 390×844 touch run (tap select / enter / notes / erase / undo, no scroll, targets ≥ 44 px). Fails on any console error. |

## Rules

- **Never hard-code 9.** Every dimension, symbol range, pad key and clue count derives from `sizeOf(n)`.
- **`src/engine/` and `src/puzzle/` never touch the DOM** — they run in workers and unit tests.
- **Every generated puzzle has exactly one solution.** Clues are only removed while the solution counter (9×9) or the logical solver (other sizes) still pins one solution; `src/puzzle/generator.test.ts` checks it per seed, and `src/puzzle/difficulty.slow.test.ts` sweeps 500 seeds per 9×9 level.
- **Tests drive the real path.** The browser test types through the keyboard and clicks the UI; `window.__sudoku` only reads state.
- **Test tiers:** slow = files ≥ 2 s, listed in `SLOW_TESTS` in `vite.config.ts`; everything else is fast.
- Mute every browser you drive (`--mute-audio`), use 960×540 for desktop shots, and close playwright when done.

## Workflow

Feature branch in a worktree + pull request into `master`, merged with a merge commit (`gh pr merge --merge`). Add a bullet under `## Unreleased` in `CHANGELOG.md`; `.maintainer.yaml` has `release.autoRelease: true`, so the github-releaser cuts the `vX.Y.Z` tag and `release.yml` publishes the GitHub release — never tag by hand.

- `ci.yml` runs the fast tier, the build and the browser test on every PR and master push (`test` is a required check).
- `pages.yml` deploys master to https://bborbe.github.io/sudoku/ and every open same-repo PR to `/sudoku/pr-<n>/`. The live `<meta name="commit">` is the deployed master SHA — after a merge it is the merge commit, or the releaser's `release vX.Y.Z` commit on top of it.
