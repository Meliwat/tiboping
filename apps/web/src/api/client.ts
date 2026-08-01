export type Session = {
  authenticated: true;
  csrfToken: string;
  expiresAt: string;
};

export type Category = 'codex' | 'outages' | 'usage-limits';
export type Routing =
  { mode: 'everything' } | { mode: 'categories'; categories: Category[] };
export type DestinationType = 'slack' | 'discord' | 'generic';

export type Destination = {
  id: string;
  type: DestinationType;
  name: string;
  routing: Routing;
  state: 'active' | 'paused';
  pauseReason?: string;
  hasConfiguration: true;
  createdAt: string;
  updatedAt: string;
};

export type SourceStatus = {
  mode: 'demo' | 'x';
  state: 'demo' | 'unconfigured' | 'verified' | 'inactive' | 'monitoring' | 'degraded';
  configured: boolean;
  active: boolean;
  credentialSource: 'environment' | 'database' | 'none';
  credentialEditable: boolean;
  profile?: { id: string; name: string; username: string; protected: boolean };
  lastErrorCode?: string;
};

export type SetupStatus = {
  complete: boolean;
  source: SourceStatus;
  destinations: { count: number; testedCount: number };
  readyToActivate: boolean;
};

export type DeliveryOutcome =
  | { kind: 'success' }
  | { kind: 'retry'; code: string; message: string; retryAfterMs?: number }
  | { kind: 'permanent-failure'; code: string; message: string };

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

export const setupApi = {
  status: async (): Promise<SetupStatus> => apiRequest<SetupStatus>('/api/setup'),
  verifyX: async (token?: string): Promise<{ source: SourceStatus }> =>
    apiRequest<{ source: SourceStatus }>('/api/setup/x/verify', {
      method: 'POST',
      body: JSON.stringify(token ? { token } : {}),
    }),
  activate: async (): Promise<SetupStatus> =>
    apiRequest<SetupStatus>('/api/setup/activate', { method: 'POST' }),
};

export type DestinationDraft = {
  type: DestinationType;
  name: string;
  endpoint: string;
};

export const destinationApi = {
  list: async (): Promise<{ items: Destination[] }> =>
    apiRequest<{ items: Destination[] }>('/api/destinations'),
  create: async (
    draft: DestinationDraft,
  ): Promise<{ destination: Destination; signingSecret?: string }> =>
    apiRequest<{ destination: Destination; signingSecret?: string }>(
      '/api/destinations',
      {
        method: 'POST',
        body: JSON.stringify({
          type: draft.type,
          name: draft.name,
          ...(draft.type === 'generic'
            ? { url: draft.endpoint }
            : { webhookUrl: draft.endpoint }),
          routing: { mode: 'everything' },
        }),
      },
    ),
  updateRouting: async (
    id: string,
    routing: Routing,
  ): Promise<{ destination: Destination }> =>
    apiRequest<{ destination: Destination }>(`/api/destinations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ routing }),
    }),
  updateConfiguration: async (
    id: string,
    draft: DestinationDraft,
  ): Promise<{ destination: Destination }> =>
    apiRequest<{ destination: Destination }>(`/api/destinations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: draft.name,
        ...(draft.type === 'generic'
          ? { url: draft.endpoint }
          : { webhookUrl: draft.endpoint }),
      }),
    }),
  test: async (id: string): Promise<{ outcome: DeliveryOutcome }> =>
    apiRequest<{ outcome: DeliveryOutcome }>(`/api/destinations/${id}/test`, {
      method: 'POST',
    }),
};
