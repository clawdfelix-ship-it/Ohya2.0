#!/usr/bin/env python3
import subprocess, pathlib, os

root = pathlib.Path.home() / ".openclaw/workspace-coding-qwen"
proj = root / "Ohya2.0"
token = None
for line in (root / ".env").read_text().splitlines():
    if line.startswith("VERCEL_TOKEN="):
        token = line.split("=", 1)[1].strip().strip('"').strip("'")

env = dict(os.environ)
env["TOKEN"] = token
cmd = ["npx", "--yes", "vercel@latest", "pull", "--yes",
       "--environment=production", "--token", token]
r = subprocess.run(cmd, cwd=proj, env=env, capture_output=True, text=True)
print(r.stdout[-1500:])
print(r.stderr[-500:])
f = proj / ".vercel/.env.development.local"
if f.exists():
    txt = f.read_text()
    print("DATABASE_URL lines:", sum("DATABASE_URL" in l for l in txt.splitlines()))
else:
    print("no pulled file")
