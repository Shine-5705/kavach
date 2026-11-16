"""Bridge to Finch skills (FinchTech-AI, MIT), vendored under vendor/finch/.

The skills are imported and their documented run(obj) entrypoint is called
in-process. That works the same in CPython and in Pyodide, so the hosted
console executes Finch's actual code in the browser.
"""
from __future__ import annotations

import importlib.util
import os
from typing import Any, Dict, List

_ROOT = os.environ.get("KAVACH_FINCH_DIR") or os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "vendor", "finch"))
_cache: Dict[str, Any] = {}
calls: List[Dict[str, Any]] = []  # audit trail of every skill invocation


def set_root(path: str) -> None:
    global _ROOT
    _ROOT = path
    _cache.clear()


def _load(skill: str, module: str):
    key = f"{skill}/{module}"
    if key not in _cache:
        path = os.path.join(_ROOT, skill, module)
        spec = importlib.util.spec_from_file_location(f"finch_{module[:-3]}", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _cache[key] = mod
    return _cache[key]


def code_security_audit(files: List[Dict[str, str]]) -> Dict[str, Any]:
    out = _load("code-security-audit", "code_audit.py").run({"mode": "audit", "files": files})
    calls.append({"skill": "code-security-audit", "files": [f["path"] for f in files],
                  "ok": out.get("ok"), "verdict": (out.get("data") or {}).get("verdict")})
    return out


def pii_redact(text: str, types=None) -> Dict[str, Any]:
    obj: Dict[str, Any] = {"mode": "redact", "files": [{"path": "reply.txt", "content": text}]}
    if types:
        obj["types"] = list(types)
    out = _load("pii-redactor", "pii_redactor.py").run(obj)
    calls.append({"skill": "pii-redactor", "ok": out.get("ok"),
                  "found": len(((out.get("data") or {}).get("files") or [{}])[0].get("findings", []))})
    return out


def available() -> bool:
    return os.path.exists(os.path.join(_ROOT, "code-security-audit", "code_audit.py"))
