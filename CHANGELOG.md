# Changelog

All notable changes to this project will be documented in this file.

Please choose versions by [Semantic Versioning](http://semver.org/).

* MAJOR version when you make incompatible API changes,
* MINOR version when you add functionality in a backwards-compatible manner, and
* PATCH version when you make backwards-compatible bug fixes.

Each release is a `vX.Y.Z` tag; `release.yml` runs the fast and slow test tiers and publishes the tag's section below as the GitHub release notes. Add changes under `## Unreleased`; a release renames it.

## v0.2.0

- feat: difficulty levels Easy · Medium · Hard · Expert · Master · Extreme in the engine — a logical solver (singles, locked candidates, naked/hidden subsets, X-wing, swordfish, jellyfish, XY/XYZ-wing, simple coloring) rates every puzzle by the hardest technique it needs, and the generator retries from the seed until the rating is the requested level inside the level's clue range; puzzle IDs `<n>-<level>-<seed>`, legacy `<n>-<seed>` IDs unchanged; 9×9 offers all six levels (≤ 0.1 s each), 16×16 up to Hard, 25×25 up to Medium, 4×4 Easy

## v0.1.1

- fix: footer shows the released version — the Pages build reads it from the latest `v*` tag (`git describe --tags`, full-history checkout) instead of the unbumped package.json `0.0.0`

## v0.1.0

- feat: playable Sudoku MVP — seeded generator with exactly one solution per puzzle (singles-solvable, medium clue count scaled by board size), box size 2–5 via a size picker (4×4, 9×9, 16×16 with letters, 25×25 generated in a Web Worker), selection with row/column/box and same-digit highlighting, conflict marking with `aria-invalid`, number pad with remaining counts, undo/redo/erase/restart, pause, timer that stops on a hidden tab, completion dialog, and the game saved in localStorage across reloads
- chore: tooling from driftline — vitest fast/slow tiers, playwright browser test in CI, GitHub Pages deploy with PR previews and `<meta name="commit">`, release on `v*` tags, nightly slow run, secret scan, `do-not-merge` check, `.maintainer.yaml` auto-release
