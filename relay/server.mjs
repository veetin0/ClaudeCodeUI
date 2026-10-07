#!/usr/bin/env node
// Standalone team relay: `node relay/server.mjs` (PORT, default 8787). Put it behind HTTPS when it's
// on the internet (most hosts do this for you); the team token is the only credential.
import { createServer } from 'node:http'
import { createRelay } from './relay.mjs'

const port = Number(process.env.PORT) || 8787
createServer(createRelay()).listen(port, '0.0.0.0', () => console.log(`Harness team relay on :${port}`))
