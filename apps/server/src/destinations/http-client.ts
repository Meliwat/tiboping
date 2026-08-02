export type HttpRequest = {
  method: 'POST';
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
  maxResponseBytes: number;
  redirect: 'manual';
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type HttpTransport = {
  send: (request: HttpRequest) => Promise<HttpResponse>;
};

const readBoundedBody = async (
  response: Response,
  maximumBytes: number,
): Promise<string> => {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new Error('Provider response is too large');
    }
    chunks.push(result.value);
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
};

export class FetchHttpTransport implements HttpTransport {
  private readonly fetchImplementation: typeof fetch;

  public constructor(options: { fetch?: typeof fetch } = {}) {
    this.fetchImplementation = options.fetch ?? fetch;
  }

  public async send(request: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const response = await this.fetchImplementation(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: request.redirect,
        signal: controller.signal,
      });
      return {
        status: response.status,
        headers: Object.fromEntries(
          [...response.headers.entries()].map(([key, value]) => [
            key.toLowerCase(),
            value,
          ]),
        ),
        body: await readBoundedBody(response, request.maxResponseBytes),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
