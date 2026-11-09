import { createServer, type AddressInfo, type Server } from 'node:net'

/**
 * Ports the OS says are free right now. A random port in the 46000s-48000s can clash with an
 * ephemeral port another connection is using (Linux hands those out from 32768-60999).
 */
export async function freePorts(n = 1): Promise<number[]> {
  const servers = await Promise.all(
    Array.from(
      { length: n },
      () =>
        new Promise<Server>((resolve, reject) => {
          const s = createServer()
          s.once('error', reject)
          s.listen(0, () => resolve(s))
        }),
    ),
  )
  const ports = servers.map((s) => (s.address() as AddressInfo).port)
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))))
  return ports
}
