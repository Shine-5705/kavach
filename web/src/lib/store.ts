import { useSyncExternalStore } from 'react'
import type { EngagementRecord } from './types'

const KEY = 'kavach.engagements.v1'
const subs = new Set<() => void>()
let cache: EngagementRecord[] = load()

function load(): EngagementRecord[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(cache.slice(0, 15))) } catch { /* quota: keep in memory */ }
  subs.forEach(f => f())
}
export function saveEngagement(r: EngagementRecord) { cache = [r, ...cache.filter(x => x.id !== r.id)]; persist() }
export function deleteEngagement(id: string) { cache = cache.filter(x => x.id !== id); persist() }
export function clearAll() { cache = []; persist() }
export const useEngagements = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb) }, () => cache)
export const latest = (list: EngagementRecord[]) => list[0]

// live run (not yet finished), shared across pages
type Live = { id: string; messages: { m: any; at: number }[]; done: boolean; error?: string } | null
let live: Live = null
const lsubs = new Set<() => void>()
export function setLive(l: Live) { live = l; lsubs.forEach(f => f()) }
export function pushLive(m: any) { if (live) { live = { ...live, messages: [...live.messages, { m, at: Date.now() }] }; lsubs.forEach(f => f()) } }
export const useLive = () => useSyncExternalStore(cb => { lsubs.add(cb); return () => lsubs.delete(cb) }, () => live)
