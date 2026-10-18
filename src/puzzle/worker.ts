// Generates puzzles off the main thread, so a 25×25 board never blocks input or the spinner.
import { generate, type Puzzle } from './generator'

export interface GenerateRequest {
  requestId: number
  n: number
  seed: number
}

export interface GenerateResponse {
  requestId: number
  puzzle: Puzzle
}

self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const { requestId, n, seed } = e.data
  const response: GenerateResponse = { requestId, puzzle: generate(n, seed) }
  self.postMessage(response)
}
