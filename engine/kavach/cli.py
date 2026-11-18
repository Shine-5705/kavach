"""kavach CLI.

  python -m kavach run [--out engagement.json] [--band] [--lyzr] [--categories a,b]
  python -m kavach band-check
  python -m kavach adal-pr engagement.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

from . import protocol as P
from .engagement import Engagement

COLORS = {"red": "\033[31m", "blue": "\033[34m"}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="kavach")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="run one red/blue engagement")
    r.add_argument("--out", default="engagement.json")
    r.add_argument("--band", action="store_true", help="mirror every message into a BAND room")
    r.add_argument("--lyzr", action="store_true", help="Blue's triage rationale from a Lyzr agent")
    r.add_argument("--categories", default="")
    r.add_argument("--quiet", action="store_true")
    sub.add_parser("band-check", help="verify both BAND agent keys")
    a = sub.add_parser("adal-pr", help="draft the remediation PR with AdaL")
    a.add_argument("record")
    v = sub.add_parser("verify", help="re-verify the hash chain of a saved engagement")
    v.add_argument("record")
    args = ap.parse_args(argv)

    if args.cmd == "band-check":
        from .adapters.band import BandTransport
        print(json.dumps(BandTransport.from_env().check(), indent=2))
        return 0
    if args.cmd == "verify":
        rec = json.load(open(args.record))
        res = P.verify_chain(rec["messages"])
        print(json.dumps(res))
        return 0 if res["ok"] else 1
    if args.cmd == "adal-pr":
        from .adapters import adal
        import shutil
        d = os.path.dirname(os.path.abspath(args.record))
        if os.path.basename(args.record) != "engagement.json":
            shutil.copy(args.record, os.path.join(d, "engagement.json"))
        print(json.dumps(adal.run(adal.PR_PROMPT, cwd=d), indent=2)[:4000])
        return 0

    transport = reasoner = None
    if args.band:
        from .adapters.band import BandTransport
        transport = BandTransport.from_env()
    if args.lyzr:
        from .adapters.lyzr import LyzrReasoner
        reasoner = LyzrReasoner()
    eid = "eng-" + time.strftime("%Y%m%d-%H%M%S")
    cats = [c for c in args.categories.split(",") if c] or None
    e = Engagement(eid, categories=cats, transport=transport, reasoner=reasoner)
    for m in e.run():
        if not args.quiet:
            c = COLORS.get(m["from"], "")
            print(f"{m['seq']:>3} {c}{m['from']:>4}\033[0m -> {m['to']:<4} {m['type']:<9} {m['summary']}")
    rec = e.record()
    rec["transport"] = {"band": {"room": transport.room_id, "sent": transport.sent, "waf_encoded": transport.encoded, "errors": transport.errors}} if transport else None
    rec["reasoner"] = "lyzr" if reasoner else "offline"
    with open(args.out, "w") as fh:
        json.dump(rec, fh, indent=1, ensure_ascii=False)
    print(f"\nchain {'verified' if rec['chain']['ok'] else 'BROKEN'} · {len(rec['messages'])} messages · head {rec['chain'].get('head','')[:16]} · saved {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
