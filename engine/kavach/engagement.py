"""Runs one engagement: Red and Blue talking over the A2A ledger.

run() is a generator that yields each message as it is sent, so the console
can render the conversation live while the agents are still working.
"""
from __future__ import annotations

from typing import Any, Dict, Iterator, List, Optional

from . import protocol as P
from .blue import Blue, SEVERITY
from .guards import GuardSet
from .red import ATTACKS, ATTACKER, Red
from .skills import finch
from .target.paisapal import PaisaPal

MAX_ROUNDS = 3


class Engagement:
    def __init__(self, engagement_id: str = "eng-local", categories: Optional[List[str]] = None,
                 transport=None, reasoner=None, clock=None):
        self.id = engagement_id
        self.attacks = [a for a in ATTACKS if not categories or a["category"] in categories]
        self.guards = GuardSet()
        self.ledger = P.Ledger(engagement_id, clock=clock)
        if transport is not None:
            self.ledger.subscribe(transport.publish)
        self.red = Red(self.make_target)
        self.blue = Blue(self.guards, reasoner=reasoner)
        self.findings: List[Dict[str, Any]] = []
        self.metrics: Dict[str, Any] = {}

    def make_target(self) -> PaisaPal:
        t = PaisaPal(self.guards)
        for r in self.guards.of("code"):
            setattr(t, r["params"]["switch"], True)
        return t

    def _send(self, sender, to, mtype, body, thread=None, summary=""):
        return self.ledger.send(sender, to, mtype, body, thread=thread, summary=summary)

    def _sweep(self) -> Dict[str, Any]:
        total = hits = 0
        rows = []
        for a in self.attacks:
            for v in [{"id": a["id"], "steps": a["steps"], "technique": "original"}] + a["variants"]:
                r = self.red.execute(v["steps"], a["oracle"])
                total += 1
                hits += bool(r["success"])
                rows.append({"attack": a["id"], "variant": v["id"], "success": r["success"]})
        return {"total": total, "succeeded": hits, "rows": rows}

    def run(self) -> Iterator[Dict[str, Any]]:
        red, blue = self.red, self.blue
        yield self._send("red", "blue", P.HELLO, red.card.to_dict(), summary="Red joins: attacker agent card")
        yield self._send("blue", "red", P.HELLO, blue.card.to_dict(), summary="Blue joins: defender agent card")
        yield self._send("blue", "red", P.SCOPE, {
            "target": "PaisaPal Support (sandbox)", "identity": ATTACKER,
            "in_scope": ["chat", "get_kyc", "lookup_account", "search_transactions", "issue_refund", "add_dispute_note"],
            "categories": sorted({a["category"] for a in self.attacks}),
            "rules": ["sandbox instance only; synthetic customers", "no network egress",
                      "fresh target per attack", "report evidence, never exfiltrate"],
        }, summary="Rules of engagement: sandbox target, synthetic data, 6 tools in scope")
        yield self._send("red", "blue", P.SCOPE_ACK, {"accepted": True, "attacks_planned": len(self.attacks),
                                                       "variants_planned": sum(len(a["variants"]) for a in self.attacks)},
                         summary=f"Scope accepted: {len(self.attacks)} attack families queued")

        audit = blue.static_audit()
        baseline = self._sweep()
        util_before = red.utility()
        self.metrics.update(baseline_attack_success=baseline, utility_before=util_before["passed"],
                            utility_total=util_before["total"],
                            static_audit={"verdict": audit["data"]["verdict"], "summary": audit["data"]["summary"],
                                          "findings": audit["data"]["findings"]} if audit.get("ok") else None)

        # Round 0: Red attacks the unguarded target and reports what works.
        for a in self.attacks:
            ev = red.execute(a["steps"], a["oracle"])
            if not ev["success"]:
                continue
            f = {"id": a["id"], "title": a["title"], "category": a["category"], "owasp": a["owasp"],
                 "steps": a["steps"], "variants": [v["id"] for v in a["variants"]], "evidence": ev,
                 "status": "open", "rounds": 0, "severity": SEVERITY[a["category"]][0]}
            self.findings.append(f)
            yield self._send("red", "blue", P.FINDING, f, thread=a["id"], summary=f"{a['id']}: {ev['detail']}")

        order = sorted(self.findings, key=lambda f: -float(SEVERITY[f["category"]][1]))
        for f in order:
            a = next(x for x in self.attacks if x["id"] == f["id"])
            tri = blue.triage(f)
            f["triage"] = tri
            yield self._send("blue", "red", P.TRIAGE, tri, thread=f["id"],
                             summary=f"{f['id']} triaged {tri['severity']} ({tri['score']})")
            for rnd in range(1, MAX_ROUNDS + 1):
                deployed = blue.patch(f["category"])
                body = {"rules": deployed}
                if any(r["id"] == "code.safe_sql" for r in deployed):
                    body["code_fix"] = blue.code_fix_evidence()
                f.setdefault("patches", []).extend(r["id"] for r in deployed)
                yield self._send("blue", "red", P.PATCH, body, thread=f["id"],
                                 summary=f"Deployed {', '.join(r['id'] for r in deployed)}")
                variants = [{"id": a["id"], "steps": a["steps"], "technique": "original"}] + a["variants"]
                yield self._send("blue", "red", P.RETEST, {"round": rnd, "variants": [v["id"] for v in variants]},
                                 thread=f["id"], summary=f"Retest {f['id']}: original + {len(a['variants'])} variants")
                results = []
                for v in variants:
                    r = red.execute(v["steps"], a["oracle"])
                    results.append({"variant": v["id"], "technique": v["technique"],
                                    "outcome": "bypassed" if r["success"] else "blocked",
                                    "detail": r["detail"], "blocked_by": r["blocked_by"], "reply": r["reply"][:240]})
                bypassed = [x for x in results if x["outcome"] == "bypassed"]
                f["rounds"] = rnd
                yield self._send("red", "blue", P.RESULT, {"round": rnd, "results": results}, thread=f["id"],
                                 summary=(f"{len(bypassed)} of {len(results)} variants still get through"
                                          if bypassed else f"All {len(results)} variants blocked"))
                if not bypassed:
                    f["status"] = "verified"
                    yield self._send("blue", "red", P.VERIFIED, {"rounds": rnd, "rules": f["patches"]},
                                     thread=f["id"], summary=f"{f['id']} closed after {rnd} round(s), proven by retest")
                    break
                if not blue.can_escalate(f["category"]):
                    f["status"] = "open"
                    break

        final = self._sweep()
        util = red.utility()
        yield self._send("red", "blue", P.UTILITY, util,
                         summary=f"Benign traffic after patching: {util['passed']}/{util['total']} requests still work")
        self.metrics.update(final_attack_success=final, utility_after=util["passed"])
        chain = P.verify_chain(self.ledger.messages)
        report = {
            "findings": len(self.findings),
            "verified": sum(f["status"] == "verified" for f in self.findings),
            "attack_success_before": f"{baseline['succeeded']}/{baseline['total']}",
            "attack_success_after": f"{final['succeeded']}/{final['total']}",
            "utility_before": f"{util_before['passed']}/{util_before['total']}",
            "utility_after": f"{util['passed']}/{util['total']}",
            "rules": [dict(r) for r in self.guards.rules],
            "static_review": [{"rule_id": x["rule_id"], "line": x["line"], "severity": x["severity"],
                               "assessment": x["assessment"], "reason": x["reason"]}
                              for x in (self.metrics.get("static_audit") or {}).get("findings", [])],
            "finch_calls": len(finch.calls),
            "chain_head": chain.get("head"),
        }
        yield self._send("blue", "red", P.REPORT, report,
                         summary=f"Attacks landing: {report['attack_success_before']} before, "
                                 f"{report['attack_success_after']} after; utility {report['utility_after']}")

    def record(self) -> Dict[str, Any]:
        return {"id": self.id, "protocol": P.PROTOCOL, "messages": self.ledger.messages,
                "findings": self.findings, "metrics": self.metrics,
                "rules": self.guards.rules, "chain": P.verify_chain(self.ledger.messages)}


def run_all(**kw) -> Dict[str, Any]:
    e = Engagement(**kw)
    for _ in e.run():
        pass
    return e.record()
