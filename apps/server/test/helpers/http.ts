import type {
  HttpRequest,
  HttpResponse,
  HttpTransport,
} from '../../src/destinations/http-client.js';

export class FakeHttpTransport implements HttpTransport {
  public readonly requests: HttpRequest[] = [];

  public constructor(private response: HttpResponse | Error) {}

  public setResponse(response: HttpResponse | Error): void {
    this.response = response;
  }

  public async send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

export const response = (
  status: number,
  headers: Record<string, string> = {},
  body = '',
): HttpResponse => ({ status, headers, body });

export const resolvePublicAddress = async (): Promise<string[]> => ['93.184.216.34'];
