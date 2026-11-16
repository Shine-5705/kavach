import { Link, useParams } from 'react-router-dom'
import { usePicked } from '../lib/pick'
import { Agent, Badge, CATEGORY, Empty, PageHead, Sev, Status, Type, fmtTime } from '../components/ui'
import Body from '../components/Body'

export default function FindingDetail() {
  const { fid } = useParams(); const { rec } = usePicked()
  const f = rec?.findings.find(x => x.id === fid)
  if (!rec || !f) return <div className="page"><div className="card"><Empty title="Finding not found" action={<Link className="btn" to="/findings">All findings</Link>} /></div></div>
  const thread = rec.messages.filter(m => m.thread === f.id)
  const results = thread.filter(m => m.type === 'RESULT')
  return (
    <div className="page">
      <PageHead title={`${f.id} · ${f.title}`} sub={<><Sev s={f.severity} /> &nbsp;{CATEGORY[f.category]} · {f.owasp} · engagement <Link className="mono" to={'/engagements/' + rec.id} style={{ textDecoration: 'underline' }}>{rec.id}</Link></>}
        actions={<><Link className="btn" to={`/sandbox?try=${encodeURIComponent(f.steps[f.steps.length - 1])}`}>Replay in sandbox</Link><Status s={f.status} /></>} />
      <div className="split">
        <div className="grid">
          <div className="card"><div className="card-head"><h2>Proof of exploit</h2><span className="muted" style={{ fontSize: 12.5 }}>Round 0, unguarded target</span></div>
            <div className="detail" style={{ margin: 0, border: 0 }}><Body m={thread.find(m => m.type === 'FINDING')!} /></div></div>
          <div className="card"><div className="card-head"><h2>Retest history</h2><span className="muted" style={{ fontSize: 12.5 }}>{results.length} round{results.length > 1 ? 's' : ''}</span></div>
            <table className="t"><thead><tr><th>Variant</th>{results.map(r => <th key={r.id}>Round {r.body.round}</th>)}</tr></thead>
              <tbody>{results[0]?.body.results.map((v: any) => (
                <tr key={v.variant}><td><span className="mono">{v.variant}</span><div className="muted" style={{ fontSize: 12 }}>{v.technique}</div></td>
                  {results.map(r => { const x = r.body.results.find((y: any) => y.variant === v.variant); return <td key={r.id}><Badge kind={x.outcome}>{x.outcome}</Badge><div className="faint mono" style={{ fontSize: 11.5, marginTop: 3 }}>{x.blocked_by.map((b: any) => b.rule).join(', ')}</div></td> })}
                </tr>))}</tbody></table></div>
        </div>
        <div className="grid">
          <div className="card"><div className="card-head"><h2>Triage</h2></div><div className="detail" style={{ margin: 0, border: 0 }}><Body m={thread.find(m => m.type === 'TRIAGE')!} /></div></div>
          <div className="card"><div className="card-head"><h2>Conversation</h2></div>
            {thread.map(m => <div key={m.id} style={{ padding: '9px 16px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Agent who={m.from} /><Type t={m.type} /><span className="faint mono" style={{ marginLeft: 'auto', fontSize: 11 }}>#{m.seq}</span></div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{m.summary}</div></div>)}
            <div className="card-body faint" style={{ fontSize: 12 }}>Recorded {fmtTime(thread[0]?.ts)}</div></div>
        </div>
      </div>
    </div>
  )
}
