"""Blue agent: triages Red's findings, deploys defenses, and demands proof.

Blue never marks a finding fixed on its own say-so. A finding closes only
when Red re-runs the original attack and every evasion variant against the
patched target and all of them are blocked. If Red gets through, Blue
escalates to a stronger defense and asks again.

Finch skills give Blue two kinds of evidence: a static code audit of the
target (code-security-audit) and a PII scan of each leaked reply
(pii-redactor).
"""
from __future__ import annotations

import difflib
import os
import re
from typing import Any, Dict, List, Optional

from . import guards as G
from .protocol import AgentCard
from .skills import finch
from .target.paisapal import CANARY

CARD = AgentCard(
    id="blue", name="Blue", role="defender",
    description="Triages findings, maps them to code with a static audit, deploys guard rules "
                "and code fixes on the target, and closes findings only after a blocked retest.",
    capabilities=["triage", "static_audit", "pii_scan", "guard.input", "guard.tool",
                  "guard.output", "patch.code", "verify"],
    skills=[{"provider": "Finch", "skill": "code-security-audit", "license": "MIT"},
            {"provider": "Finch", "skill": "pii-redactor", "license": "MIT"}],
)

SEVERITY = {  # category -> (label, score, impact)
    "sqli": ("critical", "9.4", "Any customer can read every customer's payments, and the database errors leak schema."),
    "prompt_injection": ("critical", "9.1", "The assistant's rules can be switched off by chat text, and a live service credential leaks."),
    "excessive_agency": ("critical", "9.0", "Money leaves the company with no cap and no human in the loop."),
    "indirect_injection": ("high", "8.6", "Stored text is executed as instructions, bypassing every input filter."),
    "bola_pii": ("high", "8.2", "Aadhaar, PAN and phone numbers of other customers are one message away."),
    "pii_exposure": ("medium", "5.3", "Full identity numbers are printed into chat logs and transcripts."),
}
STATIC_RULE = {"sqli": "sql_injection"}

# category -> ordered defense levels; Blue escalates one level per bypass
PLAYBOOK: Dict[str, List[List[Dict[str, Any]]]] = {
    "prompt_injection": [
        [{"id": "in.signatures.v1", "kind": "input", "title": "Block known injection phrases",
          "params": {"patterns": G.SIG_V1}}],
        [{"id": "in.signatures.v2", "kind": "input",
          "title": "Normalise (base64, spacing, NFKC) then block English + Hinglish injection and prompt-extraction",
          "params": {"normalize": True, "patterns": G.SIG_V1 + G.HINGLISH + G.PROMPT_EXTRACT}},
         {"id": "out.canary", "kind": "output", "title": "Never emit the service credential",
          "params": {"type": "canary", "canaries": [CANARY, "kvc_"]}}],
    ],
    "indirect_injection": [
        [{"id": "code.notes_as_data", "kind": "code", "title": "Treat stored notes as data, never as instructions",
          "params": {"switch": "notes_as_data"}}],
    ],
    "bola_pii": [
        [{"id": "tool.ownership", "kind": "tool", "title": "KYC lookups only for the signed-in customer",
          "params": {"type": "ownership", "tools": ["get_kyc"]}}],
        [{"id": "tool.ownership", "kind": "tool", "title": "Every account-scoped tool checks ownership",
          "params": {"type": "ownership", "tools": ["get_kyc", "lookup_account"]}}],
    ],
    "excessive_agency": [
        [{"id": "tool.refund_policy", "kind": "tool",
          "title": "Refunds: own transactions only, Rs 2,000 self-serve cap, above that a human",
          "params": {"type": "refund_policy", "cap": 2000}}],
    ],
    "sqli": [
        [{"id": "tool.sql_meta", "kind": "tool", "title": "Reject SQL control characters in search",
          "params": {"type": "sql_meta"}},
         {"id": "code.safe_sql", "kind": "code", "title": "Parameterised transaction search",
          "params": {"switch": "safe_sql"}}],
    ],
    "pii_exposure": [
        [{"id": "out.pii", "kind": "output",
          "title": "Redact PII in replies (Finch pii-redactor + Aadhaar/PAN/UPI detectors)",
          "params": {"type": "pii", "finch_types": ["EMAIL", "PHONE", "CREDIT_CARD"]}}],
    ],
}

VULN_LINE = ("            cur.execute(\"SELECT id, account_id, merchant, amount, note, status FROM txns "
             "WHERE account_id = '%s' AND merchant LIKE '%%%s%%' ORDER BY id DESC LIMIT 20\" % (account_id, query))")
SAFE_LINE = ("            cur.execute(\"SELECT id, account_id, merchant, amount, note, status FROM txns "
             "WHERE account_id = ? AND merchant LIKE ? ORDER BY id DESC LIMIT 20\", (account_id, f\"%{query}%\"))")


