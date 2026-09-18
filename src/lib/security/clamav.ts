import 'server-only';
import { createConnection } from 'node:net';

/** Connect only to an operator-configured private ClamAV service. No cloud upload. */
export async function scanWithClamAv(bytes: Uint8Array): Promise<void> {
  const host = process.env.CLAMAV_HOST;
  const port = Number(process.env.CLAMAV_PORT || 3310);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('scanner_unavailable');
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });
    let reply = '';
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    const deadline = setTimeout(() => finish(new Error('scanner_unavailable')), 30_000);
    socket.on('error', () => finish(new Error('scanner_unavailable')));
    socket.on('end', () => {
      if (!finished) finish(new Error('scanner_unavailable'));
    });
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < bytes.length; offset += 65_536) {
        const chunk = bytes.subarray(offset, Math.min(offset + 65_536, bytes.length));
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.byteLength);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', (chunk) => {
      reply += chunk.toString('utf8');
      if (reply.length > 4096) return finish(new Error('scanner_unavailable'));
      if (!reply.includes('\0')) return;
      const verdict = reply.slice(0, reply.indexOf('\0'));
      if (verdict === 'stream: OK') finish();
      else if (verdict.endsWith(' FOUND')) finish(new Error('upload_rejected'));
      else finish(new Error('scanner_unavailable'));
    });
  });
}
