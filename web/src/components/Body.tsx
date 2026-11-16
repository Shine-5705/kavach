import { Badge, CATEGORY, Diff, KIND, Sev, short } from './ui'
import type { Envelope } from '../lib/types'

const Evidence = ({ e }: { e: any }) => (
  <>
    <div className="sec"><h3 style={{ marginBottom: 6 }}>Target replied</h3><div className="quote">{e.reply}</div></div>
    {e.tool_calls?.length > 0 && <div className="sec"><h3 style={{ marginBottom: 6 }}>Tool calls</h3>
      <table className="t"><tbody>{e.tool_calls.map((c: any, i: number) => (
        <tr key={i}><td className="mono">{c.tool}</td><td className="mono muted" style={{ overflowWrap: 'anywhere' }}>{JSON.stringify(c.args)}</td>
          <td>{c.allowed ? <Badge kind="open">executed</Badge> : <Badge kind="blocked">denied · {c.denied_by}</Badge>}</td></tr>))}</tbody></table></div>}
    {e.followed_directives?.length > 0 && <div className="sec"><h3 style={{ marginBottom: 6 }}>Directives the target obeyed from stored data</h3>
      {e.followed_directives.map((d: any, i: number) => <div key={i} className="quote mono">{d.txn}: {d.directive}</div>)}</div>}
  </>
)

