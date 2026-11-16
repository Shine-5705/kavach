import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useEngine } from '../lib/engine'
import { deleteEngagement, useEngagements, useLive } from '../lib/store'
import { importRecord, startRun } from '../lib/run'
import { Badge, CATEGORY, Empty, PageHead, fmtTime } from '../components/ui'

export default function Engagements() {
  const list = useEngagements(); const live = useLive(); const eng = useEngine(); const nav = useNavigate()
  const [cats, setCats] = useState<string[]>(Object.keys(CATEGORY))
  const [pace, setPace] = useState(260)
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const busy = !!live && !live.done
  const toggle = (c: string) => setCats(cats.includes(c) ? cats.filter(x => x !== c) : [...cats, c])
  return (
    <div className="page">
      <PageHead title="Engagements" sub="Each engagement is one full Red-versus-Blue session against the sandbox target, recorded as a hash-chained A2A message log."
        actions={<><button className="btn" onClick={() => file.current?.click()}>Import JSON</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = ''; if (!f) return
            try { setErr(''); const r = await importRecord(await f.text()); nav('/console/engagements/' + r.id) } catch (x: any) { setErr(x.message) }
          }} /></>} />
      {err && <div className="banner err">{err}</div>}
      {live?.error && <div className="banner err">The last engagement failed: {live.error}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><div><h2>New engagement</h2><p>Runs in this tab against the PaisaPal sandbox. Red signs in as customer C-1001.</p></div></div>
        <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
          <div className="chips">{Object.entries(CATEGORY).map(([c, l]) => (
            <label key={c} className="chip" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: cats.includes(c) ? 'var(--sunken)' : undefined }}>
              <input type="checkbox" checked={cats.includes(c)} onChange={() => toggle(c)} style={{ margin: 0 }} />{l}</label>))}</div>
          <div className="seg"><button className={pace ? 'on' : ''} onClick={() => setPace(260)}>Watch live</button><button className={!pace ? 'on' : ''} onClick={() => setPace(0)}>Fast</button></div>
          <button className="btn primary" disabled={eng.stage !== 'ready' || busy || !cats.length}
            onClick={async () => nav('/console/engagements/' + await startRun(cats.length === 6 ? [] : cats, pace))}>
            {eng.stage !== 'ready' ? 'Engine loading…' : busy ? 'Running…' : 'Start engagement'}</button>
        </div>
      </div>
      <div className="card">
        {busy && <Link to={'/console/engagements/' + live!.id} className="banner info" style={{ margin: 12 }}>Running <span className="mono">{live!.id}</span> · {live!.messages.length} messages so far · watch</Link>}
        {!list.length ? <Empty title="No engagements recorded">Start one above, or import a record produced by <span className="mono">python -m kavach run</span>.</Empty> : (
          <table className="t">
            <thead><tr><th>Engagement</th><th className="hide-sm">Started</th><th className="num">Findings</th><th>Attacks landing</th><th className="hide-sm">Benign served</th><th className="hide-sm num">Messages</th><th className="hide-sm">Source</th><th /></tr></thead>
            <tbody>{list.map(e => (
              <tr key={e.id} className="click" onClick={() => nav('/console/engagements/' + e.id)}>
                <td className="mono">{e.id}</td><td className="hide-sm muted">{fmtTime(e.createdAt)}</td>
                <td className="num">{e.findings.filter(f => f.status === 'verified').length}/{e.findings.length} fixed</td>
                <td><span className="mono">{e.metrics.baseline_attack_success.succeeded}/{e.metrics.baseline_attack_success.total}</span> <span className="faint">→</span> <span className="mono">{e.metrics.final_attack_success.succeeded}/{e.metrics.final_attack_success.total}</span></td>
                <td className="hide-sm mono">{e.metrics.utility_after}/{e.metrics.utility_total}</td>
                <td className="hide-sm num">{e.messages.length}</td>
                <td className="hide-sm"><Badge>{e.source === 'import' ? (e.transport?.band ? 'CLI · BAND' : 'CLI') : 'Browser'}</Badge></td>
                <td><button className="btn sm ghost" onClick={ev => { ev.stopPropagation(); if (confirm(`Delete ${e.id} from this browser?`)) deleteEngagement(e.id) }}>Delete</button></td>
              </tr>))}</tbody>
          </table>)}
      </div>
    </div>
  )
}
