export class RequestLimitError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** Limit actual streamed bytes, not just the client-controlled Content-Length. */
export async function readBoundedBody(request: Request, maxBytes: number, timeoutMs = 10_000) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new RequestLimitError(413, 'request_too_large');
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestLimitError(408, 'request_timeout'));
      void reader.cancel().catch(() => undefined);
    }, timeoutMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new RequestLimitError(413, 'request_too_large');
      }
      chunks.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
}
