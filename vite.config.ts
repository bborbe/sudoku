import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// One source for the build identity: CI sets VITE_COMMIT_SHA (pages.yml), local builds fall back to git.
// Writing it back to process.env keeps the <meta name="commit"> tag in index.html on the same value.
function commitSha(): string {
  if (process.env.VITE_COMMIT_SHA) return process.env.VITE_COMMIT_SHA
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}
process.env.VITE_COMMIT_SHA = commitSha()
const version: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

// Test tiers. Slow = every file >= 2 s in CI; everything else is fast. `npm test` runs fast only (every PR,
// `make test`); `npm run test:all` runs both (release.yml, nightly.yml, `make test-all`).
const SLOW_TESTS = ['src/puzzle/generator.slow.test.ts']

// Served from https://bborbe.github.io/sudoku/ (GitHub Pages project site); PR previews build under
// /sudoku/pr-<n>/ by setting VITE_BASE (pages.yml).
export default defineConfig({
  base: process.env.VITE_BASE || '/sudoku/',
  define: {
    __COMMIT_SHA__: JSON.stringify(process.env.VITE_COMMIT_SHA),
    __APP_VERSION__: JSON.stringify(version),
  },
  worker: { format: 'es' },
  test: {
    projects: [
      { extends: true, test: { name: 'fast', include: ['src/**/*.test.ts'], exclude: SLOW_TESTS } },
      { extends: true, test: { name: 'slow', include: SLOW_TESTS } },
    ],
  },
})
