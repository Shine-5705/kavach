import { useState } from 'react'
import { audit, redact, useEngine } from '../lib/engine'
import { Badge, PageHead, Sev } from '../components/ui'

const REPO = 'https://github.com/Shine-5705/kavach/blob/main/'
type S = 'live' | 'ready' | 'recipe'
const STATUS: Record<S, [string, string]> = { live: ['verified', 'Running in this browser'], ready: ['running', 'Adapter built · needs account'], recipe: ['low', 'Deploy recipe · needs account'] }

function Row({ name, role, status, children, side }: { name: string; role: string; status: S; children: React.ReactNode; side: React.ReactNode }) {
  return <div className="int-row"><div><div className="name">{name}</div><div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{role}</div><div style={{ marginTop: 8 }}><Badge kind={STATUS[status][0]}>{STATUS[status][1]}</Badge></div></div>
    <div>{children}</div><div style={{ fontSize: 12.5 }}>{side}</div></div>
}

export default function Integrations() {
  const eng = useEngine()
  const [a, setA] = useState<any>(null); const [aBusy, setABusy] = useState(false)
  const [txt, setTxt] = useState('Call me on +91 98450 12345 or mail priya.k@example.com. Card 4111 1111 1111 1111.')
  const [r, setR] = useState<any>(null)
  return (
    <div className="page">
      <PageHead title="Integrations" sub="Each sponsor platform sits behind its own adapter. This page says exactly which ones ran in this build and which still need an account." />
      <div className="card int">
        <Row name="Finch" role="Agent skills · Blue's static audit and PII scan" status="live"
          side={<><a href={REPO + 'vendor/finch'} style={{ textDecoration: 'underline' }}>vendor/finch</a> · MIT · FinchTech-AI<br /><span className="muted">Skills are imported and their run() is called in-process, in Pyodide here and in CPython from the CLI.</span></>}>
          <ul><li><b>code-security-audit</b> scans the target's source. Blue confirms or rejects each hit and re-audits its SQL fix (1 confirmed injection → 0).</li>
            <li><b>pii-redactor</b> measures PII in leaked replies during triage, and is the core of the <span className="mono">out.pii</span> output guard. Kavach adds Aadhaar, PAN and UPI detectors, which Finch doesn't cover.</li></ul>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn sm" disabled={eng.stage !== 'ready' || aBusy} onClick={async () => { setABusy(true); setA(await audit()); setABusy(false) }}>{aBusy ? 'Running…' : 'Run code-security-audit on PaisaPal'}</button></div>
          {a?.error && <div className="banner err" style={{ marginTop: 10 }}>{a.error}</div>}
          {a?.result?.ok && <table className="t" style={{ marginTop: 10, border: '1px solid var(--line)' }}><thead><tr><th>Rule</th><th>Line</th><th>Sev</th><th>Blue</th></tr></thead><tbody>
            {a.result.data.findings.map((f: any, i: number) => <tr key={i}><td className="mono">{f.rule_id}</td><td className="mono">{f.path.split('/').pop()}:{f.line}</td><td><Sev s={f.severity} /></td><td className="muted">{f.assessment.replace('_', ' ')}</td></tr>)}
            <tr><td colSpan={4} className="muted">Verdict <b>{a.result.data.verdict}</b> · {a.result.data.summary.files_scanned} files · skill v{a.result.version}</td></tr></tbody></table>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><input className="input" style={{ flex: 1 }} value={txt} onChange={e => setTxt(e.target.value)} />
            <button className="btn sm" style={{ height: 30 }} disabled={eng.stage !== 'ready'} onClick={async () => setR(await redact(txt))}>Run pii-redactor</button></div>
          {r?.result?.ok && <div className="quote mono" style={{ marginTop: 8 }}>{r.result.data.files[0].redacted_content}<div className="faint" style={{ marginTop: 4 }}>verified: {String(r.result.data.files[0].redaction_verified ?? r.result.data.redaction_verified)}</div></div>}
        </Row>
        <Row name="BAND" role="Agent-to-agent transport · rooms, @mention routing" status="ready"
          side={<><a href={REPO + 'engine/kavach/adapters/band.py'} style={{ textDecoration: 'underline' }}>adapters/band.py</a><br /><span className="muted">Tested against a local mock of BAND's documented REST API, not against BAND itself.</span></>}>
          <ul><li>Red and Blue are registered as two BAND remote agents. Blue opens a room and adds Red, plus you if you like.</li>
            <li>Every envelope is posted by its sender with an @mention of the other agent, so the hash-chained log also lives in BAND.</li></ul>
          <pre className="code" style={{ marginTop: 10 }}>{`export BAND_RED_ID=… BAND_RED_KEY=… BAND_BLUE_ID=… BAND_BLUE_KEY=…
python -m kavach band-check
python -m kavach run --band --out engagement.json`}</pre>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Agent keys stay on your machine. This page never asks for them.</p>
        </Row>
        <Row name="Lyzr" role="LLM reasoning · Blue's analyst, optional LLM target" status="ready"
          side={<><a href={REPO + 'engine/kavach/adapters/lyzr.py'} style={{ textDecoration: 'underline' }}>adapters/lyzr.py</a><br /><span className="muted">Not yet run: needs a Lyzr Agent Studio key.</span></>}>
          <ul><li><b>LyzrReasoner</b> writes Blue's triage rationale from the finding JSON. If Lyzr fails, Blue falls back to its template and says so. Defenses never depend on the LLM.</li>
            <li><b>LyzrTarget</b> points Red at an LLM agent hosted on Lyzr instead of the deterministic PaisaPal planner, so the same oracles test a real model.</li></ul>
          <pre className="code" style={{ marginTop: 10 }}>{`export LYZR_API_KEY=… LYZR_BLUE_AGENT_ID=…
python -m kavach run --lyzr`}</pre>
        </Row>
        <Row name="AdaL" role="Agent harness · remediation PR and launch video" status="ready"
          side={<><a href={REPO + 'engine/kavach/adapters/adal.py'} style={{ textDecoration: 'underline' }}>adapters/adal.py</a><br /><span className="muted">Not yet run: needs an AdaL sign-in.</span></>}>
          <ul><li>Runs AdaL headless on an engagement record to draft the remediation pull request: one section per finding, with the attack, the defense and the retest that proved it.</li>
            <li>The demo video plan for AdaL is in <span className="mono">docs/ADAL_VIDEO.md</span>.</li></ul>
          <pre className="code" style={{ marginTop: 10 }}>{`curl -fsSL https://adal.sylph.ai/install.sh | bash && adal   # sign in once
python -m kavach adal-pr engagement.json`}</pre>
        </Row>
        <Row name="Agent37" role="Hosting · always-on Red/Blue sandbox" status="recipe"
          side={<><a href={REPO + 'deploy/agent37.md'} style={{ textDecoration: 'underline' }}>deploy/agent37.md</a><br /><span className="muted">Not deployed: an Agent37 account needs a card on file before its free credit applies.</span></>}>
          <ul><li>A Dockerfile runs the CLI on a schedule inside an isolated Agent37 sandbox, re-attacking the target nightly and keeping engagement records on its persistent disk.</li></ul>
        </Row>
      </div>
    </div>
  )
}
