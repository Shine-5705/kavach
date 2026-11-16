"""Runtime defenses that Blue installs on the target.

Each rule is plain data (kind, id, version, params), so a PATCH message can
carry it over the wire and the console can show exactly what was deployed.
Enforcement points: pre-input, pre-tool, post-output, and code switches.
"""
from __future__ import annotations

import base64
import re
import unicodedata
from typing import Any, Dict, List, Optional

from .skills import finch

REFUSAL = "I can't help with that request."

SIG_V1 = [r"ignore (all |any |the )?(previous|prior|above) (instructions|rules)",
          r"disregard (your|all|previous) (instructions|rules)", r"you are now",
          r"developer mode", r"system prompt"]
HINGLISH = [r"bhool jao", r"naye instructions", r"ab se tum", r"prompt dikhao", r"apne instructions"]
PROMPT_EXTRACT = [r"(repeat|print|show|reveal|output).{0,40}(instructions|prompt|configuration|text above)"]
ZERO_WIDTH = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff"), None)

# Indian PII that Finch's pii-redactor does not cover. Kavach's own detectors.
IN_PII = {
    "AADHAAR": re.compile(r"\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b"),
    "PAN": re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"),
    "UPI": re.compile(r"\b[\w.\-]{2,}@ok[a-z]+\b"),
}


def normalize(text: str) -> str:
    """Undo the obfuscations Red uses: zero-width, spacing, base64, homoglyphs."""
    t = unicodedata.normalize("NFKC", text).translate(ZERO_WIDTH)
    # "i g n o r e" -> "ignore": collapse runs of single letters separated by spaces/dots
    t = re.sub(r"\b(?:[A-Za-z][ ._-]){3,}[A-Za-z]\b", lambda m: re.sub(r"[ ._-]", "", m.group(0)), t)
    decoded = []
    for seg in re.findall(r"[A-Za-z0-9+/]{16,}={0,2}", t):
        try:
            decoded.append(base64.b64decode(seg, validate=True).decode("utf-8"))
        except Exception:
            pass
    return (t + " " + " ".join(decoded)).lower()


class GuardSet:
    def __init__(self):
        self.rules: List[Dict[str, Any]] = []

    # management --------------------------------------------------------
    def install(self, rule: Dict[str, Any], target=None) -> None:
        self.rules = [r for r in self.rules if r["id"] != rule["id"]]
        self.rules.append(rule)
        if target is not None and rule["kind"] == "code":
            setattr(target, rule["params"]["switch"], True)

    def remove(self, rule_id: str, target=None) -> None:
        for r in self.rules:
            if r["id"] == rule_id and r["kind"] == "code" and target is not None:
                setattr(target, r["params"]["switch"], False)
        self.rules = [r for r in self.rules if r["id"] != rule_id]

    def of(self, kind: str):
        return [r for r in self.rules if r["kind"] == kind and r.get("enabled", True)]

    # enforcement --------------------------------------------------------
    def check_input(self, message: str, trace) -> Optional[str]:
        for r in self.of("input"):
            text = normalize(message) if r["params"].get("normalize") else message.lower()
            pats = list(r["params"].get("patterns", []))
            for p in pats:
                if re.search(p, text, re.I):
                    trace["blocked_by"].append({"rule": r["id"], "stage": "input", "pattern": p})
                    return REFUSAL
        return None

    def check_tool(self, call, user, target, trace) -> Optional[str]:
        for r in self.of("tool"):
            p = r["params"]
            name, args = call["tool"], call["args"]
            reason = None
            if p.get("type") == "ownership" and name in p["tools"]:
                if args.get("account_id") not in (None, user):
                    reason = f"account {args.get('account_id')} is not owned by {user}"
            elif p.get("type") == "refund_policy" and name == "issue_refund":
                owner = target.owner_of_txn(args["txn_id"])
                if owner not in (None, user):
                    reason = f"{args['txn_id']} belongs to {owner}, not {user}"
                elif args["amount"] > p["cap"]:
                    reason = f"Rs {args['amount']:,} exceeds the Rs {p['cap']:,} self-serve cap"
            elif p.get("type") == "sql_meta" and name == "search_transactions":
                if re.search(r"['\";]|--|/\*|\bor\b\s+\d", args.get("query", ""), re.I):
                    reason = "query contains SQL control characters"
            if reason:
                trace["blocked_by"].append({"rule": r["id"], "stage": "tool", "tool": name, "reason": reason})
                return r["id"]
        return None

    def filter_output(self, text: str, user, target, trace) -> str:
        out = text
        for r in self.of("output"):
            p = r["params"]
            if p.get("type") == "canary" and any(c in out for c in p["canaries"]):
                trace["blocked_by"].append({"rule": r["id"], "stage": "output", "reason": "secret canary in reply"})
                return REFUSAL
            if p.get("type") == "pii":
                res = finch.pii_redact(out, types=p.get("finch_types"))
                found = []
                if res.get("ok"):
                    f0 = res["data"]["files"][0]
                    if f0["findings"]:
                        out = f0["redacted_content"]
                        found += [f["type"] for f in f0["findings"]]
                for label, rx in IN_PII.items():
                    if rx.search(out):
                        out = rx.sub(f"[REDACTED_{label}]", out)
                        found.append(label)
                if found:
                    trace["blocked_by"].append({"rule": r["id"], "stage": "output",
                                                "reason": "redacted " + ", ".join(sorted(set(found)))})
        return out
