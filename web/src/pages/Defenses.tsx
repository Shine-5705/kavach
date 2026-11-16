import { Link } from 'react-router-dom'
import { usePicked } from '../lib/pick'
import Picker from '../components/Picker'
import { Badge, Empty, KIND, PageHead } from '../components/ui'
import { RunButton } from './Overview'

export default function Defenses() {
  const { list, rec, pick } = usePicked()
  if (!rec) return <div className="page"><PageHead title="Defenses" /><div className="card"><Empty title="No defenses deployed yet" action={<RunButton />}>Blue deploys defenses in response to Red's findings. Run an engagement to see them.</Empty></div></div>
  const results = rec.messages.filter(m => m.type === 'RESULT')
  const blocks: Record<string, number> = {}
  results.forEach(r => r.body.results.forEach((v: any) => v.blocked_by.forEach((b: any) => { blocks[b.rule] = (blocks[b.rule] || 0) + 1 })))
  const closes: Record<string, string[]> = {}
  rec.messages.filter(m => m.type === 'PATCH').forEach(p => p.body.rules.forEach((r: any) => { closes[r.id] = [...new Set([...(closes[r.id] || []), p.thread!])] }))
  const byKind = ['input', 'tool', 'output', 'code']
  return (
    <div className="page">
      <PageHead title="Defenses" sub="What Blue deployed on the target, where each rule is enforced, and how often it stopped one of Red's retests." actions={<><Picker list={list} rec={rec} pick={pick} /><Link className="btn" to="/console/sandbox?guards=on">Test them in the sandbox</Link></>} />
      <div className="grid g4" style={{ marginBottom: 16 }}>{byKind.map(k => (
        <div key={k} className="card stat"><div className="k">{KIND[k]}</div><div className="v">{rec.rules.filter(r => r.kind === k).length}</div><div className="s">{k === 'input' ? 'before the planner reads the message' : k === 'tool' ? 'before a tool call executes' : k === 'output' ? 'before the reply leaves' : 'hardened code paths enabled'}</div></div>))}</div>
      <div className="card">
        <table className="t">
          <thead><tr><th>Rule</th><th>Enforced at</th><th>Policy</th><th className="hide-sm">Closes</th><th className="num">Retest blocks</th><th className="num hide-sm">Version</th></tr></thead>
          <tbody>{rec.rules.map(r => (
            <tr key={r.id}><td className="mono">{r.id}</td><td><Badge>{KIND[r.kind]}</Badge></td>
              <td>{r.title}{r.params?.cap && <div className="muted" style={{ fontSize: 12 }}>cap Rs {r.params.cap.toLocaleString('en-IN')}</div>}{r.params?.tools && <div className="muted mono" style={{ fontSize: 12 }}>{r.params.tools.join(', ')}</div>}{r.params?.patterns && <div className="muted" style={{ fontSize: 12 }}>{r.params.patterns.length} patterns{r.params.normalize ? ', after normalisation' : ''}</div>}</td>
              <td className="hide-sm">{(closes[r.id] || []).map(c => <Link key={c} to={`/console/findings/${c}?e=${rec.id}`} className="mono" style={{ marginRight: 6, textDecoration: 'underline' }}>{c}</Link>)}</td>
              <td className="num">{blocks[r.id] || 0}</td><td className="num hide-sm">v{r.version}</td></tr>))}</tbody>
        </table>
        <div className="card-body faint" style={{ fontSize: 12, borderTop: '1px solid var(--line)' }}>A retest block is counted when this rule is the one that stopped a variant. Layered rules can make one count zero while still adding depth (code.safe_sql sits behind tool.sql_meta, for example).</div>
      </div>
    </div>
  )
}
