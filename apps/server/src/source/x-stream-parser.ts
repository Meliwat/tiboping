export class XStreamStalledError extends Error {
  public constructor() {
    super('X filtered stream stopped sending data or keepalives');
    this.name = 'XStreamStalledError';
  }
}

const readWithTimeout = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new XStreamStalledError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const parseLine = (line: string): unknown | undefined => {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    throw new Error('X filtered stream returned invalid JSON', { cause: error });
  }
};

export async function* parseXStream(
  stream: ReadableStream<Uint8Array>,
  options: { heartbeatTimeoutMs?: number } = {},
): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 25_000;
  let buffer = '';

  try {
    while (true) {
      const result = await readWithTimeout(reader, heartbeatTimeoutMs);
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });

      while (true) {
        const newline = buffer.indexOf('\n');
        if (newline < 0) break;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const parsed = parseLine(line);
        if (parsed !== undefined) yield parsed;
      }
    }

    buffer += decoder.decode();
    const parsed = parseLine(buffer);
    if (parsed !== undefined) yield parsed;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
