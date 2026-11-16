#!/usr/bin/env python3
"""
FinChip Studio Skill: pii-redactor

A self-contained, offline, zero-dependency personal-data (PII) redactor. It
accepts a single JSON object on stdin (or as a file argument) and dispatches on
its `mode` field:

- redact: scan inline text documents for PII and return a REDACTED copy of each

The Skill is meant for scrubbing text BEFORE publishing. All input is supplied
INLINE (via `files`), so the Skill never touches the network and needs no API
keys. Python standard library only.

Detectors (each match is replaced with a [REDACTED_<TYPE>] token):
  EMAIL, PHONE, CREDIT_CARD (Luhn-valid), SSN, IP (IPv4), NAME (best-effort).

Privacy guarantees:
  - Raw PII is NEVER echoed in the findings list; each finding carries only a
    MASKED preview (e.g. "j***@***.com", "4***").
  - After building the redacted copy, every detector is RE-RUN on it; the match
    count must be 0 for `redaction_verified` to be true.

NAME detection is intentionally high-recall / best-effort and should be
reviewed by a human; occasional over-redaction is expected.

Output envelope (deterministic):
  success -> {"ok": true,  "skill": ..., "version": ..., "mode": ..., "data": {...}}
  error   -> {"ok": false, "skill": ..., "version": ..., "error": {"code": ..., "message": ...}}
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

SKILL_NAME = "pii-redactor"
SKILL_VERSION = "0.1.0"

VALID_MODES = ("redact",)

# Canonical set of detector types.
ALL_TYPES = ("EMAIL", "PHONE", "CREDIT_CARD", "SSN", "IP", "NAME")

# Selection priority when spans overlap: LOWER number wins. This keeps the more
# specific interpretation (an IP dotted-quad, an SSN, a credit card) from being
# swallowed by the loose PHONE detector.
TYPE_PRIORITY = {
    "EMAIL": 0,
    "SSN": 1,
    "CREDIT_CARD": 2,
    "IP": 3,
    "NAME": 4,
    "PHONE": 5,
}


class RedactError(Exception):
    """Raised for user-facing errors. `code` becomes the error envelope code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# Compiled detector patterns
# ---------------------------------------------------------------------------

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

# Loose international / US phone. Requires a leading digit (optional +) and a
# run of digits and separators. Pure runs of digits with no separator are
# rejected in post-processing so plain long integers are not treated as phones.
PHONE_RE = re.compile(r"\+?\d[\d\-\s().]{7,}\d")
PHONE_SEPARATORS = set(" \t-().")

# 13-19 digit sequence allowing a single space or dash between digits. The Luhn
# check is applied in post-processing.
CREDIT_CARD_RE = re.compile(r"(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)")

SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")

IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")

# --- NAME sub-detectors -----------------------------------------------------

# ~40 common English given names (bundled gazetteer). Matched case-sensitively
# as Titlecase words, with an optional following Titlecase surname.
GIVEN_NAMES = [
    "James", "John", "Robert", "Michael", "William", "David", "Richard",
    "Joseph", "Thomas", "Charles", "Christopher", "Daniel", "Matthew",
    "Anthony", "Mark", "Paul", "Steven", "Andrew", "Kenneth", "Joshua",
    "Mary", "Patricia", "Jennifer", "Linda", "Elizabeth", "Barbara", "Susan",
    "Jessica", "Sarah", "Karen", "Emily", "Emma", "Olivia", "Sophia", "Jane",
    "Alice", "Nancy", "Lisa", "Betty", "Margaret",
]
GAZETTEER_RE = re.compile(
    r"\b(?:" + "|".join(GIVEN_NAMES) + r")\b(?:\s+[A-Z][a-z]+)?"
)

# Explicit labelled names: "Name: X", "Author: X", "作者：X", "姓名：X".
# The captured value must LOOK like a name (starts with a letter or CJK char),
# which also guarantees a [REDACTED_NAME] token can never be re-captured.
_NAME_VALUE = (
    r"[A-Za-z一-鿿][A-Za-z一-鿿'.\-]*"
    r"(?:[ \t]+[A-Za-z一-鿿][A-Za-z一-鿿'.\-]*){0,3}"
)
LABELLED_NAME_RE = re.compile(
    r"(?:name|author|作者|姓名)[ \t]*[:：][ \t]*(" + _NAME_VALUE + r")",
    re.IGNORECASE,
)

# Honorific titles followed by a Titlecase name (1+ words).
TITLE_NAME_RE = re.compile(
    r"\b(?:Mr|Mrs|Ms|Mx|Dr|Prof|Sir|Madam)\.?[ \t]+([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)*)"
)

# Weaker name-ish cues that require a full "Titlecase Titlecase" pair to fire.
CUE_NAME_RE = re.compile(
    r"\b(?:by|from|Sincerely|Regards|Contact|Attn|Signed|Dear)\b[,:]?[ \t]+"
    r"([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)+)"
)


# ---------------------------------------------------------------------------
# Detector helpers
# ---------------------------------------------------------------------------

