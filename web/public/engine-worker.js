/* Kavach engine worker: runs the real Python engine (engine/kavach) and the
   vendored Finch skills inside Pyodide, off the main thread. */
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'
let py = null
let ready = null

async function boot(base) {
  importScripts(PYODIDE + 'pyodide.js')
  post({ type: 'status', stage: 'runtime', text: 'Loading Python runtime' })
  py = await loadPyodide({ indexURL: PYODIDE })
  post({ type: 'status', stage: 'sqlite', text: 'Loading sqlite3' })
  await py.loadPackage('sqlite3')
  post({ type: 'status', stage: 'engine', text: 'Loading Kavach engine and Finch skills' })
  const manifest = await (await fetch(base + 'py/manifest.json', { cache: 'no-store' })).json()
  for (const f of manifest.files) {
    const src = await (await fetch(base + 'py/' + f, { cache: 'no-store' })).text()
    const path = '/home/pyodide/' + f
    py.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')))
    py.FS.writeFile(path, src)
  }
  py.runPython(`
import sys, json
sys.path.insert(0, '/home/pyodide/engine')
from kavach import __version__
from kavach import protocol as P
from kavach.engagement import Engagement
from kavach.guards import GuardSet
from kavach.target.paisapal import PaisaPal
from kavach.red import ATTACKS, UTILITY, ATTACKER, Red
from kavach.skills import finch
from kavach.blue import target_sources, assess
finch.set_root('/home/pyodide/vendor/finch')
_runs = {}
def k_start(eid, cats):
    cats = json.loads(cats) or None
    e = Engagement(eid, categories=cats)
    _runs[eid] = (e, e.run())
def k_step(eid):
    e, gen = _runs[eid]
    try:
        return json.dumps(next(gen))
    except StopIteration:
        rec = e.record(); del _runs[eid]
        return json.dumps({"__done__": rec})
_sandboxes = {}
def k_chat(sid, rules, user, message):
    if sid not in _sandboxes:
        g = GuardSet()
        t = PaisaPal(g)
        for r in json.loads(rules):
            g.install(r, t)
        _sandboxes[sid] = t
    t = _sandboxes[sid]
    tr = t.respond(user, message)
    tr["refunds"] = t.refunds()
    tr["balance"] = t.customer(user)["balance"]
    return json.dumps(tr)
def k_audit():
    out = finch.code_security_audit(target_sources())
    if out.get("ok"):
        for f in out["data"]["findings"]:
            f["assessment"], f["reason"] = assess(f)
    return json.dumps(out)
def k_redact(text):
    return json.dumps(finch.pii_redact(text))
def _target_with(rules):
    g = GuardSet()
    for r in rules:
        g.install(r)
    def make():
        t = PaisaPal(g)
        for r in g.of("code"):
            setattr(t, r["params"]["switch"], True)
        return t
    return make
def k_variants():
    out = []
    for a in ATTACKS:
        for v in [{"id": a["id"], "steps": a["steps"], "technique": "original"}] + a["variants"]:
            out.append({"attack": a["id"], "variant": v["id"], "technique": v["technique"], "steps": v["steps"],
                        "oracle": a["oracle"], "title": a["title"], "category": a["category"], "owasp": a["owasp"]})
    return json.dumps(out)
def k_attack(idx, rules):
    v = json.loads(k_variants())[idx]
    r = Red(_target_with(json.loads(rules))).execute(v["steps"], v["oracle"])
    r["tool_calls"] = [{k: c.get(k) for k in ("tool", "args", "allowed", "denied_by")} for c in r["tool_calls"]]
    return json.dumps(dict(v, **r))
def k_utility(rules):
    return json.dumps(Red(_target_with(json.loads(rules))).utility())
def k_compare(message, rules):
    out = {}
    for name, rs in (("unguarded", []), ("guarded", json.loads(rules))):
        t = _target_with(rs)()
        tr = t.respond(ATTACKER, message)
        tr["tool_calls"] = [{k: c.get(k) for k in ("tool", "args", "allowed", "denied_by")} for c in tr["tool_calls"]]
        tr["refunds"] = t.refunds()
        out[name] = tr
    return json.dumps(out)
def k_catalog():
    return json.dumps({"attacks": ATTACKS, "utility": UTILITY, "attacker": ATTACKER, "version": __version__})
`)
  const info = JSON.parse(py.runPython('k_catalog()'))
  post({ type: 'ready', python: py.runPython('import sys; sys.version.split()[0]'), files: manifest.files.length, catalog: info })
}

function post(m) { self.postMessage(m) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

self.onmessage = async (ev) => {
  const m = ev.data
  try {
    if (m.type === 'init') { ready = ready || boot(m.base); await ready; return }
    await ready
    if (m.type === 'run') {
      py.globals.get('k_start')(m.id, JSON.stringify(m.categories || []))
      for (;;) {
        const out = JSON.parse(py.globals.get('k_step')(m.id))
        if (out.__done__) { post({ type: 'done', id: m.id, record: out.__done__ }); break }
        post({ type: 'message', id: m.id, message: out })
        if (m.pace) await sleep(m.pace)
      }
    } else if (m.type === 'chat') {
      post({ type: 'chat', req: m.req, trace: JSON.parse(py.globals.get('k_chat')(m.sid, JSON.stringify(m.rules || []), m.user, m.message)) })
    } else if (m.type === 'variants') {
      post({ type: 'variants', req: m.req, result: JSON.parse(py.globals.get('k_variants')()) })
    } else if (m.type === 'attack') {
      post({ type: 'attack', req: m.req, result: JSON.parse(py.globals.get('k_attack')(m.idx, JSON.stringify(m.rules || []))) })
    } else if (m.type === 'utility') {
      post({ type: 'utility', req: m.req, result: JSON.parse(py.globals.get('k_utility')(JSON.stringify(m.rules || []))) })
    } else if (m.type === 'compare') {
      post({ type: 'compare', req: m.req, result: JSON.parse(py.globals.get('k_compare')(m.message, JSON.stringify(m.rules || []))) })
    } else if (m.type === 'audit') {
      post({ type: 'audit', req: m.req, result: JSON.parse(py.globals.get('k_audit')()) })
    } else if (m.type === 'redact') {
      post({ type: 'redact', req: m.req, result: JSON.parse(py.globals.get('k_redact')(m.text)) })
    }
  } catch (err) {
    post({ type: 'error', req: m.req, id: m.id, error: String(err && err.message || err).slice(-1200) })
  }
}
