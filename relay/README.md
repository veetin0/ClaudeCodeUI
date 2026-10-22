# Harness team relay

Where a Harness team meets: each teammate's status (what they're working on, sessions, plan usage,
HackForge state, crew missions) and the files crew mode moves between laptops (the project out to
the crew, each mission's work back, as git bundles). Everything is encrypted with the team key on
the laptops; the relay holds only the latest status per member and the files (up to 40 MB each,
200 MB per team, gone after 12 hours), in memory, keyed by a hash of the team token. No database,
no dependencies. In Harness, put its address in **Settings → Team server**: every team you start
then uses it.

**Option 1: host it from Harness.** In event mode → Team → *Create team* → *Host on this computer*.
Teammates on the same network join with the join code. Venue wifi often blocks laptop-to-laptop
traffic; if teammates can't connect, use a phone hotspot or option 2.

**Option 2 (recommended for the venue): one click on Render, free.** Open
[render.com/deploy?repo=https://github.com/veetin0/ClaudeCodeUI](https://render.com/deploy?repo=https://github.com/veetin0/ClaudeCodeUI),
sign in with GitHub and press *Deploy*. It builds only `relay/` (see `render.yaml`) and gives you an
HTTPS address like `https://harness-relay-xxxx.onrender.com`. Use that in *Create team* → *Use a
relay server*. The free plan sleeps after 15 minutes without traffic and takes about a minute to
wake up (Harness waits for it); while the team is connected it stays awake. Deploy and test it
before the event: open `<address>/health` in a browser and you should see `{"ok":true,…}`.

**Option 3: run it anywhere with Node 18+**

```bash
node relay/server.mjs          # PORT=8787 by default
# or: docker build -t harness-relay relay && docker run -p 8787:8787 harness-relay
```

Use a host that gives you HTTPS (Render, Fly.io, Railway, or a VPS behind Caddy). Then, in Harness:
*Create team* → *Use a relay server* → paste its URL (e.g. `https://our-relay.example.com`).
Check it's up with `curl https://our-relay.example.com/health`.

API: `PUT /v1/team/members/:id` (store my status, returns everyone's), `GET /v1/team`,
`DELETE /v1/team/members/:id`, all with `Authorization: Bearer <team token>`.
Each returned status carries `seenMsAgo` (on the relay's clock), so online/offline doesn't depend on
teammates' laptop clocks agreeing.
