export type Session = {
  authenticated: true;
  csrfToken: string;
  expiresAt: string;
};

type ApiErrorBody = {
  error?: { code?: string; message?: string };
};

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | undefined;

const rememberSession = (session: Session): Session => {
  csrfToken = session.csrfToken;
  return session;
};

export const forgetSession = (): void => {
  csrfToken = undefined;
};

export const apiRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (csrfToken && init.method && init.method !== 'GET') {
    headers.set('x-csrf-token', csrfToken);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
  const body = response.status === 204 ? undefined : ((await response.json()) as unknown);
  if (!response.ok) {
    if (response.status === 401) forgetSession();
    const error = body as ApiErrorBody | undefined;
    throw new ApiError(
      response.status,
      error?.error?.code ?? 'request-failed',
      error?.error?.message ?? 'TiboPing could not complete the request',
    );
  }
  return body as T;
};

export const authApi = {
  session: async (): Promise<Session> =>
    rememberSession(await apiRequest<Session>('/api/auth/session')),
  login: async (password: string): Promise<Session> =>
    rememberSession(
      await apiRequest<Session>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    ),
  logout: async (): Promise<void> => {
    await apiRequest<void>('/api/auth/logout', { method: 'POST' });
    forgetSession();
  },
};