def luhn_valid(digits: str) -> bool:
    """Return True if a string of digits passes the Luhn checksum."""
    total = 0
    parity = len(digits) % 2
    for i, ch in enumerate(digits):
        d = ord(ch) - 48
        if i % 2 == parity:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def valid_ipv4(text: str) -> bool:
    parts = text.split(".")
    if len(parts) != 4:
        return False
    for part in parts:
        if not part.isdigit() or len(part) > 3:
            return False
        if int(part) > 255:
            return False
    return True


def _detect_emails(text: str, out: List[Tuple[str, int, int, str]]) -> None:
    for m in EMAIL_RE.finditer(text):
        out.append(("EMAIL", m.start(), m.end(), m.group()))


def _detect_phones(text: str, out: List[Tuple[str, int, int, str]]) -> None:
    for m in PHONE_RE.finditer(text):
        raw = m.group()
        # Reject plain long integers with no separators and no leading '+'.
        has_sep = raw.startswith("+") or any(c in PHONE_SEPARATORS for c in raw)
        if not has_sep:
            continue
        out.append(("PHONE", m.start(), m.end(), raw))


def _detect_credit_cards(text: str, out: List[Tuple[str, int, int, str]]) -> None:
    for m in CREDIT_CARD_RE.finditer(text):
        raw = m.group()
        digits = re.sub(r"[ -]", "", raw)
        if 13 <= len(digits) <= 19 and luhn_valid(digits):
            out.append(("CREDIT_CARD", m.start(), m.end(), raw))


def _detect_ssns(text: str, out: List[Tuple[str, int, int, str]]) -> None:
    for m in SSN_RE.finditer(text):
        out.append(("SSN", m.start(), m.end(), m.group()))


def _detect_ips(text: str, out: List[Tuple[str, int, int, str]]) -> None:
    for m in IP_RE.finditer(text):
        raw = m.group()
        if valid_ipv4(raw):
            out.append(("IP", m.start(), m.end(), raw))


def _detect_names(
    text: str, extra_names: List[str], out: List[Tuple[str, int, int, str]]
) -> None:
    for m in GAZETTEER_RE.finditer(text):
        out.append(("NAME", m.start(), m.end(), m.group()))
    for pattern in (LABELLED_NAME_RE, TITLE_NAME_RE, CUE_NAME_RE):
        for m in pattern.finditer(text):
            out.append(("NAME", m.start(1), m.end(1), m.group(1)))
    for name in extra_names:
        if not name.strip():
            continue
        for m in re.finditer(r"\b" + re.escape(name) + r"\b", text, re.IGNORECASE):
            out.append(("NAME", m.start(), m.end(), m.group()))


DETECTORS = {
    "EMAIL": lambda t, extra, out: _detect_emails(t, out),
    "PHONE": lambda t, extra, out: _detect_phones(t, out),
    "CREDIT_CARD": lambda t, extra, out: _detect_credit_cards(t, out),
    "SSN": lambda t, extra, out: _detect_ssns(t, out),
    "IP": lambda t, extra, out: _detect_ips(t, out),
    "NAME": lambda t, extra, out: _detect_names(t, extra, out),
}


def detect_all(
    text: str, enabled: Tuple[str, ...], extra_names: List[str]
) -> List[Tuple[str, int, int, str]]:
    """Run every enabled detector and return raw (type, start, end, value) hits."""
    hits: List[Tuple[str, int, int, str]] = []
    for type_name in ALL_TYPES:
        if type_name in enabled:
            DETECTORS[type_name](text, extra_names, hits)
    return hits


def select_spans(
    hits: List[Tuple[str, int, int, str]]
) -> List[Tuple[str, int, int, str]]:
    """Greedily resolve overlaps, keeping the highest-priority match.

    Higher priority (lower TYPE_PRIORITY) is selected first; any later candidate
    overlapping an already-selected span is dropped. The result is returned in
    left-to-right start order.
    """
    ordered = sorted(hits, key=lambda h: (TYPE_PRIORITY[h[0]], h[1], -(h[2] - h[1])))
    selected: List[Tuple[str, int, int, str]] = []
    for cand in ordered:
        _, start, end, _ = cand
        overlaps = any(not (end <= s or start >= e) for _, s, e, _ in selected)
        if not overlaps:
            selected.append(cand)
    selected.sort(key=lambda h: h[1])
    return selected


# ---------------------------------------------------------------------------
# Masking (findings must never echo raw PII)
# ---------------------------------------------------------------------------

def mask_value(type_name: str, raw: str) -> str:
    """Return a masked preview of a raw PII value. Never returns the full value."""
    if type_name == "EMAIL" and "@" in raw:
        local, _, domain = raw.partition("@")
        first = local[0] if local else ""
        tld = domain.rsplit(".", 1)[-1] if "." in domain else "***"
        return f"{first}***@***.{tld}"
    first = raw[0] if raw else ""
    return f"{first}***"


# ---------------------------------------------------------------------------
# Mode: redact
# ---------------------------------------------------------------------------

