// Landing extras: hero replay, A2A timeline, heatmap, report, reply diff.
// Everything here renders data produced by the engine in this tab.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY } from '../components/ui'
import type { EngagementRecord, Envelope } from '../lib/types'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// ------------------------------------------------------------ hero replay
export function HeroLive({ rec, loading }: { rec: EngagementRecord | null; loading: string }) {
  const msgs = rec?.messages || []
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => { setI(reduced() ? msgs.length : 0) }, [rec]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!msgs.length || paused) return
    const t = setTimeout(() => setI(n => n >= msgs.length + 6 ? 0 : n + 1), i >= msgs.length ? 900 : 520)
    return () => clearTimeout(t)
  }, [i, msgs.length, paused])
  const shown = msgs.slice(0, Math.min(i, msgs.length))
  const last = shown.slice(-7)
  const findings = shown.filter(m => m.type === 'FINDING').length
  const patches = shown.filter(m => m.type === 'PATCH').length
  const verified = shown.filter(m => m.type === 'VERIFIED').length
  const report = shown.find(m => m.type === 'REPORT')
  const base = rec?.metrics?.baseline_attack_success
  return (
    <div className="hlive" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="hl-head">
        <span className="hl-dots"><i /><i /><i /></span>
        <span className="mono faint">{rec ? rec.id : 'engagement'} · kavach.a2a/0.1</span>
        <span className={'hl-live' + (paused ? ' p' : '')}>{rec ? (paused ? 'paused' : 'replaying live run') : 'starting'}</span>
      </div>
      <div className="hl-lanes"><span className="lr"><i />Red · attacker</span><span className="lb">Blue · defender<i /></span></div>
      <div className="hl-body">
        {!rec && <div className="hl-wait"><span className="lspin" />{loading}</div>}
        {last.map(m => <div key={m.seq} className={'hl-m ' + m.from}>
          <div className="hl-b"><span className="hl-t">{m.type}</span><span className="hl-s">{m.summary}</span><span className="hl-h mono">#{m.seq} {m.hash.slice(0, 8)}</span></div>
        </div>)}
      </div>
      <div className="hl-foot">
        <div><span>Findings</span><b>{findings}</b></div>
        <div><span>Patches</span><b>{patches}</b></div>
        <div><span>Verified</span><b className={verified ? 'good' : ''}>{verified}</b></div>
        <div><span>Attacks landing</span><b>{report ? <><s className="faint">{report.body.attack_success_before}</s> <span className="good">{report.body.attack_success_after}</span></> : base && findings ? <span className="bad">{base.succeeded}/{base.total}</span> : '–'}</b></div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ A2A timeline
export function Timeline({ msgs, live }: { msgs: Envelope[]; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => { if (live) ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }) }, [msgs.length, live])
  return (
    <div className="tl">
      <div className="tl-lanes"><span className="lr"><i />Red agent</span><span className="mono faint">{msgs.length} envelopes · SHA-256 chained</span><span className="lb">Blue agent<i /></span></div>
      <div className="tl-body" ref={ref}>
        {!msgs.length && <p className="faint pad">The agent-to-agent conversation appears here when Blue starts patching.</p>}
        {msgs.map(m => <div key={m.seq} className={'tl-m ' + m.from + (open === m.seq ? ' open' : '')} onClick={() => setOpen(open === m.seq ? null : m.seq)}>
          <div className="tl-card">
            <div className="tl-top"><span className={'tl-type t-' + m.type}>{m.type}</span>{m.thread && <code>{m.thread}</code>}<span className="mono faint tl-h">#{m.seq} · {m.hash.slice(0, 10)}</span></div>
            <div className="tl-s">{m.summary}</div>
            {open === m.seq && <pre className="tl-raw">{JSON.stringify({ ...m, body: m.body }, null, 1).slice(0, 2400)}</pre>}
          </div>
        </div>)}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ heatmap
type Row = { attack: string; variant: string; success: boolean }
export function Heatmap({ rec }: { rec: EngagementRecord }) {
  const b: Row[] = rec.metrics?.baseline_attack_success?.rows || []
  const a: Row[] = rec.metrics?.final_attack_success?.rows || []
  const cat = Object.fromEntries(rec.findings.map(f => [f.id, f.category]))
  const fam = [...new Set(b.map(r => r.attack))]
  const rounds = Object.fromEntries(rec.findings.map(f => [f.id, f.rounds]))
  const [hover, setHover] = useState<string>('')
  return (
    <div className="hm">
      <div className="hm-grid">
        <div className="hm-h" /><div className="hm-h">Unguarded</div><div className="hm-h">Defended</div><div className="hm-h hide-sm">Rounds</div>
        {fam.map(f => <div key={f} className="hm-row">
          <div className="hm-f"><code>{f}</code><span>{CATEGORY[cat[f]] || f}</span></div>
          {[b, a].map((rows, k) => <div key={k} className="hm-cells">{rows.filter(r => r.attack === f).map(r =>
            <span key={r.variant} className={'hm-c ' + (r.success ? 'bad' : 'good')} onMouseEnter={() => setHover(`${r.variant}: ${r.success ? 'landed' : 'blocked'} ${k ? 'with' : 'without'} Blue's defenses`)} onMouseLeave={() => setHover('')} title={r.variant} />)}</div>)}
          <div className="hm-r hide-sm">{rounds[f] ? <>{Array.from({ length: rounds[f] }).map((_, j) => <i key={j} className={j === rounds[f] - 1 ? 'ok' : 'esc'} />)}<span>{rounds[f]}</span></> : '–'}</div>
        </div>)}
      </div>
      <div className="hm-foot"><span><i className="hm-c bad" />landed</span><span><i className="hm-c good" />blocked</span><span><i className="hm-rk esc" />round bypassed, Blue escalated</span><span className="faint mono">{hover || 'hover a cell'}</span></div>
    </div>
  )
}

// ------------------------------------------------------------ report
export function buildReport(rec: EngagementRecord, chainOk: boolean | null): string {
  const m = rec.metrics || {}
  const b = m.baseline_attack_success, a = m.final_attack_success
  const lines: string[] = []
  const when = new Date(rec.createdAt || Date.now()).toISOString()
  lines.push(`# Kavach report: PaisaPal Support (sandbox)`, '', `Engagement \`${rec.id}\` · protocol ${rec.protocol} · generated ${when}`, '',
    `Generated in the browser from the engagement record produced by the Kavach engine (engine/kavach, deterministic, no LLM).`, '',
    `## Summary`, '', `| Metric | Before Blue | After Blue |`, `|---|---|---|`,
    `| Attacks landing (originals + evasion variants) | ${b?.succeeded}/${b?.total} | ${a?.succeeded}/${a?.total} |`,
    `| Benign requests served | ${m.utility_before}/${m.utility_total} | ${m.utility_after}/${m.utility_total} |`,
    `| Findings verified fixed by retest | | ${rec.findings.filter(f => f.status === 'verified').length}/${rec.findings.length} |`,
    `| A2A messages | | ${rec.messages.length}${chainOk === null ? '' : chainOk ? ', hash chain verified (WebCrypto)' : ', HASH CHAIN BROKEN'} |`, '')
  lines.push(`## Findings`, '')
  const results = rec.messages.filter(x => x.type === 'RESULT')
  for (const f of rec.findings) {
    lines.push(`### ${f.id} · ${f.title}`, '', `- Severity: **${f.severity}**${f.triage ? ` (score ${f.triage.score})` : ''} · ${CATEGORY[f.category] || f.category} · ${f.owasp}`,
      `- Status: **${f.status === 'verified' ? 'verified fixed' : 'open'}** after ${f.rounds} round(s)`,
      `- Proof of exploit: ${f.evidence.detail}`, `- Attack input: \`${f.steps.join(' ⏎ ').replace(/`/g, "'")}\``,
      `- Defenses: ${(f.patches || []).map(p => '`' + p + '`').join(', ') || 'none'}`)
    if (f.triage?.rationale) lines.push(`- Triage: ${f.triage.rationale}`)
    for (const r of results.filter(x => x.thread === f.id)) {
      lines.push(`- Retest round ${r.body.round}: ` + r.body.results.map((x: any) => `${x.variant} ${x.outcome}`).join(', '))
    }
    lines.push('')
  }
  lines.push(`## Defenses deployed`, '', `| Rule | Enforced at | Version | What it does |`, `|---|---|---|---|`)
  for (const r of rec.rules) lines.push(`| \`${r.id}\` | ${r.kind} | v${r.version} | ${r.title} |`)
  const fix = rec.messages.find(x => x.type === 'PATCH' && x.body.code_fix?.applied)?.body.code_fix
  if (fix) lines.push('', `## Code fix`, '', `Finch code-security-audit, confirmed SQL injections: ${fix.finch_sql_injection_before} → ${fix.finch_sql_injection_after}`, '', '```diff', fix.diff.trim(), '```')
  const sa = m.static_audit
  if (sa?.findings?.length) {
    lines.push('', `## Static review (Finch code-security-audit, assessed by Blue)`, '', `| Rule | Line | Severity | Blue's assessment |`, `|---|---|---|---|`)
    for (const s of sa.findings) lines.push(`| ${s.rule_id} | ${s.file ? s.file.split('/').pop() + ':' : ''}${s.line} | ${s.severity} | ${s.assessment || ''}${s.reason ? ': ' + s.reason : ''} |`)
  }
  const head = rec.messages[rec.messages.length - 1]?.hash
  lines.push('', `## Integrity`, '', `Chain head: \`${head}\`. Re-verify with \`python -m kavach verify ${rec.id}.json\` after exporting the record from the console.`, '',
    `## Scope`, '', `Sandbox target with synthetic customers. Finch skills ran in-process. BAND, Lyzr and AdaL adapters were not used in this exported run (BAND has a separate live run, see docs/evidence).`, '')
  return lines.join('\n')
}

