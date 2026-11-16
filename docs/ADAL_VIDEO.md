# Demo video with AdaL

The hackathon asks for demo videos made with AdaL (https://adalagent.ai).
AdaL needs the owner's sign-in, so this is the brief to run once signed in.
The screen recording in the repo release was captured with Playwright from
the live console and can be AdaL's source footage.

```bash
curl -fsSL https://adal.sylph.ai/install.sh | bash
adal            # sign in once in the browser
cd media && adal -q "$(cat ../docs/adal-video-prompt.txt)"
```

Brief (docs/adal-video-prompt.txt): a 2-minute launch film for Kavach, problem
in the first 20 seconds (AI support agents can be talked into leaking data
and moving money), then the live engagement timeline, the PI-01 bypass and
escalation, the Finch-verified SQL fix, the sandbox indirect-injection replay
with defenses off and on, and the closing numbers. Use only the supplied
screen recording and screenshots; no stock footage and no invented metrics.
