import { PageHead } from '../components/ui'
const TYPES: [string, string, string][] = [
  ['HELLO', 'both', 'Agent card: identity, role, capabilities, skills'], ['SCOPE', 'Blue → Red', 'Rules of engagement: target, identity, tools in scope, constraints'],
  ['SCOPE_ACK', 'Red → Blue', 'Accepts the scope and states what it will run'], ['FINDING', 'Red → Blue', 'A reproduced weakness: attack steps, oracle, evidence, held-back variants'],
  ['TRIAGE', 'Blue → Red', 'Severity, impact, static evidence (Finch), PII in evidence, plan'], ['PATCH', 'Blue → Red', 'Defenses deployed, as data: kind, params, version; optional code diff'],
  ['RETEST', 'Blue → Red', 'Re-attack: the original plus every evasion variant'], ['RESULT', 'Red → Blue', 'Per-variant outcome: blocked (and by which rule) or bypassed'],
  ['VERIFIED', 'Blue → Red', 'Finding closed. Only sent after a RESULT with zero bypasses'], ['UTILITY', 'Red → Blue', 'Benign traffic replay to prove the fixes did not break the product'],
  ['REPORT', 'Blue → all', 'Before/after attack success, utility, rules, static review, chain head'],
]
export default function Protocol() {
  return (
    <div className="page">
      <PageHead title="A2A protocol" sub="kavach.a2a/0.1: how Red and Blue talk. Messages are typed, addressed, threaded by finding, and hash-chained so the log can't be quietly edited." />
      <div className="split">
        <div className="card"><table className="t"><thead><tr><th>Type</th><th>Direction</th><th>Carries</th></tr></thead>
          <tbody>{TYPES.map(([t, d, c]) => <tr key={t}><td><span className="type">{t}</span></td><td className="muted">{d}</td><td>{c}</td></tr>)}</tbody></table></div>
        <div className="grid">
          <div className="card"><div className="card-head"><h2>Envelope</h2></div><div className="card-body"><pre className="code">{`{
  "protocol": "kavach.a2a/0.1",
  "engagement": "eng-20261116-221500",
  "seq": 12, "id": "eng-…-m012", "ts": 1763311500123,
  "from": "blue", "to": "red",
  "type": "PATCH", "thread": "SQL-01",
  "summary": "Deployed tool.sql_meta, code.safe_sql",
  "body": { … },
  "prev": "<sha256 of message 11>",
  "hash": "<sha256 of this message without hash>"
}`}</pre></div></div>
          <div className="card"><div className="card-head"><h2>Integrity</h2></div><div className="card-body muted" style={{ fontSize: 13 }}>
            hash = SHA-256 of the canonical JSON (sorted keys, no whitespace) of the envelope minus <span className="mono">hash</span>. Changing any field, or dropping or reordering a message, breaks every later link. The engine verifies the chain in Python, this console re-verifies it in JavaScript, and imports with a broken chain are refused.</div></div>
          <div className="card"><div className="card-head"><h2>Transports</h2></div><div className="card-body muted" style={{ fontSize: 13 }}>
            In-process ledger (browser and CLI), mirrored to a BAND room with <span className="mono">--band</span>, where each envelope is a message from its sender's BAND agent that @mentions the recipient.</div></div>
        </div>
      </div>
    </div>
  )
}
