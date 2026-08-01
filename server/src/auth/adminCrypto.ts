const HASH_ALGORITHM = 'PBKDF2-SHA256'
const SESSION_VERSION = 1

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4))
    return Uint8Array.from(binary, char => char.charCodeAt(0))
  } catch {
    return null
  }
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index]
  return difference === 0
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, expectedText, extra] = storedHash.split('$')
  const iterations = Number(iterationsText)
  const salt = decodeBase64Url(saltText ?? '')
  const expected = decodeBase64Url(expectedText ?? '')
  if (algorithm !== HASH_ALGORITHM || extra !== undefined || !Number.isInteger(iterations)
    || iterations < 100_000 || iterations > 2_000_000 || !salt || salt.length < 16 || !expected || expected.length < 32) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, expected.length * 8))
  return timingSafeEqual(derived, expected)
}

interface SessionPayload { v: number; iat: number; exp: number; nonce: string }

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
}

export async function createSession(secret: string, nowSeconds: number, ttlSeconds: number): Promise<string> {
  const nonce = new Uint8Array(16)
  crypto.getRandomValues(nonce)
  const payload: SessionPayload = { v: SESSION_VERSION, iat: nowSeconds, exp: nowSeconds + ttlSeconds, nonce: encodeBase64Url(nonce) }
  const encoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  return `${encoded}.${encodeBase64Url(await hmac(secret, encoded))}`
}

export async function verifySession(token: string, secret: string, nowSeconds: number): Promise<SessionPayload | null> {
  const [encoded, signatureText, extra] = token.split('.')
  if (!encoded || !signatureText || extra !== undefined) return null
  const signature = decodeBase64Url(signatureText)
  if (!signature || !timingSafeEqual(signature, await hmac(secret, encoded))) return null
  const bytes = decodeBase64Url(encoded)
  if (!bytes) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as SessionPayload
    if (payload.v !== SESSION_VERSION || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)
      || typeof payload.nonce !== 'string' || payload.iat > nowSeconds + 60 || payload.exp <= nowSeconds) return null
    return payload
  } catch { return null }
}

export const passwordHashFormat = HASH_ALGORITHM
