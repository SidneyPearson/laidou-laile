/**
 * Dev-only Vite middleware that lets the admin "首页画像" page upload a
 * replacement image which is COMPRESSED IN THE BROWSER (canvas → JPEG) and
 * written to the project source tree here.
 *
 * It only ever runs under `vite` (Node, has fs). The production bundle never
 * includes this: the server worker (workerd) cannot write the local disk, and
 * the admin UI hides the upload button outside dev.
 *
 * Safety:
 *  - Rejects any Host that isn't loopback (defense-in-depth; the port is also
 *    only ever 9090 in dev).
 *  - Forwards the admin session cookie to the API worker (/api/admin/auth/me)
 *    so only a logged-in admin can write files.
 *  - Validates the payload is JPEG (magic bytes) and under a size cap.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin, ViteDevServer } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = resolve(__dirname, '../src/assets/homepage')
// Covers go to client/public/covers/ — files there ship verbatim with the
// build, so the stored same-origin path (/covers/<name>.jpg) keeps working
// after deploy without any hashed-asset mapping.
const COVERS_DIR = resolve(__dirname, '../public/covers')
const UPLOAD_PATH = '/__local-dev/persona-image'
const COVER_UPLOAD_PATH = '/__local-dev/cover-image'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB after compression

const LOCAL_IMAGES: Record<string, { file: string; maxEdge: number }> = {
  couple: { file: '02-persona-couple.jpg', maxEdge: 540 },
  family: { file: '03-persona-family.jpg', maxEdge: 540 },
  fast: { file: '04-persona-soldier.jpg', maxEdge: 540 },
  lazy: { file: '05-persona-lazy.jpg', maxEdge: 540 },
  urban: { file: '06-persona-urban.jpg', maxEdge: 540 },
}

function isLoopback(host: string | null | undefined): boolean {
  if (!host) return false
  const hostname = host.split(':')[0].replace(/^\[/, '').replace(/\]$/, '')
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function json(res: Connect.ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    let data = ''
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BYTES + 64 * 1024) {
        rejectBody(new Error('PAYLOAD_TOO_LARGE'))
        req.destroy()
        return
      }
      data += chunk.toString()
    })
    req.on('end', () => resolveBody(data))
    req.on('error', rejectBody)
  })
}

async function isAdmin(req: Connect.IncomingMessage): Promise<boolean> {
  // Verify the session against the API worker running on :3000 (same cookie).
  const cookie = req.headers.cookie
  const headers: Record<string, string> = {}
  if (cookie) headers.cookie = cookie
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
  try {
    const res = await fetch('http://localhost:3000/api/admin/auth/me', { headers, signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Decode + validate a `data:image/jpeg;base64,...` payload. Returns null
 *  (after responding) when invalid; otherwise the decoded bytes. */
function decodeJpegDataUrl(res: Connect.ServerResponse, dataUrl: string): Buffer | null {
  const match = /^data:image\/jpeg;base64,(.+)$/.exec(dataUrl)
  if (!match) {
    json(res, 400, { error: { code: 'INVALID_FORMAT', message: '需要 image/jpeg base64' } })
    return null
  }
  let bytes: Buffer
  try {
    bytes = Buffer.from(match[1], 'base64')
  } catch {
    json(res, 400, { error: { code: 'INVALID_BASE64' } })
    return null
  }
  if (bytes.length > MAX_BYTES) {
    json(res, 413, { error: { code: 'TOO_LARGE' } })
    return null
  }
  // JPEG magic bytes: FF D8 FF
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    json(res, 400, { error: { code: 'NOT_JPEG' } })
    return null
  }
  return bytes
}

function writeAtomic(dir: string, file: string, bytes: Buffer) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const dest = join(dir, file)
  // Keep a one-shot backup of the previous file.
  if (existsSync(dest)) {
    const backup = `${dest}.bak`
    try { renameSync(dest, backup) } catch { /* best effort */ }
  }
  // Write temp then rename for an atomic-ish replace.
  const tmp = `${dest}.tmp`
  writeFileSync(tmp, bytes)
  renameSync(tmp, dest)
  return dest
}

export function localImageUploadPlugin(): Plugin {
  return {
    name: 'local-image-upload-dev-only',
    apply: 'serve', // never included in build
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        const isPersona = url.startsWith(UPLOAD_PATH)
        const isCover = url.startsWith(COVER_UPLOAD_PATH)
        if (!isPersona && !isCover) return next()
        if (req.method !== 'POST') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED' } })
        if (!isLoopback(req.headers.host)) return json(res, 403, { error: { code: 'LOCAL_ONLY' } })

        try {
          if (!(await isAdmin(req))) return json(res, 401, { error: { code: 'UNAUTHORIZED' } })

          const raw = await readBody(req)
          const parsed = JSON.parse(raw) as { id?: unknown; name?: unknown; dataUrl?: unknown }
          const dataUrl = typeof parsed.dataUrl === 'string' ? parsed.dataUrl : ''

          if (isPersona) {
            const id = typeof parsed.id === 'string' ? parsed.id : ''
            const spec = LOCAL_IMAGES[id]
            if (!spec) return json(res, 400, { error: { code: 'UNKNOWN_IMAGE', message: '不支持的图片 id' } })

            const bytes = decodeJpegDataUrl(res, dataUrl)
            if (!bytes) return

            writeAtomic(ASSETS_DIR, spec.file, bytes)
            server.ws.send({ type: 'full-reload' })
            return json(res, 200, { ok: true, id, file: spec.file, bytes: bytes.length, maxEdge: spec.maxEdge })
          }

          // ---- cover upload: { name, dataUrl } → public/covers/<name>.jpg ----
          const name = typeof parsed.name === 'string' ? parsed.name : ''
          // Slug only — no path separators, no dots, no traversal.
          if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(name)) {
            return json(res, 400, { error: { code: 'INVALID_NAME', message: '封面名只能是小写字母/数字/连字符' } })
          }
          const bytes = decodeJpegDataUrl(res, dataUrl)
          if (!bytes) return

          writeAtomic(COVERS_DIR, `${name}.jpg`, bytes)
          // No full-reload here: public/ files are served from disk as-is, and
          // the editor is mid-form — reloading would lose unsaved changes.
          return json(res, 200, { ok: true, path: `/covers/${name}.jpg`, bytes: bytes.length })
        } catch (err) {
          const code = err instanceof Error && err.message === 'PAYLOAD_TOO_LARGE' ? 'TOO_LARGE' : 'INTERNAL_ERROR'
          return json(res, code === 'TOO_LARGE' ? 413 : 500, { error: { code } })
        }
      })
    },
  }
}