export default function Body({ m }: { m: Envelope }) {
  const b = m.body
  switch (m.type) {
    case 'HELLO': return <div className="sec"><dl className="kv"><dt>Agent</dt><dd><b>{b.name}</b> · {b.role}</dd><dt>Does</dt><dd>{b.description}</dd>
      <dt>Capabilities</dt><dd><div className="chips">{b.capabilities.map((c: string) => <span key={c} className="type">{c}</span>)}</div></dd>
      {b.skills?.length > 0 && <><dt>Skills</dt><dd>{b.skills.map((s: any) => `${s.provider} ${s.skill} (${s.license})`).join(' · ')}</dd></>}</dl></div>
    case 'SCOPE': return <div className="sec"><dl className="kv"><dt>Target</dt><dd>{b.target}</dd><dt>Red signs in as</dt><dd className="mono">{b.identity}</dd>
      <dt>In scope</dt><dd className="mono">{b.in_scope.join(', ')}</dd><dt>Categories</dt><dd>{b.categories.map((c: string) => CATEGORY[c]).join(', ')}</dd>
      <dt>Rules</dt><dd><ul style={{ margin: 0, paddingLeft: 18 }}>{b.rules.map((r: string) => <li key={r}>{r}</li>)}</ul></dd></dl></div>
    case 'SCOPE_ACK': return <div className="sec">Accepted. {b.attacks_planned} attack families and {b.variants_planned} evasion variants queued.</div>
    case 'FINDING': return <>
      <div className="sec"><dl className="kv"><dt>Finding</dt><dd><b>{b.title}</b></dd><dt>Class</dt><dd>{b.owasp}</dd><dt>Oracle</dt><dd><span className="mono">{b.evidence.oracle}</span> · {b.evidence.detail}</dd>
        <dt>Attack</dt><dd>{b.steps.map((s: string, i: number) => <div key={i} className="quote mono" style={{ marginBottom: 4 }}>{s}</div>)}</dd>
        <dt>Variants held back</dt><dd className="mono">{b.variants.join(', ')}</dd></dl></div>
      <Evidence e={b.evidence} /></>
    case 'TRIAGE': return <div className="sec"><dl className="kv"><dt>Severity</dt><dd><Sev s={b.severity} /> <span className="mono">{b.score}</span></dd>
      <dt>Impact</dt><dd>{b.impact}</dd><dt>Rationale</dt><dd>{b.rationale}</dd>
      <dt>Finch code audit</dt><dd>{b.static_evidence.length ? b.static_evidence.map((s: any, i: number) => <div key={i}><span className="mono">{s.path}:{s.line}</span> · {s.rule_id}<pre className="code" style={{ marginTop: 4 }}>{s.excerpt}</pre></div>) : <span className="muted">No static signature for this class</span>}</dd>
      <dt>Finch PII scan</dt><dd>{b.pii_in_evidence.length ? b.pii_in_evidence.join(', ') + ' found in the leaked reply' : <span className="muted">No PII in the evidence</span>}</dd>
      <dt>Plan</dt><dd><ul style={{ margin: 0, paddingLeft: 18 }}>{b.plan.map((p: string) => <li key={p}>{p}</li>)}</ul></dd></dl></div>
    case 'PATCH': return <>
      <div className="sec"><table className="t"><thead><tr><th>Rule</th><th>Enforced at</th><th>What it does</th><th className="num">v</th></tr></thead>
        <tbody>{b.rules.map((r: any) => <tr key={r.id + r.version}><td className="mono">{r.id}</td><td>{KIND[r.kind]}</td><td>{r.title}</td><td className="num">{r.version}</td></tr>)}</tbody></table></div>
      {b.code_fix?.applied && <div className="sec"><h3 style={{ marginBottom: 6 }}>Code fix, re-audited with Finch: confirmed SQL injections {b.code_fix.finch_sql_injection_before} → {b.code_fix.finch_sql_injection_after}</h3><Diff text={b.code_fix.diff} /></div>}</>
    case 'RETEST': return <div className="sec">Round {b.round}: re-run <span className="mono">{b.variants.join(', ')}</span> against the patched target.</div>
    case 'RESULT': return <div className="sec"><table className="t"><thead><tr><th>Variant</th><th>Technique</th><th>Outcome</th><th>Evidence</th></tr></thead>
      <tbody>{b.results.map((r: any) => <tr key={r.variant}><td className="mono">{r.variant}</td><td>{r.technique}</td><td><Badge kind={r.outcome}>{r.outcome}</Badge></td>
        <td className="muted">{r.outcome === 'blocked' ? (r.blocked_by.map((x: any) => `${x.rule} (${x.stage})`).join(', ') || r.detail) : r.detail}</td></tr>)}</tbody></table></div>
    case 'VERIFIED': return <div className="sec">Closed after {b.rounds} round{b.rounds > 1 ? 's' : ''}. Defenses in force: <span className="mono">{b.rules.join(', ')}</span></div>
    case 'UTILITY': return <div className="sec"><table className="t"><thead><tr><th>Benign request</th><th>Served</th><th>Reply</th></tr></thead>
      <tbody>{b.checks.map((c: any) => <tr key={c.id}><td>{c.ask}</td><td><Badge kind={c.ok ? 'ok' : 'open'}>{c.ok ? 'yes' : 'no'}</Badge></td><td className="muted" style={{ whiteSpace: 'pre-wrap' }}>{c.reply}</td></tr>)}</tbody></table></div>
    case 'REPORT': return <div className="sec"><dl className="kv"><dt>Attacks landing</dt><dd>{b.attack_success_before} before → <b>{b.attack_success_after}</b> after</dd>
      <dt>Findings</dt><dd>{b.verified} of {b.findings} verified fixed</dd><dt>Benign traffic</dt><dd>{b.utility_before} before → {b.utility_after} after</dd>
      <dt>Defenses deployed</dt><dd className="mono">{b.rules.map((r: any) => r.id).join(', ')}</dd><dt>Finch skill calls</dt><dd>{b.finch_calls}</dd>
      <dt>Chain head</dt><dd className="hash">{b.chain_head}</dd></dl></div>
    default: return <pre className="code">{JSON.stringify(b, null, 2)}</pre>
  }
}

export function EnvelopeView({ m }: { m: Envelope }) {
  return <div className="sec"><dl className="kv" style={{ marginBottom: 8 }}><dt>id</dt><dd className="mono">{m.id}</dd><dt>prev</dt><dd className="hash">{m.prev}</dd><dt>hash</dt><dd className="hash">{m.hash}</dd></dl>
    <pre className="code">{JSON.stringify(m, null, 2)}</pre></div>
}
export { short }
