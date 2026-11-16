import { useEffect } from 'react'
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Landing from './pages/Landing'
import { Logo } from './components/ui'
import { startEngine, useEngine, restartEngine } from './lib/engine'
import { useEngagements, useLive } from './lib/store'
import Overview from './pages/Overview'
import Engagements from './pages/Engagements'
import EngagementDetail from './pages/EngagementDetail'
import Findings from './pages/Findings'
import FindingDetail from './pages/FindingDetail'
import Defenses from './pages/Defenses'
import Sandbox from './pages/Sandbox'
import Integrations from './pages/Integrations'
import Protocol from './pages/Protocol'

const NAV = [
  ['/console', 'Overview'], ['/console/engagements', 'Engagements'], ['/console/findings', 'Findings'], ['/console/defenses', 'Defenses'],
  ['/console/sandbox', 'Target sandbox'], ['/console/integrations', 'Integrations'], ['/console/protocol', 'A2A protocol'],
] as const

function EngineStatus() {
  const s = useEngine()
  if (s.stage === 'ready') return <div className="engine"><span className="dot ok" /><div>Engine ready<br /><span className="faint">Python {s.python} · Finch skills loaded</span></div></div>
  if (s.stage === 'error') return <div className="engine"><span className="dot err" /><div>Engine failed to load. <button className="btn sm" style={{ marginTop: 6 }} onClick={restartEngine}>Retry</button></div></div>
  return <div className="engine"><span className="dot busy" /><div>{s.text}…<br /><span className="faint">First load fetches ~12 MB</span></div></div>
}

function Crumbs() {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean).slice(1)
  const top = NAV.find(n => n[0] === '/console' + (parts[0] ? '/' + parts[0] : ''))?.[1] || 'Overview'
  return <div className="crumbs"><span>PaisaPal Support</span><span className="faint">/</span><b>{top}</b>{parts[1] && <><span className="faint">/</span><span className="mono">{decodeURIComponent(parts[1])}</span></>}</div>
}

function Shell() {
  const list = useEngagements()
  const live = useLive()
  const openCount = list[0]?.findings.filter(f => f.status !== 'verified').length
  useEffect(() => { window.scrollTo(0, 0) }, [useLocation().pathname])
  return (
    <div className="shell">
      <aside className="side">
        <Link to="/" className="brand"><Logo /><div>Kavach<small>Red and Blue agents for AI apps</small></div></Link>
        <div className="nav-label">Workspace</div>
        <nav className="nav">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/console'}>{label}
              {to === '/console/engagements' && <span className="count">{live && !live.done ? 'live' : list.length || ''}</span>}
              {to === '/console/findings' && openCount ? <span className="count">{openCount} open</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <EngineStatus />
          <div className="faint">Target: PaisaPal sandbox, a deliberately vulnerable demo agent with synthetic customers.</div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar"><Crumbs /><div className="spacer" /><a className="btn sm ghost hide-sm" href="https://github.com/Shine-5705/kavach" target="_blank" rel="noreferrer">GitHub</a></header>
        <nav className="mobile-nav">{NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === '/console'}>{label}</NavLink>)}</nav>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="engagements" element={<Engagements />} />
          <Route path="engagements/:id" element={<EngagementDetail />} />
          <Route path="findings" element={<Findings />} />
          <Route path="findings/:fid" element={<FindingDetail />} />
          <Route path="defenses" element={<Defenses />} />
          <Route path="sandbox" element={<Sandbox />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="protocol" element={<Protocol />} />
          <Route path="*" element={<div className="page"><h1>Not found</h1></div>} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  useEffect(() => { startEngine() }, [])
  return <HashRouter><Routes><Route path="/" element={<Landing />} /><Route path="/console/*" element={<Shell />} /><Route path="*" element={<Landing />} /></Routes></HashRouter>
}
