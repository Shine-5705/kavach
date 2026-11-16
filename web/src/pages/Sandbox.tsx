import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { chat, useEngine } from '../lib/engine'
import { useEngagements } from '../lib/store'
import { Badge, PageHead } from '../components/ui'

type Turn = { me: string; trace?: any; error?: string }
const BENIGN = ["What's my balance?", 'Search my transactions for Rapido', 'Refund T-5003 rs 499, the ride was cancelled', 'Show my KYC status']

export default function Sandbox() {
  const eng = useEngine(); const list = useEngagements(); const [sp] = useSearchParams()
  const rules = list[0]?.rules || []
  const [guarded, setGuarded] = useState(sp.get('guards') === 'on' && rules.length > 0)
  const [sid, setSid] = useState(() => 's' + Date.now())
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState(sp.get('try') || '')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [turns])
  const reset = (g = guarded) => { setGuarded(g); setSid('s' + Date.now()); setTurns([]) }
  const send = async (msg: string) => {
    if (!msg.trim() || busy) return
    setBusy(true); setText('')
    setTurns(t => [...t, { me: msg }])
    const r = await chat(sid, guarded ? rules : [], msg)
    setTurns(t => t.map((x, i) => i === t.length - 1 ? { ...x, trace: r.trace, error: r.error } : x))
    setBusy(false)
  }
  const atk = (eng.stage === 'ready' ? eng.catalog.attacks : []) as any[]
  const last = [...turns].reverse().find(t => t.trace)?.trace
  return (
    <div className="page" style={{ maxWidth: 1360 }}>
      <PageHead title="Target sandbox" sub="Talk to PaisaPal yourself, signed in as customer C-1001. Try Red's attacks with defenses off, then turn on what Blue deployed in the latest engagement."
        actions={<div className="seg"><button className={!guarded ? 'on' : ''} onClick={() => reset(false)}>Defenses off</button>
          <button className={guarded ? 'on' : ''} disabled={!rules.length} title={rules.length ? '' : 'Run an engagement first'} onClick={() => reset(true)}>Blue's defenses ({rules.length})</button></div>} />
      <div className="split">
        <div className="card">
          <div className="card-head"><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><h2>PaisaPal Support</h2>{guarded ? <Badge kind="verified">{rules.length} defenses on</Badge> : <Badge kind="open">Unprotected</Badge>}</div>
            <button className="btn sm" onClick={() => reset()}>New session</button></div>
          <div className="chat">
            {!turns.length && <div className="muted" style={{ margin: 'auto', textAlign: 'center', maxWidth: 420 }}>
              {eng.stage === 'ready' ? 'Send a message, or pick one of the attacks or everyday requests on the right. Each session has its own database, so a dispute note you file stays there for the next message.' : 'The engine is loading. The sandbox runs the real target code in your browser.'}</div>}
            {turns.map((t, i) => <div key={i} style={{ display: 'contents' }}>
              <div className="bubble me">{t.me}</div>
              {t.error ? <div className="banner err">{t.error}</div> : t.trace ? <div className="bubble bot">{t.trace.reply}
                {(t.trace.blocked_by.length > 0 || t.trace.tool_calls.length > 0 || t.trace.followed_directives.length > 0) && <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {t.trace.tool_calls.map((c: any, j: number) => <Badge key={j} kind={c.allowed ? '' : 'blocked'}>{c.tool} {c.allowed ? 'ran' : 'denied'}</Badge>)}
                  {t.trace.blocked_by.map((b: any, j: number) => <Badge key={'b' + j} kind="blocked">{b.rule}</Badge>)}
                  {t.trace.followed_directives.map((d: any, j: number) => <Badge key={'d' + j} kind="open">obeyed note on {d.txn}</Badge>)}
                </div>}</div> : <div className="bubble bot"><div className="skeleton" style={{ width: 160 }} /></div>}
            </div>)}
            <div ref={end} />
          </div>
          <form onSubmit={e => { e.preventDefault(); send(text) }} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)' }}>
            <input className="input" style={{ flex: 1, height: 36 }} placeholder="Message PaisaPal as C-1001…" value={text} onChange={e => setText(e.target.value)} disabled={eng.stage !== 'ready'} />
            <button className="btn primary" style={{ height: 36 }} disabled={eng.stage !== 'ready' || busy || !text.trim()}>Send</button>
          </form>
        </div>
        <div className="grid">
          <div className="card"><div className="card-head"><h2>Red's attacks</h2></div><div className="card-body chips">
            {atk.flatMap(a => [{ id: a.id, steps: a.steps }, ...a.variants.map((v: any) => ({ id: v.id, steps: v.steps }))]).map(x => (
              <button key={x.id} className="chip atk" title={x.steps.join('  ⟶  ')} onClick={async () => { for (const s of x.steps) await send(s) }}>{x.id}</button>))}
            {!atk.length && <div className="skeleton" style={{ width: '100%' }} />}</div></div>
          <div className="card"><div className="card-head"><h2>Everyday requests</h2></div><div className="card-body chips">{BENIGN.map(b => <button key={b} className="chip" onClick={() => send(b)}>{b}</button>)}</div></div>
          <div className="card"><div className="card-head"><h2>Last turn</h2></div><div className="card-body">
            {!last ? <span className="muted">Tool calls, decisions and blocks show up here.</span> : <dl className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
              <dt>Mode</dt><dd>{last.mode === 'overridden' ? <Badge kind="open">rules overridden by input</Badge> : 'normal'}</dd>
              {last.decoded && <><dt>Decoded</dt><dd className="mono">{last.decoded}</dd></>}
              <dt>Tools</dt><dd>{last.tool_calls.length ? last.tool_calls.map((c: any, i: number) => <div key={i} className="mono" style={{ fontSize: 12 }}>{c.tool}({Object.values(c.args).join(', ')}) {c.allowed ? '✓' : '✗ ' + c.denied_by}</div>) : <span className="muted">none</span>}</dd>
              <dt>Blocked by</dt><dd>{last.blocked_by.length ? last.blocked_by.map((b: any, i: number) => <div key={i} style={{ fontSize: 12.5 }}><span className="mono">{b.rule}</span> · {b.reason || b.pattern}</div>) : <span className="muted">nothing</span>}</dd>
              <dt>Wallet</dt><dd>Rs {last.balance?.toLocaleString('en-IN')} · {last.refunds?.length || 0} refunds this session</dd></dl>}
          </div></div>
        </div>
      </div>
    </div>
  )
}
