import type { EngagementRecord } from '../lib/types'
export default function Picker({ list, rec, pick }: { list: EngagementRecord[]; rec?: EngagementRecord; pick: (id: string) => void }) {
  if (list.length < 2) return null
  return <select className="input" value={rec?.id} onChange={e => pick(e.target.value)}>{list.map(e => <option key={e.id} value={e.id}>{e.id}</option>)}</select>
}
