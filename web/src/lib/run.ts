import { runEngagement, engineState } from './engine'
import { saveEngagement, setLive, pushLive } from './store'
import { verifyChain } from './verify'
import type { EngagementRecord } from './types'

export function newId() {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `eng-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
export async function startRun(categories: string[], pace: number): Promise<string> {
  if (engineState().stage !== 'ready') throw new Error('Engine is still loading')
  const id = newId()
  setLive({ id, messages: [], done: false })
  runEngagement(id, categories, pace, (m) => pushLive(m))
    .then((rec) => { saveEngagement({ ...rec, createdAt: Date.now(), source: 'browser' }); setLive({ id, messages: [], done: true }) })
    .catch((e) => setLive({ id, messages: [], done: true, error: String(e.message || e) }))
  return id
}
export async function importRecord(text: string): Promise<EngagementRecord> {
  let rec: EngagementRecord
  try { rec = JSON.parse(text) } catch { throw new Error('That file is not valid JSON.') }
  if (!rec || !Array.isArray(rec.messages) || !rec.id) throw new Error('Not a Kavach engagement record (missing id or messages).')
  const chain = await verifyChain(rec.messages)
  if (!chain.ok) throw new Error(`Hash chain broken at message ${chain.brokenAt} (${chain.reason}). Refusing to import a tampered record.`)
  const out = { ...rec, chain: { ok: true, count: chain.count, head: chain.head }, createdAt: rec.messages[0]?.ts || Date.now(), source: 'import' as const }
  saveEngagement(out)
  return out
}
export function downloadRecord(r: EngagementRecord) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' }))
  a.download = `${r.id}.json`; a.click(); URL.revokeObjectURL(a.href)
}
