import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePicked } from '../lib/pick'
import Picker from '../components/Picker'
import { CATEGORY, Empty, PageHead, Sev, Status } from '../components/ui'
import { RunButton } from './Overview'

const SEVS = ['critical', 'high', 'medium']
export default function Findings() {
  const { list, rec, pick } = usePicked(); const nav = useNavigate()
  const [q, setQ] = useState(''); const [sev, setSev] = useState(''); const [st, setSt] = useState('')
  if (!rec) return <div className="page"><PageHead title="Findings" /><div className="card"><Empty title="No findings yet" action={<RunButton />}>Findings appear after Red's first engagement against the sandbox.</Empty></div></div>
  const rows = rec.findings.filter(f => (!sev || f.severity === sev) && (!st || f.status === st) &&
    (!q || (f.id + f.title + f.owasp + CATEGORY[f.category]).toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="page">
      <PageHead title="Findings" sub="Vulnerabilities Red reproduced with evidence. Each closes only when the original attack and all its evasion variants are blocked on retest." actions={<Picker list={list} rec={rec} pick={pick} />} />
      <div className="card">
        <div className="toolbar">
          <input className="input" placeholder="Search findings, OWASP class…" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 240 }} />
          <div className="seg"><button className={!sev ? 'on' : ''} onClick={() => setSev('')}>All</button>{SEVS.map(s => <button key={s} className={sev === s ? 'on' : ''} onClick={() => setSev(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}</div>
          <div className="seg"><button className={!st ? 'on' : ''} onClick={() => setSt('')}>Any status</button><button className={st === 'open' ? 'on' : ''} onClick={() => setSt('open')}>Open</button><button className={st === 'verified' ? 'on' : ''} onClick={() => setSt('verified')}>Verified</button></div>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>{rows.length} of {rec.findings.length}</span>
        </div>
        {!rows.length ? <Empty title="Nothing matches">Clear the search or filters.</Empty> : (
          <table className="t">
            <thead><tr><th>ID</th><th>Finding</th><th>Severity</th><th className="hide-sm">OWASP</th><th className="hide-sm">Oracle</th><th className="num hide-sm">Variants</th><th className="num">Rounds</th><th>Status</th></tr></thead>
            <tbody>{rows.map(f => (
              <tr key={f.id} className="click" onClick={() => nav(`/console/findings/${f.id}?e=${rec.id}`)}>
                <td className="mono">{f.id}</td><td className="title">{f.title}<div className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>{f.evidence.detail}</div></td>
                <td><Sev s={f.severity} /></td><td className="hide-sm muted" style={{ fontSize: 12.5 }}>{f.owasp}</td>
                <td className="hide-sm mono muted">{f.evidence.oracle}</td><td className="num hide-sm">{f.variants.length}</td><td className="num">{f.rounds}</td><td><Status s={f.status} /></td>
              </tr>))}</tbody>
          </table>)}
      </div>
    </div>
  )
}
