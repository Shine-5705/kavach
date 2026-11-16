"""Lyzr adapters (Lyzr Agent Studio, https://docs.lyzr.ai).

LyzrReasoner: Blue's triage rationale is written by a Lyzr agent you create
in Agent Studio ("Kavach Blue Analyst"). The finding JSON is sent; the
agent's text replaces the offline template. If Lyzr fails, Blue falls back to
the template and says so, and the defense itself never depends on the LLM.

LyzrTarget: points Red at an LLM agent hosted on Lyzr instead of the
deterministic PaisaPal planner. Use the system prompt in
docs/lyzr-target-prompt.md so the canary oracle applies.

Env: LYZR_API_KEY, LYZR_BLUE_AGENT_ID, LYZR_TARGET_AGENT_ID, LYZR_USER_ID
"""
from __future__ import annotations

import json
import os
import uuid
from typing import Any, Dict

from ._http import request

URL = "https://agent-prod.studio.lyzr.ai/v3/inference/chat/"


def chat(agent_id: str, message: str, session_id: str) -> str:
    key = os.environ["LYZR_API_KEY"]
    status, data = request("POST", URL, {"x-api-key": key}, {
        "user_id": os.environ.get("LYZR_USER_ID", "kavach@local"), "agent_id": agent_id,
        "session_id": session_id, "message": message}, timeout=60)
    if status >= 300:
        raise RuntimeError(f"Lyzr HTTP {status}: {json.dumps(data)[:200]}")
    return data.get("response", "")


class LyzrReasoner:
    def __init__(self, agent_id: str = None):
        self.agent_id = agent_id or os.environ["LYZR_BLUE_AGENT_ID"]
        self.session = f"{self.agent_id}-{uuid.uuid4().hex[:10]}"

    def explain(self, kind: str, ctx: Dict[str, Any]) -> str:
        f = ctx["finding"]
        msg = ("You are Blue, a defensive security analyst. In at most 3 sentences, explain the business "
               "impact and root cause of this reproduced finding and why the planned defenses address it. "
               "Do not invent facts beyond the JSON.\n" + json.dumps(
                   {"id": f["id"], "title": f["title"], "owasp": f["owasp"], "severity": ctx["severity"],
                    "evidence": {k: f["evidence"][k] for k in ("oracle", "detail", "reply")}}))
        return chat(self.agent_id, msg, self.session).strip()


class LyzrTarget:
    """Same respond() contract as PaisaPal, backed by a Lyzr-hosted LLM agent."""

    def __init__(self, guards, agent_id: str = None):
        self.guards = guards
        self.agent_id = agent_id or os.environ["LYZR_TARGET_AGENT_ID"]
        self.session = f"{self.agent_id}-{uuid.uuid4().hex[:10]}"

    def respond(self, user: str, message: str) -> Dict[str, Any]:
        trace = {"user": user, "input": message, "tool_calls": [], "blocked_by": [], "followed_directives": []}
        verdict = self.guards.check_input(message, trace)
        if verdict:
            trace["reply"] = verdict
            return trace
        raw = chat(self.agent_id, message, self.session)
        trace["raw_reply"] = raw
        trace["reply"] = self.guards.filter_output(raw, user, self, trace)
        return trace
