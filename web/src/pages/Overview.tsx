import { Link, useNavigate } from 'react-router-dom'
import { useEngine } from '../lib/engine'
import { useEngagements, useLive } from '../lib/store'
import { startRun } from '../lib/run'
import { Badge, CATEGORY, ChainBadge, Empty, PageHead, Sev, Stat, Status, fmtTime, pct } from '../components/ui'
import type { EngagementRecord } from '../lib/types'

export function categoryRows(r: EngagementRecord) {
  const before = r.metrics.baseline_attack_success.rows as any[]
  const after = r.metrics.final_attack_success.rows as any[]
  const cats = new Map<string, { cat: string; attack: string; total: number; b: number; a: number; f?: any }>()
  for (const f of r.findings) cats.set(f.id, { cat: f.category, attack: f.id, total: 0, b: 0, a: 0, f })
  before.forEach(x => { const c = cats.get(x.attack); if (c) { c.total++; c.b += x.success ? 1 : 0 } })
  after.forEach(x => { const c = cats.get(x.attack); if (c) c.a += x.success ? 1 : 0 })
  return [...cats.values()]
}

export function RunButton({ label = 'Run engagement', primary = true }: { label?: string; primary?: boolean }) {
  const eng = useEngine(); const live = useLive(); const nav = useNavigate()
  const busy = !!live && !live.done
  return (
    <button className={'btn' + (primary ? ' primary' : '')} disabled={eng.stage !== 'ready' || busy}
      onClick={async () => nav('/console/engagements/' + await startRun([], 260))}>
      {eng.stage !== 'ready' && eng.stage !== 'error' ? 'Engine loading…' : busy ? 'Engagement running…' : label}
    </button>
  )
}

