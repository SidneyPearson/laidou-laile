#!/usr/bin/env node
import { stdin, stdout, stderr } from 'node:process'
import { webcrypto } from 'node:crypto'

async function readHiddenPassword() {
  if (!stdin.isTTY) {
    let value = ''
    for await (const chunk of stdin) value += chunk
    return value.replace(/[\r\n]+$/, '')
  }
  stdout.write('Admin password: ')
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  return new Promise((resolve, reject) => {
    let value = ''
    const onData = chunk => {
      if (chunk === '\r' || chunk === '\n') {
        stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); resolve(value)
      } else if (chunk === '') {
        stdin.setRawMode(false); stdin.pause(); reject(new Error('Cancelled'))
      } else if (chunk === '') {
        value = value.slice(0, -1)
      } else if (!chunk.startsWith('')) {
        value += chunk
      }
    }
    stdin.on('data', onData)
  })
}

try {
  const password = await readHiddenPassword()
  if (password.length < 12) throw new Error('Password must contain at least 12 characters.')
  // Cloudflare Workers 的 Web Crypto 对 PBKDF2 迭代次数上限为 100000，
  // 超过会在 verifyPassword 运行时抛 NotSupportedError。100000 同时满足
  // server/src/auth/adminCrypto.ts 中 verifyPassword 的 >=100000 校验。
  const iterations = 100000
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const derived = new Uint8Array(await webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
  const b64 = bytes => Buffer.from(bytes).toString('base64url')
  stdout.write(`PBKDF2-SHA256$${iterations}$${b64(salt)}$${b64(derived)}\n`)
} catch (error) {
  stderr.write(`${error instanceof Error ? error.message : 'Failed to read password'}\n`)
  process.exitCode = 1
}
