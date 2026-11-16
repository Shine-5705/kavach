// Client for the engine worker (public/engine-worker.js), which runs the
// Python engine and the Finch skills in Pyodide.
import { useSyncExternalStore } from 'react'
import type { Envelope, EngagementRecord, Trace, Catalog, Rule } from './types'

export type EngineState =
  | { stage: 'idle' | 'runtime' | 'sqlite' | 'engine'; text: string }
  | { stage: 'ready'; python: string; files: number; catalog: Catalog }
  | { stage: 'error'; error: string }

let state: EngineState = { stage: 'idle', text: 'Starting engine' }
const subs = new Set<() => void>()
const set = (s: EngineState) => { state = s; subs.forEach(f => f()) }
let worker: Worker | null = null
let reqSeq = 0
const pending = new Map<string, (m: any) => void>()
const runs = new Map<string, { onMessage: (e: Envelope) => void; resolve: (r: EngagementRecord) => void; reject: (e: Error) => void }>()

export function startEngine() {
  if (worker) return
  const base = import.meta.env.BASE_URL
  worker = new Worker(base + 'engine-worker.js')
  worker.onmessage = (ev) => {
    const m = ev.data
    if (m.type === 'status') set({ stage: m.stage, text: m.text })
    else if (m.type === 'ready') set({ stage: 'ready', python: m.python, files: m.files, catalog: m.catalog })
    else if (m.type === 'message') runs.get(m.id)?.onMessage(m.message)
    else if (m.type === 'done') { runs.get(m.id)?.resolve(m.record); runs.delete(m.id) }
    else if (m.type === 'error') {
      if (m.id && runs.has(m.id)) { runs.get(m.id)!.reject(new Error(m.error)); runs.delete(m.id) }
      else if (m.req && pending.has(m.req)) { pending.get(m.req)!({ error: m.error }); pending.delete(m.req) }
      else set({ stage: 'error', error: m.error })
    } else if (m.req && pending.has(m.req)) { pending.get(m.req)!(m); pending.delete(m.req) }
  }
  worker.onerror = (e) => set({ stage: 'error', error: e.message || 'Engine worker failed to start' })
  worker.postMessage({ type: 'init', base })
}

export function restartEngine() { worker?.terminate(); worker = null; set({ stage: 'idle', text: 'Restarting engine' }); startEngine() }
export const useEngine = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb) }, () => state)
export const engineState = () => state

function call(msg: Record<string, unknown>): Promise<any> {
  const req = 'r' + (++reqSeq)
  return new Promise(res => { pending.set(req, res); worker!.postMessage({ ...msg, req }) })
}

export function runEngagement(id: string, categories: string[], pace: number, onMessage: (e: Envelope) => void) {
  return new Promise<EngagementRecord>((resolve, reject) => {
    runs.set(id, { onMessage, resolve, reject })
    worker!.postMessage({ type: 'run', id, categories, pace })
  })
}
export async function chat(sid: string, rules: Rule[], message: string, user = 'C-1001'): Promise<{ trace?: Trace & { refunds: any[]; balance: number }; error?: string }> {
  return call({ type: 'chat', sid, rules, message, user })
}
export async function audit(): Promise<{ result?: any; error?: string }> { return call({ type: 'audit' }) }
export async function redact(text: string): Promise<{ result?: any; error?: string }> { return call({ type: 'redact', text }) }
export async function variants(): Promise<{ result?: any[]; error?: string }> { return call({ type: 'variants' }) }
export async function attack(idx: number, rules: Rule[]): Promise<{ result?: any; error?: string }> { return call({ type: 'attack', idx, rules }) }
export async function utility(rules: Rule[]): Promise<{ result?: any; error?: string }> { return call({ type: 'utility', rules }) }
export async function compare(message: string, rules: Rule[]): Promise<{ result?: any; error?: string }> { return call({ type: 'compare', message, rules }) }
