import { useEffect, useState, type ReactNode } from 'react'
import { verifyChain, type ChainCheck } from '../lib/verify'
import type { Envelope } from '../lib/types'

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Kavach">
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#17171a" />
      <path d="M7 5.5v13" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17 6l-6 6 6 6" stroke="#e0705f" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 12h3" stroke="#7d9cf0" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export const Badge = ({ kind = '', children }: { kind?: string; children: ReactNode }) => <span className={'badge ' + kind}>{children}</span>
export const Sev = ({ s }: { s: string }) => <Badge kind={s}>{s[0].toUpperCase() + s.slice(1)}</Badge>
export const Status = ({ s }: { s: string }) => <Badge kind={s}>{s === 'verified' ? 'Verified fixed' : s === 'open' ? 'Open' : s}</Badge>
export const Agent = ({ who }: { who: 'red' | 'blue' }) => <span className={'agent ' + who}><i />{who === 'red' ? 'Red' : 'Blue'}</span>
export const Type = ({ t }: { t: string }) => <span className="type">{t}</span>

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><h2>{title}</h2>{children && <p>{children}</p>}{action}</div>
}
export function Stat({ k, v, s }: { k: string; v: ReactNode; s?: ReactNode }) {
  return <div className="stat"><div className="k">{k}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>
}
export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}</div>
}
export function Diff({ text }: { text: string }) {
  return <pre className="code diff">{text.split('\n').map((l, i) => {
    const c = l.startsWith('@@') ? 'hunk' : l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : ''
    return <span key={i} className={c}>{l || ' '}{'\n'}</span>
  })}</pre>
}
export function useChain(msgs: Envelope[] | undefined) {
  const [c, setC] = useState<ChainCheck | null>(null)
  useEffect(() => { let on = true; setC(null); if (msgs?.length) verifyChain(msgs).then(r => on && setC(r)); return () => { on = false } }, [msgs])
  return c
}
export function ChainBadge({ msgs }: { msgs: Envelope[] }) {
  const c = useChain(msgs)
  if (!c) return <Badge kind="running">Verifying chain…</Badge>
  return c.ok ? <Badge kind="verified">Chain verified · {c.count} msgs</Badge> : <Badge kind="open">Chain broken at #{c.brokenAt}</Badge>
}
export const fmtTime = (ts?: number) => ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
export const short = (h?: string, n = 10) => h ? h.slice(0, n) : ''
export const pct = (a: number, b: number) => b ? Math.round((a / b) * 100) : 0
export const CATEGORY: Record<string, string> = {
  prompt_injection: 'Prompt injection', indirect_injection: 'Indirect injection', bola_pii: 'Broken authorisation',
  excessive_agency: 'Excessive agency', sqli: 'SQL injection', pii_exposure: 'PII exposure',
}
export const KIND: Record<string, string> = { input: 'Pre-input', tool: 'Pre-tool', output: 'Post-output', code: 'Code fix' }
