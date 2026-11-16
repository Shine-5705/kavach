"""Kavach A2A protocol: typed, hash-chained envelopes exchanged by agents.

Every message carries the SHA-256 of the previous message, so the whole
engagement log is tamper-evident: editing or dropping any message breaks
every hash after it. The hosted console re-verifies the chain in the
browser with WebCrypto, independently of this code.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

PROTOCOL = "kavach.a2a/0.1"
GENESIS = "0" * 64

# Message types, in the order an engagement normally uses them.
HELLO = "HELLO"            # agent card exchange: identity + capabilities
SCOPE = "SCOPE"            # Blue -> Red: rules of engagement (what may be attacked)
SCOPE_ACK = "SCOPE_ACK"    # Red -> Blue: accepts the scope
FINDING = "FINDING"        # Red -> Blue: a reproduced vulnerability with evidence
TRIAGE = "TRIAGE"          # Blue -> Red: severity, static evidence, plan
PATCH = "PATCH"            # Blue -> Red: a defense applied to the target
RETEST = "RETEST"          # Blue -> Red: please re-attack, including variants
RESULT = "RESULT"          # Red -> Blue: blocked or bypassed, per variant
VERIFIED = "VERIFIED"      # Blue -> Red: finding closed, proven by retest
UTILITY = "UTILITY"        # Red -> Blue: benign-traffic check after patching
REPORT = "REPORT"          # Blue -> all: final posture report

TYPES = [HELLO, SCOPE, SCOPE_ACK, FINDING, TRIAGE, PATCH, RETEST, RESULT,
         VERIFIED, UTILITY, REPORT]


def canonical(obj: Any) -> str:
    """Deterministic JSON. Mirrored exactly by the console's verifier."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(env: Dict[str, Any]) -> str:
    body = {k: v for k, v in env.items() if k != "hash"}
    return hashlib.sha256(canonical(body).encode("utf-8")).hexdigest()


@dataclass
class AgentCard:
    id: str
    name: str
    role: str
    description: str
    capabilities: List[str]
    skills: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {"id": self.id, "name": self.name, "role": self.role,
                "description": self.description,
                "capabilities": list(self.capabilities),
                "skills": list(self.skills), "protocol": PROTOCOL}


class Ledger:
    """Append-only, hash-chained message log shared by both agents."""

    def __init__(self, engagement_id: str, clock=None):
        self.engagement_id = engagement_id
        self.messages: List[Dict[str, Any]] = []
        self._clock = clock or _LogicalClock()
        self._subscribers = []

    def subscribe(self, fn) -> None:
        self._subscribers.append(fn)

    def send(self, sender: str, to: str, mtype: str, body: Dict[str, Any],
             thread: Optional[str] = None, summary: str = "") -> Dict[str, Any]:
        if mtype not in TYPES:
            raise ValueError(f"unknown message type {mtype}")
        body = json.loads(canonical(body))  # freeze: later edits must not alter a sent message
        seq = len(self.messages) + 1
        env = {
            "protocol": PROTOCOL,
            "engagement": self.engagement_id,
            "seq": seq,
            "id": f"{self.engagement_id}-m{seq:03d}",
            "ts": self._clock.now(),
            "from": sender,
            "to": to,
            "type": mtype,
            "thread": thread,
            "summary": summary,
            "body": body,
            "prev": self.messages[-1]["hash"] if self.messages else GENESIS,
        }
        env["hash"] = digest(env)
        self.messages.append(env)
        for fn in self._subscribers:
            fn(env)
        return env


def verify_chain(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    prev = GENESIS
    for i, env in enumerate(messages):
        if env.get("prev") != prev:
            return {"ok": False, "broken_at": i + 1, "reason": "prev link mismatch"}
        if digest(env) != env.get("hash"):
            return {"ok": False, "broken_at": i + 1, "reason": "hash mismatch"}
        prev = env["hash"]
    return {"ok": True, "count": len(messages), "head": prev}


class _LogicalClock:
    """Wall-clock milliseconds, made strictly increasing."""

    def __init__(self):
        import time
        self._time = time
        self._last = 0

    def now(self) -> int:
        t = int(self._time.time() * 1000)
        if t <= self._last:
            t = self._last + 1
        self._last = t
        return t
