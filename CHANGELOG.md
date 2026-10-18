# Changelog

All notable changes to this project will be documented in this file.

Please choose versions by [Semantic Versioning](http://semver.org/).

* MAJOR version when you make incompatible API changes,
* MINOR version when you add functionality in a backwards-compatible manner, and
* PATCH version when you make backwards-compatible bug fixes.

Each release is a `vX.Y.Z` tag; `release.yml` runs the fast and slow test tiers and publishes the tag's section below as the GitHub release notes. Add changes under `## Unreleased`; a release renames it.

## Unreleased

- feat: sudoku.com Classic look — white page, top bar with logo and Classic / Killer (disabled) mode tabs, thin slate givens and blue entries, grey inner lines with navy box lines, blue-grey selection / peer / same-digit tints, a green check on correct entries, round icon actions with labels, tile number pad with remaining counts, digit fade-in and a box-by-box completion wave before the dialog (off under reduced motion); every colour is a `:root` token
- test: `make contrast` (light-palette WCAG contrast and ΔE between cell tints, read from computed styles) and `make layout` (4×4–25×25 at 390×844 and 960×540: no overflow, board and pad on screen, phone cell floors); the browser test now covers the top bar, check marks, transition timing and the completion animation
- feat: dark theme and a theme toggle in the top bar — first load follows the OS `prefers-color-scheme`, the toggle overrides it and persists in `sudoku.settings`, an inline head script applies it before first paint (no light flash), and switching moves nothing on the page; slate dark palette with entries, same-digit, conflict and muted lifted until every pair passes AA
- test: `make contrast` checks both themes from rendered cells in every state (given / entry × plain / selected / related / same-digit / conflict), colour math in `scripts/color.mjs` pinned by unit tests; the browser test covers OS-preference first load in both directions, toggle persistence across reload, identical board and top-bar boxes on toggle, and the no-flash head script with the app bundle blocked; `make shots` writes light and dark PNGs

## v0.1.1

- fix: footer shows the released version — the Pages build reads it from the latest `v*` tag (`git describe --tags`, full-history checkout) instead of the unbumped package.json `0.0.0`

## v0.1.0

- feat: playable Sudoku MVP — seeded generator with exactly one solution per puzzle (singles-solvable, medium clue count scaled by board size), box size 2–5 via a size picker (4×4, 9×9, 16×16 with letters, 25×25 generated in a Web Worker), selection with row/column/box and same-digit highlighting, conflict marking with `aria-invalid`, number pad with remaining counts, undo/redo/erase/restart, pause, timer that stops on a hidden tab, completion dialog, and the game saved in localStorage across reloads
- chore: tooling from driftline — vitest fast/slow tiers, playwright browser test in CI, GitHub Pages deploy with PR previews and `<meta name="commit">`, release on `v*` tags, nightly slow run, secret scan, `do-not-merge` check, `.maintainer.yaml` auto-release
