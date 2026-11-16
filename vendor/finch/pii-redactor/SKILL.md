---
name: pii-redactor
description: Use when an agent needs to scrub personal data (PII) out of inline text before publishing — detects EMAIL, PHONE, CREDIT_CARD (Luhn-valid), SSN, IPv4, and best-effort NAME, replaces each with a [REDACTED_<TYPE>] token, masks raw values in the findings, and re-scans the output to verify zero residual matches. Fully offline: no network, no API keys.
---

# PII Redactor

A self-contained, zero-dependency (Python standard library only) redactor. It
runs fully offline: the documents to scrub are passed INLINE as `files` (each
with a `path` label and a `content` string). There are no network calls and no
API keys.

For each document it detects PII, replaces every match with a
`[REDACTED_<TYPE>]` token, and returns both a masked findings list and the
redacted copy. After redacting it RE-RUNS every detector on the output and only
reports `redaction_verified: true` when zero matches remain.

Detectors: `EMAIL`, `PHONE`, `CREDIT_CARD` (13–19 digits passing the Luhn
check), `SSN` (`###-##-####`), `IP` (IPv4 dotted quad), and `NAME`.

> NAME detection is intentionally **high-recall / best-effort**: a small bundled
> gazetteer of common given names, `Titlecase Titlecase` pairs after name-ish
> cues, and explicit `Name:` / `Author:` / `作者：` / `姓名：` labels, plus any
> `extra_names` you supply. It can over- or under-redact and **must be reviewed
> by a human** before you rely on it. This Skill offers redaction assistance,
> not legal advice — verify the redaction before relying on it.

## Fixed Flow

When the user asks to remove or scrub personal data from some text before
sharing/publishing, do not offer execution-mode choices. Build one JSON input
object and call `pii_redactor.py`.

1. Set `mode` to `redact`.
2. Put each document inline in `files` as `{ "path": <label>, "content": <text> }`.
3. Optionally set `types` to a subset of detectors (defaults to all six).
4. Optionally set `extra_names` — a list of specific names to also redact.
5. Call the runner and read the single JSON object it prints on stdout.
6. Check `data.redaction_verified` is `true`, then hand the redacted content to a
   human for review before publishing.

## How to call pii_redactor.py

Pass a JSON file path, or pipe the JSON object on stdin:

```bash
python3 pii_redactor.py examples/redact.json
```

```bash
echo '{"mode":"redact","files":[{"path":"a.txt","content":"mail me foo@bar.io"}]}' | python3 pii_redactor.py
```

### Mode

- `redact` — `{mode, files:[{path, content}], types?, extra_names?}`. Returns
  `data.files` (per file: `path`, `findings`, `redacted_content`,
  `redaction_verified`), `data.summary` (`files`, `total_findings`, `by_type`),
  and a top-level `data.redaction_verified`.

Each finding is `{type, line, char_start, char_end, value_masked}` where
`char_start`/`char_end` are absolute character offsets into the (NFC-normalized)
content and `value_masked` is a masked preview — the raw PII value is never
echoed.

## Success

On success the runner prints one JSON object and exits 0:

```text
result.ok == true
result.skill == "pii-redactor"
result.mode == "redact"
result.data is present
```

Machine-checkable:

```text
data.redaction_verified == true   (re-scanning redacted_content yields 0 matches)
every finding has type + line + char_start + char_end + value_masked
no finding echoes a raw PII value in full (value_masked only)
data.summary.total_findings == sum of len(file.findings)
```

On any error the runner prints `{"ok": false, ..., "error": {"code", "message"}}`
and exits 1. It never prints a Python traceback. Error codes: `BAD_INPUT`,
`UNKNOWN_MODE`, `INTERNAL`.