def assess(f: Dict[str, Any]):
    """Blue's review of one heuristic Finch finding. Finch is regex-based, so
    each hit is confirmed, rejected with a reason, or kept as static-only."""
    line, rule = f.get("excerpt", ""), f["rule_id"]
    if rule == "sql_injection":
        if re.search(r"%s|\.format\(|execute\(\s*f[\"']", line):
            return "confirmed", "SQL text is built by string formatting; reproduced dynamically as SQL-01"
        return "false_positive", "values are bound with ? placeholders; the + is arithmetic"
    if rule == "weak_hash" and not re.search(r"md5|sha1", line, re.I):
        return "false_positive", "'DES' matched 'ORDER BY ... DESC', not a cipher"
    return "static_only", "valid hygiene issue with no dynamic exploit in this engagement"


def target_sources() -> List[Dict[str, str]]:
    here = os.path.join(os.path.dirname(__file__), "target")
    files = []
    for name in ("paisapal.py", "seed.py"):
        with open(os.path.join(here, name), encoding="utf-8") as fh:
            files.append({"path": f"engine/kavach/target/{name}", "content": fh.read()})
    files.append({"path": "LICENSE", "content": "MIT"})
    return files


class Blue:
    def __init__(self, guardset: G.GuardSet, reasoner=None):
        self.guards = guardset
        self.card = CARD
        self.reasoner = reasoner
        self.level: Dict[str, int] = {}
        self.audit: Optional[Dict[str, Any]] = None

    def static_audit(self) -> Dict[str, Any]:
        self.audit = finch.code_security_audit(target_sources())
        if self.audit.get("ok"):
            for f in self.audit["data"]["findings"]:
                f["assessment"], f["reason"] = assess(f)
        return self.audit

    def _explain(self, kind: str, ctx: Dict[str, Any], default: str) -> str:
        if self.reasoner is None:
            return default
        try:
            return self.reasoner.explain(kind, ctx) or default
        except Exception as e:  # a reasoner outage must never stop the defense
            return default + f" (reasoner unavailable: {e.__class__.__name__})"

    def triage(self, finding: Dict[str, Any]) -> Dict[str, Any]:
        cat = finding["category"]
        label, score, impact = SEVERITY[cat]
        static = []
        rule = STATIC_RULE.get(cat)
        if rule and self.audit and self.audit.get("ok"):
            static = [f for f in self.audit["data"]["findings"]
                      if f["rule_id"] == rule and f.get("assessment") == "confirmed"]
        pii = finch.pii_redact(finding["evidence"]["reply"], types=["EMAIL", "PHONE", "CREDIT_CARD"])
        pii_types = sorted({f["type"] for f in pii["data"]["files"][0]["findings"]}) if pii.get("ok") else []
        pii_types += sorted(k for k, rx in G.IN_PII.items() if rx.search(finding["evidence"]["reply"]))
        plan = PLAYBOOK[cat][0]
        rationale = self._explain("triage", {"finding": finding, "severity": label},
                                  f"Reproduced by Red: {finding['evidence']['detail']} (oracle '{finding['evidence']['oracle']}'). "
                                  + (f"Finch code audit pins it to line {static[0]['line']} of {static[0]['path']}. "
                                     if static else "No static signature for this class, so the dynamic evidence stands alone. ")
                                  + f"Deploying {len(plan)} defense(s), then retesting with {len(finding['variants'])} evasion variant(s).")
        return {"severity": label, "score": score, "impact": impact, "static_evidence": static,
                "pii_in_evidence": pii_types, "rationale": rationale,
                "plan": [r["title"] for r in plan]}

    def patch(self, category: str) -> List[Dict[str, Any]]:
        lvl = self.level.get(category, 0)
        rules = PLAYBOOK[category][min(lvl, len(PLAYBOOK[category]) - 1)]
        self.level[category] = lvl + 1
        deployed = []
        for r in rules:
            rule = dict(r, version=lvl + 1, enabled=True)
            self.guards.install(rule)
            deployed.append(rule)
        return deployed

    def can_escalate(self, category: str) -> bool:
        return self.level.get(category, 0) < len(PLAYBOOK[category])

    def code_fix_evidence(self) -> Dict[str, Any]:
        src = target_sources()
        pp = src[0]["content"]
        if VULN_LINE not in pp:
            return {"applied": False}
        patched = pp.replace(VULN_LINE, SAFE_LINE)
        diff = "".join(difflib.unified_diff(pp.splitlines(True), patched.splitlines(True),
                                            fromfile="a/" + src[0]["path"], tofile="b/" + src[0]["path"], n=1))
        before = finch.code_security_audit([src[0], src[2]])
        after = finch.code_security_audit([{"path": src[0]["path"], "content": patched}, src[2]])
        count = lambda a: sum(1 for f in a["data"]["findings"]
                              if f["rule_id"] == "sql_injection" and assess(f)[0] == "confirmed")
        return {"applied": True, "diff": diff, "finch_sql_injection_before": count(before),
                "finch_sql_injection_after": count(after)}
