export type Envelope = {
  protocol: string; engagement: string; seq: number; id: string; ts: number
  from: 'red' | 'blue'; to: 'red' | 'blue'; type: string; thread: string | null
  summary: string; body: any; prev: string; hash: string
}
export type Rule = { id: string; kind: 'input' | 'tool' | 'output' | 'code'; title: string; params: any; version: number; enabled: boolean }
export type Finding = {
  id: string; title: string; category: string; owasp: string; steps: string[]; variants: string[]
  evidence: { success: boolean; oracle: string; detail: string; reply: string; tool_calls: any[]; blocked_by: any[]; followed_directives: any[] }
  status: 'open' | 'verified'; rounds: number; severity: string; triage?: any; patches?: string[]
}
export type EngagementRecord = {
  id: string; protocol: string; messages: Envelope[]; findings: Finding[]; metrics: any; rules: Rule[]
  chain: { ok: boolean; count?: number; head?: string; broken_at?: number }
  createdAt?: number; source?: 'browser' | 'import'; transport?: any; reasoner?: string
}
export type Trace = { user: string; input: string; reply: string; raw_reply?: string; tool_calls: any[]; blocked_by: any[]; followed_directives: any[]; decoded?: string; mode?: string }
export type Catalog = { attacks: any[]; utility: any[]; attacker: string; version: string }
