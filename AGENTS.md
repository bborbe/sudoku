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
| `make e2e` | `npm run build && npm run e2e` | Playwright browser test against `vite preview` (`E2E_URL=<url>` targets a deployed site instead) |
| `make shots` | `npm run shots` | Desktop 960×540 and phone 390×844 PNGs into `shots/` (`node scripts/shots.mjs <url>`; default is the live site) |
| `make contrast` | `npm run build && npm run contrast` | Contrast of both themes from computed styles of real cells in every state: text 4.5:1, box lines 3:1, cell backgrounds ΔE ≥ 5 (`node scripts/contrast.mjs <url>`; `--override [light:\|dark:]<token>=<colour>` proves it can fail; math in `scripts/color.mjs`) |
| `make layout` | `npm run build && npm run layout` | 4×4–25×25 at 390×844 and 960×540: no horizontal overflow, board + pad inside the viewport, phone cell floors (`node scripts/layout.mjs <url>`) |

## Layout

| Path | Role |
|---|---|
| `src/engine/size.ts` | Geometry for box size n: N = n² symbols, N² cells, rows/columns/boxes, peers, bitmask `full`. Symbols are 1–9 then letters (`symbolOf`, `valueOf`). |
| `src/engine/game.ts` | Rules and moves: givens locked, `conflicts()` by row/column/box, win = full grid with no conflict (any valid grid, not only the stored solution), undo/redo/restart, `remaining()` counts, `toData()` for storage. Pure — no DOM. |
| `src/puzzle/rng.ts` | Seeded PRNG (mulberry32) and shuffle. |
| `src/puzzle/solver.ts` | `countSolutions` — bitmask backtracking, most-constrained cell first, capped at a limit (the uniqueness check). `solveBySingles` — naked + hidden singles only; a grid it completes has exactly one solution. |
| `src/puzzle/generator.ts` | Puzzle ID `<n>-<seed base36>` → same puzzle every time. Full grid = canonical pattern scrambled by the seed; clues removed in seeded order while `solveBySingles` still completes it, down to a target drawn from `clueRange(n)` (medium: 32–37 of 81, scaled by cell count). |
| `src/puzzle/worker.ts` | Generates off the main thread; the UI shows a spinner meanwhile. |
| `src/store/storage.ts` | localStorage: `sudoku.game` (the unfinished game, validated on read) and `sudoku.settings` (box size, theme). |
| `src/ui/app.ts` | DOM UI: header (size picker, timer, pause, new game), board (CSS Grid, ARIA `grid`/`row`/`gridcell`, `aria-invalid` on conflicts), number pad with remaining counts, actions, completion `<dialog>`. Keyboard: symbols, arrows, Backspace/Delete/0 erase, Ctrl/Cmd+Z undo, +Shift redo. `?puzzle=<id>` opens a puzzle; `?debug=1` exposes `window.__sudoku` for the browser test. |
| `src/ui/clock.ts` | Clock that runs only while the game is active, not paused, and the tab is visible. |
| `src/ui/theme.ts` | Light / dark / system theme: one `data-theme` attribute on `<html>`. The inline script in `index.html` sets it before first paint by the same rule — keep the two in step. |
| `src/ui/style.css` | Visual tokens (CSS variables at the top, the light `:root` block then `:root[data-theme='dark']` — no literal colour in any other rule) and layout: top bar, board beside the side panel on wide screens, controls below on phones. |
| `scripts/e2e.mjs` | Browser test: selection, entry, conflict, erase, undo/redo, pause, size picker (4/9/16/25), full 4×4 solve → dialog, reload persistence, hidden-tab clock. Fails on any console error. |

## Rules

- **Never hard-code 9.** Every dimension, symbol range, pad key and clue count derives from `sizeOf(n)`.
- **`src/engine/` and `src/puzzle/` never touch the DOM** — they run in workers and unit tests.
- **Every generated puzzle has exactly one solution.** The generator only removes a clue when singles still solve the grid; `src/puzzle/generator.test.ts` checks 1000 seeds at 4×4 and 9×9 with the solution counter.
- **Tests drive the real path.** The browser test types through the keyboard and clicks the UI; `window.__sudoku` only reads state.
- **Test tiers:** slow = files ≥ 2 s, listed in `SLOW_TESTS` in `vite.config.ts`; everything else is fast.
- Mute every browser you drive (`--mute-audio`), use 960×540 for desktop shots, and close playwright when done.

## Workflow

Feature branch in a worktree + pull request into `master`, merged with a merge commit (`gh pr merge --merge`). Add a bullet under `## Unreleased` in `CHANGELOG.md`; `.maintainer.yaml` has `release.autoRelease: true`, so the github-releaser cuts the `vX.Y.Z` tag and `release.yml` publishes the GitHub release — never tag by hand.

- `ci.yml` runs the fast tier, the build and the browser test on every PR and master push (`test` is a required check).
- `pages.yml` deploys master to https://bborbe.github.io/sudoku/ and every open same-repo PR to `/sudoku/pr-<n>/`. The live `<meta name="commit">` is the deployed master SHA — after a merge it is the merge commit, or the releaser's `release vX.Y.Z` commit on top of it.
