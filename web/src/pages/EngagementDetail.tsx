import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useEngagements, useLive } from '../lib/store'
import { downloadRecord } from '../lib/run'
import { Agent, Badge, ChainBadge, Empty, PageHead, Sev, Status, Type, fmtTime } from '../components/ui'
import Body, { EnvelopeView } from '../components/Body'
import type { Envelope } from '../lib/types'

function Msg({ m, fresh, t0 }: { m: Envelope; fresh?: boolean; t0: number }) {
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState(false)
  return (
    <div className={`msg ${m.from}${fresh ? ' new' : ''}`}>
      <div className="seq">{String(m.seq).padStart(2, '0')}</div>
      <div className="row">
        <div className="line1" onClick={() => setOpen(!open)}>
          <Agent who={m.from} /><span className="arrow">→</span><Agent who={m.to} /><Type t={m.type} />
          {m.thread && <span className="mono faint">{m.thread}</span>}
          <span className="when">+{((m.ts - t0) / 1000).toFixed(2)}s</span>
        </div>
        <div className="sum" onClick={() => setOpen(!open)}>{m.summary}</div>
        {open && <div className="detail">
          <Body m={m} />
          <div className="sec" style={{ display: 'flex', gap: 8 }}><button className="btn sm" onClick={() => setRaw(!raw)}>{raw ? 'Hide' : 'Show'} signed envelope</button><span className="hash" style={{ alignSelf: 'center' }}>sha256 {m.hash.slice(0, 16)}…</span></div>
          {raw && <EnvelopeView m={m} />}
        </div>}
      </div>
    </div>
  )
}

export default function EngagementDetail() {
  const { id } = useParams()
  const list = useEngagements(); const live = useLive()
  const rec = list.find(e => e.id === id)
  const isLive = !!live && live.id === id && !live.done
  const msgs: Envelope[] = useMemo(() => rec ? rec.messages : isLive ? live!.messages.map(x => x.m) : [], [rec, isLive, live])
  const [thread, setThread] = useState<string>('')
  const [type, setType] = useState<string>('')
  if (!rec && !isLive) return <div className="page">{live && live.id === id && live.error ? <div className="banner err">This engagement failed: {live.error}</div> : null}<div className="card"><Empty title="Engagement not found" action={<Link className="btn" to="/console/engagements">Back to engagements</Link>}>It may have been deleted, or it was recorded in another browser. Import its JSON to view it here.</Empty></div></div>
  const t0 = msgs[0]?.ts || 0
  const shown = msgs.filter(m => (!thread || m.thread === thread) && (!type || m.type === type))
  const findings = rec ? rec.findings : msgs.filter(m => m.type === 'FINDING').map(m => ({ ...m.body, status: msgs.some(x => x.type === 'VERIFIED' && x.thread === m.thread) ? 'verified' : 'open' }))
  const types = [...new Set(msgs.map(m => m.type))]
  const report = msgs.find(m => m.type === 'REPORT')?.body
  return (
    <div className="page" style={{ maxWidth: 1360 }}>
      <PageHead title={id!} sub={isLive ? <>Running in this tab · {msgs.length} messages so far</> : <>{fmtTime(rec!.createdAt)} · {rec!.source === 'import' ? 'Imported from the CLI' : 'Run in this browser'} · reasoner: {rec!.reasoner || 'offline'}</>}
        actions={rec && <><button className="btn" onClick={() => downloadRecord(rec)}>Export JSON</button><Link className="btn" to={`/console/findings?e=${rec.id}`}>Findings</Link></>} />
      <div className="split">
        <div className="card">
          <div className="toolbar">
            <select className="input" value={thread} onChange={e => setThread(e.target.value)}><option value="">All threads</option>{findings.map((f: any) => <option key={f.id} value={f.id}>{f.id}</option>)}</select>
            <select className="input" value={type} onChange={e => setType(e.target.value)}><option value="">All message types</option>{types.map(t => <option key={t}>{t}</option>)}</select>
            <span className="muted" style={{ fontSize: 12.5 }}>{shown.length} of {msgs.length} messages · click a message to open it</span>
            <span style={{ flex: 1 }} />{isLive ? <Badge kind="running">Live</Badge> : <ChainBadge msgs={msgs} />}
          </div>
          {!msgs.length ? <div className="card-body"><div className="skeleton" style={{ width: '60%', marginBottom: 10 }} /><div className="skeleton" style={{ width: '40%' }} /></div> :
            !shown.length ? <Empty title="No messages match these filters" /> :
              <div className="tl">{shown.map((m, i) => <Msg key={m.id} m={m} t0={t0} fresh={isLive && i === shown.length - 1} />)}</div>}
        </div>
        <div className="grid">
          <div className="card">
            <div className="card-head"><h2>Outcome</h2></div>
            {report ? <div className="card-body"><dl className="kv" style={{ gridTemplateColumns: '1fr auto' }}>
              <dt>Attacks landing before</dt><dd className="mono">{report.attack_success_before}</dd>
              <dt>Attacks landing after</dt><dd className="mono"><b>{report.attack_success_after}</b></dd>
              <dt>Benign served after</dt><dd className="mono">{report.utility_after}</dd>
              <dt>Defenses deployed</dt><dd className="mono">{report.rules.length}</dd>
              <dt>Finch skill calls</dt><dd className="mono">{report.finch_calls}</dd></dl></div>
              : <div className="card-body muted">Red and Blue are still working. The outcome appears when Blue files its report.</div>}
          </div>
          <div className="card">
            <div className="card-head"><h2>Findings</h2><span className="muted" style={{ fontSize: 12 }}>filter the timeline</span></div>
            {!findings.length ? <div className="card-body muted">No findings yet.</div> : findings.map((f: any) => (
              <button key={f.id} onClick={() => setThread(thread === f.id ? '' : f.id)} style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center', padding: '9px 16px', border: 0, borderBottom: '1px solid var(--line)', background: thread === f.id ? 'var(--sunken)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                <span className="mono" style={{ width: 62 }}>{f.id}</span><Sev s={f.severity} /><span style={{ flex: 1 }} /><Status s={f.status} />
              </button>))}
          </div>
          <div className="card"><div className="card-head"><h2>How to read this</h2></div><div className="card-body muted" style={{ fontSize: 13 }}>
            Red's messages sit on the red rule, Blue's on the blue rule. Each carries the SHA-256 of the previous one, and this page re-checks every hash in your browser with WebCrypto. A finding turns green only after a RESULT where every variant is blocked.</div></div>
        </div>
      </div>
    </div>
  )
}
