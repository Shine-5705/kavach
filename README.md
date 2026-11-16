# Kavach

**Two agents that harden AI assistants. A fix only counts once the attack fails again.**

Kavach puts a **Red agent** and a **Blue agent** on opposite sides of an AI
support assistant. Red attacks it the way a real customer could: prompt
injection, instructions hidden in stored notes, reading other customers' KYC,
uncapped refunds, SQL injection, PII in replies. Blue triages each proven
finding, deploys guards and code fixes, and asks Red to retest. Red reruns the
original attack **and every evasion variant**. Any bypass sends Blue up its
playbook. Every message between the two agents is a typed envelope in a
SHA-256 hash chain that anyone can re-verify.

**Live console:** https://shine-5705.github.io/kavach/ (the whole engine
runs in your browser tab with Pyodide; no backend, no keys)

Built for *Diwali Festiverse: The Agent-to-Agent Hackathon (India Edition)*,
Security · Attack & Defend track, by Shine Gupta (team TheAdaply).

![Engagement timeline](docs/img/02-engagement.png)

## What a run proves

From a full engagement against PaisaPal (`python -m kavach run`):

| | Before Blue | After Blue |
|---|---|---|
| Attacks landing (original plus evasion variants) | **15 / 15** | **0 / 15** |
| Benign customer requests served | 6 / 6 | **6 / 6** |
| Findings verified fixed by retest | | **6 / 6** |
| A2A messages, hash chain verified | | 48 |

Two findings needed a second round, and that is the point:

- **PI-01, prompt injection.** Blue's first patch (signature list) blocked the
  plain and Hinglish attacks. Red's **base64** and **debug-ticket** variants still
  leaked the credential, so Blue escalated to normalised signatures plus an
  output canary filter. Round 2 blocked all four.
- **BOLA-01, cross-account KYC.** Blue guarded `get_kyc`. Red pulled the same
  Aadhaar/PAN through `lookup_account`, so Blue extended the ownership guard.

The SQL injection fix is a real code diff. Blue re-runs Finch's
`code-security-audit` on the patched source: confirmed injections go **1 → 0**.
Blue also marks Finch's heuristic hits it can rule out (for example `DES`
matching `ORDER BY … DESC`) as false positives instead of padding the report.

## Architecture

![Architecture](docs/img/architecture.png)

- `engine/kavach/protocol.py`: the `kavach.a2a/0.1` envelope, canonical
  JSON, hash chain, agent cards.
- `engine/kavach/target/`: **PaisaPal**, a deliberately vulnerable UPI-wallet
  support agent with real sqlite3 data and synthetic customers.
- `engine/kavach/red.py`: attacks mapped to the OWASP LLM Top 10, evasion
  variants, and oracles that check evidence (leaked canary, another customer's
  PII, refund over policy, cross-tenant rows), never the reply's tone.
- `engine/kavach/blue.py`: severity, Finch-assisted triage, playbook with
  escalation levels, Finch false-positive assessment, verified code fixes.
- `engine/kavach/guards.py`: input, tool, output and code-switch guards,
  including Hinglish and base64 normalisation and Indian PII (Aadhaar, PAN, UPI).
- `engine/kavach/engagement.py`: the loop, streamed message by message.
- `engine/kavach/adapters/`: BAND transport, Lyzr reasoner and target, AdaL
  harness.
- `web/`: React console (Vite). `public/engine-worker.js` loads Pyodide in a
  Web Worker and streams envelopes into the UI, which re-checks the chain
  with WebCrypto.

## Console

| Page | What it does |
|---|---|
| Overview | Attack success before and after, Finch static review with Blue's verdicts |
| Engagements | Start a run (pick attack families, watch live or fast), import or export signed records |
| Engagement detail | The full A2A timeline, filter by thread or type, open any signed envelope |
| Findings / Finding detail | Proof of exploit, retest matrix by round, triage, the conversation |
| Defenses | Every rule Blue deployed, where it is enforced and what it blocked |
| Target sandbox | Chat with PaisaPal yourself, toggle Blue's defenses on and off |
| Integrations | Run Finch live in the browser, adapter status for each sponsor |
| A2A protocol | The message types and the canonical hashing rule |

![Sandbox](docs/img/08-sandbox.png)

## Sponsor integrations, honestly

| Platform | How Kavach uses it | Status |
|---|---|---|
| **Finch** | `code-security-audit` and `pii-redactor` skills vendored (MIT) and called in-process by Blue: static triage, false-positive review, re-audit of code fixes, PII measurement and the output PII guard | **Runs** in every engagement (30 calls per run), in CPython and in the browser |
| **BAND** | Red and Blue as two BAND remote agents; Blue opens a room and each envelope is posted with an @mention of the other agent (`--band`) | Adapter built and tested against a local mock of BAND's REST API. Needs a BAND account and two agent keys to run live |
| **Lyzr** | `LyzrReasoner` writes Blue's triage rationale; `LyzrTarget` swaps PaisaPal for an LLM agent on Lyzr so the same oracles test a real model (`--lyzr`) | Adapter built, needs a Lyzr Studio API key |
| **AdaL** | Headless AdaL drafts the remediation PR from an engagement record (`adal-pr`); brief for the demo film in `docs/ADAL_VIDEO.md` | Adapter built, needs an AdaL sign-in |
| **Agent37** | Dockerfile for an always-on sandbox that re-attacks nightly and keeps records on its persistent disk (`deploy/agent37.md`) | Recipe only, not deployed |

Without keys, everything runs offline and the console says so. Defenses never
depend on an LLM.

## Run it

```bash
# engine (Python 3.10+, no dependencies)
cd engine
python -m kavach run --out engagement.json      # full engagement, prints the timeline
python -m kavach verify engagement.json         # re-check the hash chain
python -m unittest discover -s tests            # 8 tests

# console
cd web && npm install && node scripts/sync-py.mjs && npm run dev
```

Optional live adapters:

```bash
export BAND_RED_ID=… BAND_RED_KEY=… BAND_BLUE_ID=… BAND_BLUE_KEY=…
python -m kavach band-check && python -m kavach run --band
export LYZR_API_KEY=… LYZR_BLUE_AGENT_ID=… [LYZR_TARGET_AGENT_ID=…]
python -m kavach run --lyzr
python -m kavach adal-pr engagement.json        # needs `adal` signed in
```

## Scope and safety

PaisaPal is a sandbox with synthetic customers; the IDs are shaped like
Aadhaar, PAN and UPI handles but are not real. Red only attacks targets
declared in the SCOPE message. Kavach is a hardening harness for systems you
own, not a scanner for other people's apps.

## License

MIT © 2026 Shine Gupta. Finch skills © FinchTech-AI, MIT (see `vendor/finch`).
