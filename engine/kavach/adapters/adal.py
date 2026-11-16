"""AdaL adapter (SylphAI AdaL CLI, https://docs.sylph.ai).

Runs AdaL headless (`adal -q ... --output json`) on an engagement record to
draft the remediation pull-request description and the launch/demo video
plan. AdaL needs one interactive `adal` login first; after that headless runs
reuse the cached session.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from typing import Any, Dict

PR_PROMPT = ("Read engagement.json (a Kavach red/blue security engagement). Write a pull-request "
             "description for the fixes Blue deployed: one section per finding with severity, the attack "
             "that proved it, the defense, and the retest result. Use only facts in the file. Save it to "
             "REMEDIATION_PR.md.")


def available() -> bool:
    return shutil.which("adal") is not None


def run(prompt: str, cwd: str = ".", tools: str = "Read,Write") -> Dict[str, Any]:
    if not available():
        raise RuntimeError("AdaL CLI not installed: curl -fsSL https://adal.sylph.ai/install.sh | bash")
    p = subprocess.run(["adal", "-q", prompt, "--output", "json", "--enabled-default-tools", tools],
                       cwd=cwd, capture_output=True, text=True, timeout=900)
    try:
        return json.loads(p.stdout)
    except ValueError:
        return {"success": p.returncode == 0, "answer": p.stdout, "stderr": p.stderr[-2000:]}
