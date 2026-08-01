import { describe,expect,it } from 'vitest'
import { createSession,verifySession } from './adminCrypto.js'
const secret='a-secure-session-secret-that-is-long-enough'
describe('admin sessions',()=>{it('accepts a valid signed session',async()=>{const token=await createSession(secret,1000,3600);expect(await verifySession(token,secret,1001)).toMatchObject({v:1,iat:1000,exp:4600})});it('rejects tampering and expiry',async()=>{const token=await createSession(secret,1000,3600);expect(await verifySession(token+'x',secret,1001)).toBeNull();expect(await verifySession(token,secret,4600)).toBeNull()})})
