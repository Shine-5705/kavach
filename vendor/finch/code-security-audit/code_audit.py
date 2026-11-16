#!/usr/bin/env python3
"""
FinChip Studio Skill: code-security-audit

A self-contained, offline, zero-dependency rule-based SAST-lite tool. Accepts a
single JSON object on stdin (or as a file argument) and dispatches on its
`mode` field:

- audit: scan inline source files for dangerous code patterns, insecure
         configuration, weak crypto, and a missing-license gap.

Source files are provided INLINE (via `files`, each with `path` and `content`)
so the Skill never touches the network and needs no API keys. It applies a
fixed set of heuristic regex rules line-by-line. This is NOT a full SAST engine;
findings are advisory and require human review.

Output envelope (deterministic):
  success -> {"ok": true,  "skill": ..., "version": ..., "mode": ..., "data": {...}}
  error   -> {"ok": false, "skill": ..., "version": ..., "error": {"code": ..., "message": ...}}
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any, Dict, List, Optional

SKILL_NAME = "code-security-audit"
SKILL_VERSION = "0.1.0"

VALID_MODES = ("audit",)

SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}


class AuditError(Exception):
    """Raised for user-facing errors. `code` becomes the error envelope code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# Rule definitions
# ---------------------------------------------------------------------------
#
# Each rule is a dict with:
#   rule_id / category / severity / recommendation
#   patterns:  list of compiled regexes; a line matches the rule if ANY matches
#   guard:     optional callable(line) -> bool that must also be True to fire
#
# All matching is heuristic and line-based. It may over-flag; findings are
# advisory and human-reviewed.

SQL_KEYWORD_RE = re.compile(r"\b(?:SELECT|INSERT|UPDATE|DELETE)\b", re.IGNORECASE)
EXECUTE_CALL_RE = re.compile(r"\bexecute(?:many)?\s*\(", re.IGNORECASE)
DYNAMIC_SQL_RE = re.compile(r"%|\+|\.format\s*\(|f['\"]")
TOKENISH_RE = re.compile(r"token|secret|password|nonce", re.IGNORECASE)


def _sql_injection_guard(line: str) -> bool:
    """SQL keyword inside an execute(...) call built by string interpolation."""
    if not EXECUTE_CALL_RE.search(line):
        return False
    if not SQL_KEYWORD_RE.search(line):
        return False
    return bool(DYNAMIC_SQL_RE.search(line))


def _insecure_random_guard(line: str) -> bool:
    """random.* on a line that also mentions token/secret/password/nonce."""
    return bool(TOKENISH_RE.search(line))


