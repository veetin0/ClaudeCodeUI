import type { IncomingMessage, ServerResponse } from 'node:http'
export declare function createRelay(opts?: {
  now?: () => number
  maxBlob?: number
  teamBlobBytes?: number
  totalBlobBytes?: number
}): (req: IncomingMessage, res: ServerResponse) => void
