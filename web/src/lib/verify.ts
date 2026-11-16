// Independent re-verification of the hash chain in the browser (WebCrypto).
// canonical() mirrors kavach.protocol.canonical: sorted keys, no spaces.
import type { Envelope } from './types'

export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  const o = v as Record<string, unknown>
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}'
}
async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}
export type ChainCheck = { ok: boolean; count: number; head?: string; brokenAt?: number; reason?: string }
export async function verifyChain(msgs: Envelope[]): Promise<ChainCheck> {
  let prev = '0'.repeat(64)
  for (let i = 0; i < msgs.length; i++) {
    const { hash, ...rest } = msgs[i]
    if (rest.prev !== prev) return { ok: false, count: msgs.length, brokenAt: i + 1, reason: 'prev link mismatch' }
    if (await sha256(canonical(rest)) !== hash) return { ok: false, count: msgs.length, brokenAt: i + 1, reason: 'hash mismatch' }
    prev = hash
  }
  return { ok: true, count: msgs.length, head: prev }
}
