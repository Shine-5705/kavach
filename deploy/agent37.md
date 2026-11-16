# Running Kavach on Agent37

Status: **not deployed yet.** This is the recipe. Agent37 gives a $5 starter
credit only once a card is on file, so the account owner has to set that up.

Agent37 (https://www.agent37.com) hosts agents in isolated gVisor sandboxes
with a persistent disk, which suits a red/blue pair that should keep
re-attacking a target and keep every signed engagement record.

1. Create an Agent37 account and a sandbox from **"Your own Docker image"**
   (2 vCPU / 4 GB is plenty; the engine is standard-library Python).
2. Build and push the image from the repo root:
   `docker build -f deploy/Dockerfile -t <registry>/kavach:0.1 . && docker push <registry>/kavach:0.1`
3. Point the sandbox at the image. Optional env:
   `KAVACH_FLAGS="--band"` plus the BAND_* variables, `--lyzr` plus LYZR_*.
4. Records land in `/data` on the persistent disk. Import any of them into the
   hosted console (Engagements → Import JSON); the console refuses records
   whose hash chain does not verify.
