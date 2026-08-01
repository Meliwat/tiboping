import { describe, expect, it } from 'vitest';

import { parseXStream, XStreamStalledError } from '../../src/source/x-stream-parser.js';

const streamFromChunks = (chunks: string[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });

describe('parseXStream', () => {
  it('parses JSON split across arbitrary chunks and ignores blank keepalives', async () => {
    const stream = streamFromChunks([
      '\r\n{"data":{"id":"1",',
      '"text":"first"}}\n\n{"data":{"id":"2","text":"second"}}',
      '\r\n',
    ]);

    await expect(Array.fromAsync(parseXStream(stream))).resolves.toEqual([
      { data: { id: '1', text: 'first' } },
      { data: { id: '2', text: 'second' } },
    ]);
  });

  it('rejects malformed non-keepalive lines', async () => {
    await expect(
      Array.fromAsync(parseXStream(streamFromChunks(['not-json\n']))),
    ).rejects.toThrow(/invalid JSON/iu);
  });

  it('detects a stalled stream with no data or keepalive', async () => {
    const stream = new ReadableStream<Uint8Array>({ start() {} });

    const error = await Array.fromAsync(
      parseXStream(stream, { heartbeatTimeoutMs: 5 }),
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(XStreamStalledError);
  });
});
