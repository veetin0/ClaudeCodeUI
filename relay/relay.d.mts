import type { IncomingMessage, ServerResponse } from 'node:http'
export declare function createRelay(opts?: { now?: () => number }): (req: IncomingMessage, res: ServerResponse) => void
