# Vendored Finch skills

Copied unmodified from FinchTech-AI's public skill repositories (MIT, see
each LICENSE):

- `code-security-audit`: https://github.com/FinchTech-AI/code-security-audit
- `pii-redactor`: https://github.com/FinchTech-AI/pii-redactor

Kavach imports each skill's module and calls its `run(input)` entry point
in-process (CPython or Pyodide). See `engine/kavach/skills/finch.py`.
