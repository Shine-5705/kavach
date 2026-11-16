import copy
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from kavach import protocol as P
from kavach.engagement import Engagement, run_all
from kavach.red import ATTACKS, Red
from kavach.target.paisapal import PaisaPal


class TargetIsVulnerable(unittest.TestCase):
    def test_every_attack_and_variant_lands_unguarded(self):
        red = Red(PaisaPal)
        for a in ATTACKS:
            for steps in [a["steps"]] + [v["steps"] for v in a["variants"]]:
                self.assertTrue(red.execute(steps, a["oracle"])["success"], (a["id"], steps))

    def test_benign_traffic_works_unguarded(self):
        u = Red(PaisaPal).utility()
        self.assertEqual(u["passed"], u["total"])


class Engagements(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rec = run_all(engagement_id="eng-test")

    def test_all_findings_verified_and_nothing_lands_after(self):
        self.assertTrue(all(f["status"] == "verified" for f in self.rec["findings"]))
        self.assertEqual(self.rec["metrics"]["final_attack_success"]["succeeded"], 0)

    def test_utility_preserved(self):
        self.assertEqual(self.rec["metrics"]["utility_after"], self.rec["metrics"]["utility_total"])

    def test_escalation_happens_on_real_bypass(self):
        results = [m for m in self.rec["messages"] if m["type"] == "RESULT" and m["thread"] == "PI-01"]
        self.assertGreaterEqual(len(results), 2)
        self.assertTrue(any(r["outcome"] == "bypassed" for r in results[0]["body"]["results"]))

    def test_chain_verifies_and_detects_tampering(self):
        self.assertTrue(P.verify_chain(self.rec["messages"])["ok"])
        bad = copy.deepcopy(self.rec["messages"])
        bad[10]["body"]["severity"] = "low"
        self.assertEqual(P.verify_chain(bad)["broken_at"], 11)
        dropped = self.rec["messages"][:5] + self.rec["messages"][6:]
        self.assertFalse(P.verify_chain(dropped)["ok"])

    def test_finch_code_fix_verified(self):
        patch = next(m for m in self.rec["messages"] if m["type"] == "PATCH" and m["thread"] == "SQL-01")
        cf = patch["body"]["code_fix"]
        self.assertEqual((cf["finch_sql_injection_before"], cf["finch_sql_injection_after"]), (1, 0))


class _Mock(BaseHTTPRequestHandler):
    calls = []

    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        _Mock.calls.append((self.path, self.headers["X-API-Key"], body))
        if self.path == "/api/v1/agent/chats":
            return self._send(201, {"data": {"id": "room-1"}})
        return self._send(201, {"data": {"id": "x"}})

    def log_message(self, *a):
        pass


class BandTransportAgainstMock(unittest.TestCase):
    """Exercises request shapes against a local mock of BAND's documented REST API (not BAND itself)."""

    def test_mirror(self):
        from kavach.adapters.band import BandTransport
        srv = HTTPServer(("127.0.0.1", 0), _Mock)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        t = BandTransport("rid", "rkey", "bid", "bkey", rest_url=f"http://127.0.0.1:{srv.server_port}")
        e = Engagement("eng-band", categories=["sqli"], transport=t)
        n = sum(1 for _ in e.run())
        srv.shutdown()
        self.assertEqual(t.errors, [])
        self.assertEqual(t.sent, n)
        paths = [c[0] for c in _Mock.calls]
        self.assertEqual(paths[0], "/api/v1/agent/chats")
        self.assertEqual(paths[1], "/api/v1/agent/chats/room-1/participants")
        first = _Mock.calls[2]
        self.assertEqual(first[1], "rkey")  # HELLO from red, signed with red's key
        self.assertEqual(first[2]["message"]["mentions"][0]["id"], "bid")
        self.assertIn("@blue", first[2]["message"]["content"])


if __name__ == "__main__":
    unittest.main()