RULES: List[Dict[str, Any]] = [
    {
        "rule_id": "dangerous_eval",
        "category": "code_execution",
        "severity": "high",
        "patterns": [re.compile(r"\beval\s*\("), re.compile(r"\bexec\s*\(")],
        "recommendation": "Avoid eval/exec on dynamic input; use explicit parsing "
        "(e.g. ast.literal_eval) or a dispatch table instead.",
    },
    {
        "rule_id": "shell_injection",
        "category": "command_injection",
        "severity": "high",
        "patterns": [
            re.compile(r"os\.system\s*\("),
            re.compile(r"subprocess\.(?:call|run|Popen)\([^)]*shell\s*=\s*True"),
        ],
        "recommendation": "Do not build shell commands from untrusted input; pass an "
        "argument list and avoid shell=True.",
    },
    {
        "rule_id": "unsafe_deserialization",
        "category": "deserialization",
        "severity": "high",
        "patterns": [
            re.compile(r"pickle\.loads?\s*\("),
            re.compile(r"yaml\.load\s*\((?![^)]*Loader)"),
            re.compile(r"marshal\.loads"),
        ],
        "recommendation": "Never deserialize untrusted data; use json, or yaml.safe_load "
        "with an explicit safe Loader.",
    },
    {
        "rule_id": "sql_injection",
        "category": "injection",
        "severity": "high",
        "patterns": [re.compile(r".")],  # gated by guard below
        "guard": _sql_injection_guard,
        "recommendation": "Use parameterized queries / bound parameters instead of string "
        "concatenation or formatting to build SQL.",
    },
    {
        "rule_id": "tls_verification_disabled",
        "category": "transport",
        "severity": "high",
        "patterns": [
            re.compile(r"verify\s*=\s*False"),
            re.compile(r"rejectUnauthorized\s*:\s*false"),
            re.compile(r"InsecureSkipVerify\s*=\s*true"),
        ],
        "recommendation": "Keep TLS certificate verification enabled; configure a trusted "
        "CA bundle rather than disabling verification.",
    },
    {
        "rule_id": "weak_hash",
        "category": "crypto",
        "severity": "medium",
        "patterns": [
            re.compile(r"\b(?:md5|sha1)\s*\("),
            re.compile(r"DES"),
            re.compile(r"\bECB\b"),
        ],
        "recommendation": "Use a strong algorithm (SHA-256+ for hashing, AES-GCM for "
        "encryption); avoid MD5, SHA-1, DES, and ECB mode.",
    },
    {
        "rule_id": "debug_enabled",
        "category": "config",
        "severity": "medium",
        "patterns": [
            re.compile(r"DEBUG\s*=\s*True"),
            re.compile(r'"debug"\s*:\s*true'),
            re.compile(r"app\.run\([^)]*debug\s*=\s*True"),
        ],
        "recommendation": "Disable debug mode in production; it can expose stack traces "
        "and enable interactive code execution.",
    },
    {
        "rule_id": "cors_wildcard",
        "category": "config",
        "severity": "medium",
        "patterns": [
            re.compile(r"Access-Control-Allow-Origin[\"'\s:]*\*"),
            re.compile(r"origin\s*:\s*['\"]\*['\"]"),
        ],
        "recommendation": "Do not allow all origins with '*'; restrict CORS to an explicit "
        "allow-list of trusted origins.",
    },
    {
        "rule_id": "bind_all_interfaces",
        "category": "config",
        "severity": "low",
        "patterns": [re.compile(r"0\.0\.0\.0")],
        "recommendation": "Binding to 0.0.0.0 exposes the service on all interfaces; bind "
        "to a specific interface or place it behind a firewall/proxy.",
    },
    {
        "rule_id": "insecure_random_for_token",
        "category": "crypto",
        "severity": "low",
        "patterns": [re.compile(r"random\.(?:random|randint|choice)")],
        "guard": _insecure_random_guard,
        "recommendation": "Use the 'secrets' module (or os.urandom) for tokens, secrets, "
        "passwords, and nonces instead of the 'random' module.",
    },
]


# ---------------------------------------------------------------------------
# Input normalization
# ---------------------------------------------------------------------------

def normalize_files(obj: Dict[str, Any]) -> List[Dict[str, str]]:
    files = obj.get("files")
    if files is None:
        raise AuditError("BAD_INPUT", "Missing required field 'files'.")
    if not isinstance(files, list):
        raise AuditError("BAD_INPUT", "'files' must be a JSON array of {path, content} objects.")
    norm: List[Dict[str, str]] = []
    for i, entry in enumerate(files):
        if not isinstance(entry, dict):
            raise AuditError("BAD_INPUT", f"'files[{i}]' must be a JSON object.")
        path = entry.get("path")
        content = entry.get("content")
        if not isinstance(path, str) or path == "":
            raise AuditError("BAD_INPUT", f"'files[{i}].path' must be a non-empty string.")
        if content is None:
            content = ""
        if not isinstance(content, str):
            raise AuditError("BAD_INPUT", f"'files[{i}].content' must be a string.")
        norm.append({"path": path, "content": content})
    return norm


def basename(path: str) -> str:
    # Normalize both separators so LICENSE detection works on any OS-style path.
    normalized = path.replace("\\", "/")
    return normalized.rsplit("/", 1)[-1]


def is_license_path(path: str) -> bool:
    name = basename(path)
    return name == "LICENSE" or name.startswith("LICENSE.")


# ---------------------------------------------------------------------------
# Scanning
# ---------------------------------------------------------------------------

def excerpt_of(line: str) -> str:
    trimmed = line.strip()
    if len(trimmed) > 200:
        return trimmed[:197] + "..."
    return trimmed


