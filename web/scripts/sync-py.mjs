// Copies the Python engine and the vendored Finch skills into public/py so the
// hosted console runs exactly the code in this repository.
import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
const root = new URL('../..', import.meta.url).pathname
const out = join(new URL('..', import.meta.url).pathname, 'public', 'py')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const keep = (p) => !p.includes('__pycache__') && !p.includes('/tests')
cpSync(join(root, 'engine', 'kavach'), join(out, 'engine', 'kavach'), { recursive: true, filter: keep })
cpSync(join(root, 'vendor', 'finch'), join(out, 'vendor', 'finch'), { recursive: true, filter: keep })
const files = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(relative(out, p)) } }
walk(out)
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ files: files.filter(f => f !== 'manifest.json').sort() }, null, 1))
console.log(`synced ${files.length} engine files`)
