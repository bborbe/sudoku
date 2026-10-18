import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { freePort, servesBuild, waitForServer } from './preview.mjs'

const children = []
afterEach(() => children.splice(0).forEach((c) => c.kill()))

// A stand-in for `vite preview`: a node child that serves `body` on `port`, or exits with `code` after `delay` ms.
function child(script) {
  const c = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'ignore', 'pipe'] })
  children.push(c)
  return c
}
const serve = (port, body = 'ok') =>
  child(`require('http').createServer((q, s) => s.end(${JSON.stringify(body)})).listen(${port}, '127.0.0.1')`)

describe('freePort', () => {
  it('returns a port that can be bound right away', async () => {
    const port = await freePort()
    expect(port).toBeGreaterThan(0)
    const srv = createServer()
    await new Promise((resolve, reject) => srv.once('error', reject).listen(port, '127.0.0.1', resolve))
    srv.close()
  })

  it('hands out different ports to concurrent runs', async () => {
    const ports = await Promise.all([freePort(), freePort(), freePort()])
    expect(new Set(ports).size).toBe(3)
  })
})

describe('waitForServer', () => {
  it('resolves once its own server answers', async () => {
    const port = await freePort()
    await expect(waitForServer(`http://127.0.0.1:${port}/`, serve(port))).resolves.toBeUndefined()
  })

  it('fails fast with the exit code and stderr when the server exits early', async () => {
    const port = await freePort()
    const started = Date.now()
    const c = child(`setTimeout(() => { console.error('Port ${port} is already in use'); process.exit(1) }, 300)`)
    await expect(waitForServer(`http://127.0.0.1:${port}/`, c)).rejects.toThrow(/exited before serving .*code 1.*already in use/)
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('fails even when another server answers on the port its own server lost', async () => {
    const port = await freePort()
    serve(port, 'neighbour')
    const own = child(`setTimeout(() => process.exit(1), 300)`)
    // The neighbour answers OK, but the wait must not accept it once its own child is gone.
    await new Promise((r) => setTimeout(r, 500))
    await expect(waitForServer(`http://127.0.0.1:${port}/`, own)).rejects.toThrow(/exited before serving/)
  })

  it('times out when nothing answers', async () => {
    const port = await freePort()
    const c = child('setTimeout(() => {}, 10000)')
    await expect(waitForServer(`http://127.0.0.1:${port}/`, c, 500)).rejects.toThrow(/did not start within 500 ms/)
  })
})

describe('servesBuild', () => {
  it('matches only the page this checkout built', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sudoku-preview-'))
    const index = join(dir, 'index.html')
    await writeFile(index, '<meta name="commit" content="mine">')
    const port = await freePort()
    await waitForServer(`http://127.0.0.1:${port}/`, serve(port, '<meta name="commit" content="mine">'))
    expect(await servesBuild(`http://127.0.0.1:${port}/`, index)).toBe(true)
    await writeFile(index, '<meta name="commit" content="other">')
    expect(await servesBuild(`http://127.0.0.1:${port}/`, index)).toBe(false)
  })
})