def scan_file(path: str, content: str) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    lines = content.splitlines()
    for lineno, line in enumerate(lines, start=1):
        for rule in RULES:
            guard = rule.get("guard")
            if guard is not None and not guard(line):
                continue
            matched = any(pat.search(line) for pat in rule["patterns"])
            if not matched:
                continue
            findings.append(
                {
                    "path": path,
                    "line": lineno,
                    "rule_id": rule["rule_id"],
                    "category": rule["category"],
                    "severity": rule["severity"],
                    "excerpt": excerpt_of(line),
                    "recommendation": rule["recommendation"],
                }
            )
    return findings


def mode_audit(obj: Dict[str, Any]) -> Dict[str, Any]:
    files = normalize_files(obj)

    findings: List[Dict[str, Any]] = []
    for entry in files:
        findings.extend(scan_file(entry["path"], entry["content"]))

    # Repo-level check: flag a missing LICENSE file.
    if not any(is_license_path(entry["path"]) for entry in files):
        findings.append(
            {
                "path": "<repo>",
                "line": 0,
                "rule_id": "missing_license",
                "category": "compliance",
                "severity": "low",
                "excerpt": "",
                "recommendation": "Add a LICENSE file (e.g. LICENSE or LICENSE.txt) so usage "
                "terms are explicit and license compliance can be assessed.",
            }
        )

    findings.sort(key=lambda f: (SEVERITY_RANK[f["severity"]], f["path"], f["line"]))

    by_severity = {"high": 0, "medium": 0, "low": 0}
    by_category: Dict[str, int] = {}
    for f in findings:
        by_severity[f["severity"]] += 1
        by_category[f["category"]] = by_category.get(f["category"], 0) + 1

    if by_severity["high"] > 0:
        verdict = "block"
    elif by_severity["medium"] > 0:
        verdict = "review"
    else:
        verdict = "pass"

    return {
        "findings": findings,
        "summary": {
            "files_scanned": len(files),
            "total": len(findings),
            "by_severity": by_severity,
            "by_category": by_category,
        },
        "verdict": verdict,
    }


# ---------------------------------------------------------------------------
# Dispatch / envelope
# ---------------------------------------------------------------------------

DISPATCH = {
    "audit": mode_audit,
}


def run(obj: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(obj, dict):
        raise AuditError("BAD_INPUT", "Input must be a single JSON object.")
    mode = obj.get("mode")
    if mode is None:
        raise AuditError("BAD_INPUT", "Missing required field 'mode'.")
    if mode not in VALID_MODES:
        raise AuditError(
            "UNKNOWN_MODE",
            f"Unknown mode '{mode}'. Expected one of: {', '.join(VALID_MODES)}.",
        )
    data = DISPATCH[mode](obj)
    return {
        "ok": True,
        "skill": SKILL_NAME,
        "version": SKILL_VERSION,
        "mode": mode,
        "data": data,
    }


def read_input(path: Optional[str]) -> Dict[str, Any]:
    if path:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                raw = fh.read()
        except OSError as exc:
            raise AuditError("BAD_INPUT", f"Could not read input file: {exc}")
    else:
        raw = sys.stdin.read()
    if raw.strip() == "":
        raise AuditError("BAD_INPUT", "No input provided (empty stdin/file).")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AuditError("BAD_INPUT", f"Input is not valid JSON: {exc}")


def emit_error(code: str, message: str) -> None:
    envelope = {
        "ok": False,
        "skill": SKILL_NAME,
        "version": SKILL_VERSION,
        "error": {"code": code, "message": message},
    }
    print(json.dumps(envelope, ensure_ascii=False))


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="code_audit.py",
        description="FinChip Studio code-security-audit: rule-based SAST-lite scan of inline source files.",
    )
    parser.add_argument(
        "input",
        nargs="?",
        default=None,
        help="Path to a JSON input file. If omitted, the JSON object is read from stdin.",
    )
    try:
        args = parser.parse_args(argv)
        obj = read_input(args.input)
        result = run(obj)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except AuditError as exc:
        emit_error(exc.code, exc.message)
        return 1
    except Exception as exc:  # noqa: BLE001 - never leak a traceback
        emit_error("INTERNAL", f"Unexpected error: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
