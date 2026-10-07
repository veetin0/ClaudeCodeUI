# Harness team relay

Shares each teammate's Harness status (what they're working on, sessions, plan usage, HackForge
state) for the team board in event mode. It holds only the latest status per member, in memory,
keyed by a hash of the team token. No database, no dependencies.

**Option 1: host it from Harness.** In event mode → Team → *Create team* → *Host on this computer*.
Teammates on the same network join with the join code. Venue wifi often blocks laptop-to-laptop
traffic; if teammates can't connect, use a phone hotspot or option 2.

**Option 2: run it anywhere with Node 18+**

```bash
node relay/server.mjs          # PORT=8787 by default
# or: docker build -t harness-relay relay && docker run -p 8787:8787 harness-relay
```

Use a host that gives you HTTPS (Render, Fly.io, Railway, or a VPS behind Caddy). Then, in Harness:
*Create team* → *Use a relay server* → paste its URL (e.g. `https://our-relay.example.com`).
Check it's up with `curl https://our-relay.example.com/health`.

API: `PUT /v1/team/members/:id` (store my status, returns everyone's), `GET /v1/team`,
`DELETE /v1/team/members/:id`, all with `Authorization: Bearer <team token>`.
