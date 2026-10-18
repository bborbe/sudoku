// Generates puzzles off the main thread, so a 25×25 board never blocks input or the spinner.
import type { Level } from './difficulty'
import { generate, type Puzzle } from './generator'

export interface GenerateRequest {
  requestId: number
  n: number
  seed: number
  /** Difficulty level; absent for a legacy `<n>-<seed>` puzzle. */
  level?: Level
}

export interface GenerateResponse {
  requestId: number
  puzzle: Puzzle
}

self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const { requestId, n, seed, level } = e.data
  const response: GenerateResponse = { requestId, puzzle: generate(n, seed, level) }
  self.postMessage(response)
}