function mdToHtml(md: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
  const out: string[] = []; const L = md.split('\n'); let i = 0
  while (i < L.length) {
    const l = L[i]
    if (l.startsWith('```')) { const buf = []; i++; while (i < L.length && !L[i].startsWith('```')) buf.push(L[i++]); i++
      out.push('<pre>' + buf.map(x => `<span class="${x.startsWith('+') && !x.startsWith('+++') ? 'a' : x.startsWith('-') && !x.startsWith('---') ? 'd' : ''}">${esc(x)}</span>`).join('\n') + '</pre>'); continue }
    if (l.startsWith('|')) { const rows = []; while (i < L.length && L[i].startsWith('|')) rows.push(L[i++])
      const cells = (r: string) => r.slice(1, -1).split('|').map(c => c.trim())
      out.push('<table><thead><tr>' + cells(rows[0]).map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' + rows.slice(2).map(r => '<tr>' + cells(r).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>'); continue }
    if (l.startsWith('- ')) { const items = []; while (i < L.length && L[i].startsWith('- ')) items.push(L[i++].slice(2)); out.push('<ul>' + items.map(x => `<li>${inline(x)}</li>`).join('') + '</ul>'); continue }
    if (l.startsWith('### ')) out.push(`<h3>${inline(l.slice(4))}</h3>`)
    else if (l.startsWith('## ')) out.push(`<h2>${inline(l.slice(3))}</h2>`)
    else if (l.startsWith('# ')) out.push(`<h1>${inline(l.slice(2))}</h1>`)
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`)
    i++
  }
  return out.join('\n')
}
export function reportHtml(md: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Kavach report</title><style>
body{font:14px/1.6 Inter,system-ui,sans-serif;color:#17171a;max-width:860px;margin:40px auto;padding:0 28px}
h1{font-size:26px;letter-spacing:-.02em;margin:0 0 6px}h2{font-size:18px;margin:32px 0 10px;padding-top:14px;border-top:1px solid #e7e6e3}h3{font-size:15px;margin:22px 0 6px}
code{font:12.5px ui-monospace,Menlo,monospace;background:#f3f3f1;padding:1px 4px;border-radius:4px}
table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}th,td{text-align:left;border-bottom:1px solid #e7e6e3;padding:6px 8px;vertical-align:top}th{color:#7c7c83;font-weight:500}
pre{font:11.5px/1.5 ui-monospace,Menlo,monospace;background:#f7f7f5;border:1px solid #e7e6e3;border-radius:6px;padding:10px;overflow:auto;white-space:pre}pre .a{background:#e6f4ea;display:inline-block;width:100%}pre .d{background:#fbe9e7;display:inline-block;width:100%}
ul{padding-left:20px}.bar{position:sticky;top:0;background:#fff;padding:10px 0;display:flex;gap:8px;justify-content:flex-end}.bar button{font:inherit;padding:6px 14px;border:1px solid #d6d5d1;border-radius:6px;background:#17171a;color:#fff;cursor:pointer}
@media print{.bar{display:none}body{margin:0}}</style></head><body><div class="bar"><button onclick="print()">Save as PDF</button></div>${mdToHtml(md)}</body></html>`
}
export function ReportPanel({ rec, chainOk }: { rec: EngagementRecord; chainOk: boolean | null }) {
  const md = useMemo(() => buildReport(rec, chainOk), [rec, chainOk])
  const dl = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = `kavach-report-${rec.id}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }
  const pdf = () => { const w = window.open(URL.createObjectURL(new Blob([reportHtml(md)], { type: 'text/html' })), '_blank'); if (!w) alert('Allow pop-ups to open the printable report.') }
  return (
    <div className="rep">
      <div className="rep-doc" dangerouslySetInnerHTML={{ __html: mdToHtml(md) }} />
      <div className="rep-act"><button className="lbtn primary" onClick={dl}>Download .md</button><button className="lbtn" onClick={pdf}>Open printable report (PDF)</button><span className="faint small">{md.split('\n').length} lines · built from engagement <code>{rec.id}</code></span></div>
    </div>
  )
}

// ------------------------------------------------------------ reply/tool diff
export function CompareDiff({ u, g }: { u: any; g: any }) {
  const rows: { k: string; a: string; b: string; changed: boolean }[] = []
  const n = Math.max(u.tool_calls.length, g.tool_calls.length)
  for (let i = 0; i < n; i++) {
    const x = u.tool_calls[i], y = g.tool_calls[i]
    const f = (c: any) => c ? `${c.tool}(${Object.values(c.args || {}).map(v => JSON.stringify(v)).join(', ')}) ${c.allowed ? 'executed' : 'denied by ' + c.denied_by}` : 'no call'
    rows.push({ k: 'tool call ' + (i + 1), a: f(x), b: f(y), changed: f(x) !== f(y) })
  }
  const stages = (t: any) => t.blocked_by.map((b: any) => `${b.rule} @ ${b.stage}`).join(', ') || 'none'
  rows.push({ k: 'guards fired', a: stages(u), b: stages(g), changed: stages(u) !== stages(g) })
  const rf = (t: any) => (t.refunds || []).map((r: any) => `${r.txn_id} Rs ${r.amount} → ${r.account_id}`).join(', ') || 'none'
  rows.push({ k: 'refund rows', a: rf(u), b: rf(g), changed: rf(u) !== rf(g) })
  const ul = u.reply.split('\n'), gl = g.reply.split('\n')
  const same = u.reply === g.reply
  return (
    <div className="cdiff">
      <div className="panel-head"><span>Guarded vs unguarded diff</span><span className={'pill ' + (rows.some(r => r.changed) || !same ? 'ok' : 'mut')}><i />{rows.filter(r => r.changed).length + (same ? 0 : 1)} differences</span></div>
      <table className="cd-t"><tbody>{rows.map(r => <tr key={r.k} className={r.changed ? 'ch' : ''}><th>{r.k}</th><td className="del">{r.a}</td><td className="add">{r.b}</td></tr>)}</tbody></table>
      <pre className="cd-reply">{same ? <span>  {u.reply}</span> : <>{ul.map((l: string, i: number) => <span key={'u' + i} className="d">- {l}</span>)}{gl.map((l: string, i: number) => <span key={'g' + i} className="a">+ {l}</span>)}</>}</pre>
    </div>
  )
}
