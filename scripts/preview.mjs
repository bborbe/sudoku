// The browser test's own `vite preview`: a free port per run, and a wait that fails as soon as that server exits.
// Parallel worktrees used to share port 4174, so a run whose preview lost the port tested another worktree's build.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:net'

// A port the OS just handed out and released; `--strictPort` turns a lost race into an early exit, not a wrong server.
export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

// Resolves when `target` answers OK; rejects the moment `child` exits, with its exit code and stderr tail.
export function waitForServer(target, child, ms = 20_000) {
  return new Promise((resolve, reject) => {
    let stderr = ''
    let done = false
    const finish = (fn, arg) => {
      if (done) return
      done = true
      child.off('exit', onExit)
      fn(arg)
    }
    const onExit = (code, signal) =>
      finish(reject, new Error(`preview server exited before serving ${target} (${signal ?? `code ${code}`})${stderr.trim() ? `: ${stderr.trim().slice(-500)}` : ''}`))
    child.stderr?.on('data', (d) => (stderr += d))
    if (child.exitCode !== null || child.signalCode !== null) return onExit(child.exitCode, child.signalCode)
    child.on('exit', onExit)
    const end = Date.now() + ms
    const poll = async () => {
      while (!done && Date.now() < end) {
        try {
          if ((await fetch(target)).ok) return finish(resolve)
        } catch {
          // not up yet
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      finish(reject, new Error(`server at ${target} did not start within ${ms} ms`))
    }
    poll()
  })
}

// Starts `vite preview` on a free port and waits for it. Returns the base URL and the child to kill.
export async function startPreview(base = '/sudoku/') {
  const port = await freePort()
  const child = spawn('node_modules/.bin/vite', ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const url = `http://127.0.0.1:${port}${base}`
  try {
    await waitForServer(url, child)
  } catch (e) {
    child.kill()
    throw e
  }
  return { url, child }
}

// True when the page at `url` is byte-identical to this checkout's built `dist/index.html` (its asset hashes and
// <meta name="commit">), i.e. the server under test is serving this worktree's build and not a neighbour's.
export async function servesBuild(url, indexPath = 'dist/index.html') {
  const [served, built] = await Promise.all([fetch(url).then((r) => r.text()), readFile(indexPath, 'utf8')])
  return served === built
}