export default function Overview() {
  const list = useEngagements()
  const live = useLive()
  const r = list[0]
  if (!r) return (
    <div className="page">
      <PageHead title="Overview" sub="Kavach puts a Red agent and a Blue agent on opposite sides of your AI assistant. Red attacks it, Blue defends it, and a fix only counts once Red fails to break it again." />
      <div className="card">
        <Empty title="No engagements yet" action={<div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}><RunButton label="Run the first engagement" />{live && !live.done && <Link className="btn" to={'/console/engagements/' + live.id}>Watch live</Link>}</div>}>
          Red will sign in as an ordinary customer of PaisaPal, a deliberately vulnerable UPI-wallet support agent, and try six attack families plus evasion variants. Everything runs in this browser tab against a sandbox with synthetic customers. It takes about 20 seconds.
        </Empty>
        <div className="grid g3" style={{ borderTop: '1px solid var(--line)', padding: 16, gap: 24 }}>
          <div><h3>1 · Red attacks</h3><p className="muted" style={{ marginTop: 4 }}>Prompt injection, instructions hidden in stored notes, cross-account KYC reads, uncapped refunds, SQL injection and PII in replies. Each is proven by an oracle that checks real evidence.</p></div>
          <div><h3>2 · Blue defends</h3><p className="muted" style={{ marginTop: 4 }}>Triage with Finch's code audit and PII scan, then guard rules on input, tools and output, plus code fixes. Every message between the agents is hash-chained.</p></div>
          <div><h3>3 · Red retests</h3><p className="muted" style={{ marginTop: 4 }}>The original attack and every evasion variant run again. Any bypass sends Blue back to escalate. Benign requests are re-checked so the fixes don't break the product.</p></div>
        </div>
      </div>
    </div>
  )
  const m = r.metrics
  const rows = categoryRows(r)
  const fp = (m.static_audit?.findings || []) as any[]
  const verified = r.findings.filter(f => f.status === 'verified').length
  return (
    <div className="page">
      <PageHead title="Overview" sub={<>Latest engagement <Link className="mono" to={'/console/engagements/' + r.id} style={{ textDecoration: 'underline' }}>{r.id}</Link> · {fmtTime(r.createdAt)} · {r.source === 'import' ? 'imported from CLI' : 'run in this browser'}</>}
        actions={<><Link className="btn" to="/console/sandbox">Open sandbox</Link><RunButton label="Run again" /></>} />
      {live && !live.done && <div className="banner info">An engagement is running. <Link to={'/console/engagements/' + live.id} style={{ textDecoration: 'underline' }}>Watch it live</Link></div>}
      <div className="card stats" style={{ marginBottom: 16 }}>
        <Stat k="Attacks landing" v={<>{m.final_attack_success.succeeded}<small> / {m.final_attack_success.total}</small></>} s={`was ${m.baseline_attack_success.succeeded} / ${m.baseline_attack_success.total} before Blue patched`} />
        <Stat k="Findings verified fixed" v={<>{verified}<small> / {r.findings.length}</small></>} s="closed only after a blocked retest" />
        <Stat k="Benign requests still served" v={<>{m.utility_after}<small> / {m.utility_total}</small></>} s={`${m.utility_before} / ${m.utility_total} before patching`} />
        <Stat k="A2A messages" v={r.messages.length} s={<ChainBadge msgs={r.messages} />} />
      </div>
      <div className="split">
        <div className="grid">
          <div className="card">
            <div className="card-head"><div><h2>Attack success by finding</h2><p>Original attack plus evasion variants, before and after Blue's defenses</p></div></div>
            <table className="t">
              <thead><tr><th>Finding</th><th className="hide-sm">Category</th><th>Before</th><th>After</th><th className="num">Rounds</th><th>Status</th></tr></thead>
              <tbody>{rows.map(x => (
                <tr key={x.attack} className="click" onClick={() => location.hash = `#/findings/${x.attack}?e=${r.id}`}>
                  <td><span className="mono">{x.attack}</span> <span className="muted hide-sm">{x.f.title}</span></td>
                  <td className="hide-sm">{CATEGORY[x.cat]}</td>
                  <td style={{ minWidth: 120 }}><div className="bar"><span style={{ width: pct(x.b, x.total) + '%', background: 'var(--red)' }} /></div><span className="faint" style={{ fontSize: 12 }}>{x.b}/{x.total} landed</span></td>
                  <td style={{ minWidth: 120 }}><div className="bar"><span style={{ width: pct(x.a, x.total) + '%', background: 'var(--red)' }} /></div><span className="faint" style={{ fontSize: 12 }}>{x.a}/{x.total} landed</span></td>
                  <td className="num">{x.f.rounds}</td>
                  <td><Status s={x.f.status} /></td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="card">
            <div className="card-head"><div><h2>Static review of the target's code</h2><p>Finch code-security-audit findings, each assessed by Blue</p></div><Link className="btn sm" to="/console/integrations">Run audit</Link></div>
            <table className="t">
              <thead><tr><th>Rule</th><th>Line</th><th>Severity</th><th>Blue's assessment</th></tr></thead>
              <tbody>{fp.map((f, i) => (
                <tr key={i}><td className="mono">{f.rule_id}</td><td className="mono">paisapal.py:{f.line}</td><td><Sev s={f.severity} /></td>
                  <td><Badge kind={f.assessment === 'confirmed' ? 'open' : f.assessment === 'false_positive' ? 'fp' : 'low'}>{f.assessment.replace('_', ' ')}</Badge> <span className="muted">{f.reason}</span></td></tr>))}</tbody>
            </table>
          </div>
        </div>
        <div className="grid">
          <div className="card">
            <div className="card-head"><h2>Findings</h2><Link className="btn sm ghost" to="/console/findings">All</Link></div>
            <div>{r.findings.map(f => (
              <Link key={f.id} to={`/console/findings/${f.id}?e=${r.id}`} style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
                <Sev s={f.severity} /><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</span>
              </Link>))}</div>
          </div>
          <div className="card">
            <div className="card-head"><h2>Recent engagements</h2><Link className="btn sm ghost" to="/console/engagements">All</Link></div>
            {list.slice(0, 5).map(e => (
              <Link key={e.id} to={'/console/engagements/' + e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
                <span className="mono">{e.id}</span><span className="muted">{e.metrics.baseline_attack_success.succeeded}→{e.metrics.final_attack_success.succeeded} landing</span>
              </Link>))}
          </div>
        </div>
      </div>
    </div>
  )
}