def redact_text(
    text: str, enabled: Tuple[str, ...], extra_names: List[str]
) -> Tuple[List[Dict[str, Any]], str]:
    """Detect PII in `text`, return (findings, redacted_text)."""
    spans = select_spans(detect_all(text, enabled, extra_names))

    findings: List[Dict[str, Any]] = []
    for type_name, start, end, raw in spans:
        findings.append(
            {
                "type": type_name,
                "line": text.count("\n", 0, start) + 1,
                "char_start": start,
                "char_end": end,
                "value_masked": mask_value(type_name, raw),
            }
        )

    # Replace right-to-left so earlier offsets stay valid.
    redacted = text
    for type_name, start, end, _ in sorted(spans, key=lambda h: h[1], reverse=True):
        redacted = redacted[:start] + f"[REDACTED_{type_name}]" + redacted[end:]

    return findings, redacted


def parse_types(obj: Dict[str, Any]) -> Tuple[str, ...]:
    raw = obj.get("types")
    if raw is None:
        return ALL_TYPES
    if not isinstance(raw, list) or not all(isinstance(t, str) for t in raw):
        raise RedactError("BAD_INPUT", "'types' must be an array of strings.")
    enabled = []
    for t in raw:
        key = t.strip().upper()
        if key not in ALL_TYPES:
            raise RedactError(
                "BAD_INPUT",
                f"Unknown type '{t}'. Expected a subset of: {', '.join(ALL_TYPES)}.",
            )
        if key not in enabled:
            enabled.append(key)
    if not enabled:
        raise RedactError("BAD_INPUT", "'types' must enable at least one detector.")
    return tuple(enabled)


def parse_extra_names(obj: Dict[str, Any]) -> List[str]:
    raw = obj.get("extra_names")
    if raw is None:
        return []
    if not isinstance(raw, list) or not all(isinstance(n, str) for n in raw):
        raise RedactError("BAD_INPUT", "'extra_names' must be an array of strings.")
    return raw


def mode_redact(obj: Dict[str, Any]) -> Dict[str, Any]:
    files = obj.get("files")
    if not isinstance(files, list):
        raise RedactError("BAD_INPUT", "'files' must be a JSON array of objects.")
    if not files:
        raise RedactError("BAD_INPUT", "'files' must contain at least one file.")

    enabled = parse_types(obj)
    extra_names = parse_extra_names(obj)

    out_files: List[Dict[str, Any]] = []
    by_type: Dict[str, int] = {t: 0 for t in ALL_TYPES}
    total_findings = 0
    all_verified = True

    for i, entry in enumerate(files):
        if not isinstance(entry, dict):
            raise RedactError("BAD_INPUT", f"'files[{i}]' must be a JSON object.")
        path = entry.get("path", f"file_{i}")
        if not isinstance(path, str):
            raise RedactError("BAD_INPUT", f"'files[{i}].path' must be a string.")
        content = entry.get("content")
        if not isinstance(content, str):
            raise RedactError(
                "BAD_INPUT", f"'files[{i}].content' must be a string."
            )

        # Normalize to NFC so offsets are stable and detectors behave
        # consistently across equivalent Unicode encodings.
        content = unicodedata.normalize("NFC", content)

        findings, redacted = redact_text(content, enabled, extra_names)

        # HARD SELF-CHECK: re-scan the redacted copy; it must be clean.
        residual = select_spans(detect_all(redacted, enabled, extra_names))
        verified = len(residual) == 0
        all_verified = all_verified and verified

        for f in findings:
            by_type[f["type"]] += 1
        total_findings += len(findings)

        out_files.append(
            {
                "path": path,
                "findings": findings,
                "redacted_content": redacted,
                "redaction_verified": verified,
            }
        )

    return {
        "files": out_files,
        "summary": {
            "files": len(out_files),
            "total_findings": total_findings,
            "by_type": {t: c for t, c in by_type.items() if c > 0},
        },
        "redaction_verified": all_verified,
    }


# ---------------------------------------------------------------------------
# Dispatch / envelope
# ---------------------------------------------------------------------------

DISPATCH = {
    "redact": mode_redact,
}


def run(obj: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(obj, dict):
        raise RedactError("BAD_INPUT", "Input must be a single JSON object.")
    mode = obj.get("mode")
    if mode is None:
        raise RedactError("BAD_INPUT", "Missing required field 'mode'.")
    if mode not in VALID_MODES:
        raise RedactError(
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
            raise RedactError("BAD_INPUT", f"Could not read input file: {exc}")
    else:
        raw = sys.stdin.read()
    if raw.strip() == "":
        raise RedactError("BAD_INPUT", "No input provided (empty stdin/file).")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RedactError("BAD_INPUT", f"Input is not valid JSON: {exc}")


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
        prog="pii_redactor.py",
        description="FinChip Studio pii-redactor: detect PII and emit a redacted copy of inline text.",
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
    except RedactError as exc:
        emit_error(exc.code, exc.message)
        return 1
    except Exception as exc:  # noqa: BLE001 - never leak a traceback
        emit_error("INTERNAL", f"Unexpected error: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
