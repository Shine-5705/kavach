---
name: code-security-audit
description: Use when an agent needs a fast, offline heuristic security scan of source code — flag dangerous patterns (eval/exec, shell=True, unsafe deserialization, SQL injection, disabled TLS verification), insecure config (debug, wildcard CORS, bind-all), weak crypto, insecure randomness, and a missing LICENSE. Returns findings with path+line+rule_id+severity+recommendation and a block/review/pass verdict. Heuristic static checks, not a full SAST; human review required. No network, no API keys.
---

# Code Security Audit

A self-contained, zero-dependency (Python standard library only) rule-based
SAST-lite tool. It runs fully offline: source files are passed INLINE as
`files` (each `{path, content}`). There are no network calls and no API keys.

It applies a fixed set of heuristic regex rules line-by-line. These are
heuristic static checks, not a full SAST; findings are advisory and require
human review. Reasonable false positives are expected.

## Fixed Flow

When the user asks to audit / security-scan some code, do not offer
execution-mode choices. Build one JSON input object and call `code_audit.py`.

1. Set `mode` to `audit`.
2. Put each file inline in `files` as `{path, content}`. Include the repo's
   `LICENSE` file (if any) so the missing-license check is accurate.
3. Call the runner and read the single JSON object it prints on stdout.
4. Act on `data.verdict`: `block` (a high-severity issue is present), `review`
   (a medium issue is present), or `pass`.

## How to call code_audit.py

Pass a JSON file path, or pipe the JSON object on stdin:

```bash
python3 code_audit.py examples/audit.json
```

```bash
echo '{"mode":"audit","files":[{"path":"a.py","content":"eval(x)"}]}' | python3 code_audit.py
```

### Modes

- `audit` — `{mode, files:[{path, content}]}`. Returns:
  - `data.findings` — each `{path, line, rule_id, category, severity, excerpt,
    recommendation}`, sorted by severity (high>medium>low), then path, then line.
  - `data.summary` — `{files_scanned, total, by_severity:{high,medium,low},
    by_category}`.
  - `data.verdict` — `block` if any high finding, else `review` if any medium,
    else `pass`.

### Rules

`dangerous_eval`, `shell_injection`, `unsafe_deserialization`, `sql_injection`,
`tls_verification_disabled` (all high); `weak_hash`, `debug_enabled`,
`cors_wildcard` (medium); `bind_all_interfaces`, `insecure_random_for_token`
(low). A repo-level `missing_license` (low) finding is emitted when none of the
input paths is a `LICENSE` / `LICENSE.*` file.

## Success

On success the runner prints one JSON object and exits 0:

```text
result.ok == true
result.skill == "code-security-audit"
result.mode == "audit"
result.data is present
```

Machine-checkable:

```text
audit: data.summary.files_scanned == number of input files;
       data.verdict == "block" whenever data.summary.by_severity.high > 0;
       every finding carries path, line, rule_id, severity, and recommendation.
```

On any error the runner prints `{"ok": false, ..., "error": {"code", "message"}}`
and exits 1. It never prints a Python traceback. Error codes: `BAD_INPUT`,
`UNKNOWN_MODE`, `INTERNAL`.
