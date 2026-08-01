import type { AppConfig } from '../config/load-config.js';
import type { SettingsRepository } from '../db/repositories/settings.js';
import type { SourceCoordinator } from '../source/source-coordinator.js';
import type { XApi, XUser } from '../source/types.js';
import { XSource } from '../source/x-source.js';
import type { RuntimeUnit } from './runtime.js';

export type CredentialSource = 'environment' | 'database' | 'none';
export type SourceState =
  'demo' | 'unconfigured' | 'verified' | 'inactive' | 'monitoring' | 'degraded';

export type SourceStatus = {
  mode: 'demo' | 'x';
  state: SourceState;
  configured: boolean;
  active: boolean;
  credentialSource: CredentialSource;
  credentialEditable: boolean;
  profile?: XUser;
  lastErrorCode?: string;
};

export class SourceSetupError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SourceSetupError';
  }
}

type SourceServiceDependencies = {
  config: AppConfig;
  settings: SettingsRepository;
  demoCoordinator?: SourceCoordinator;
  createApi: (token: string) => XApi;
  createCoordinator: (api: XApi) => SourceCoordinator;
};

const tokenSetting = 'x.bearer-token';
const profileSetting = 'x.profile';
const verifiedSetting = 'x.verified-at';
const activeSetting = 'x.active';

const readProfile = (settings: SettingsRepository): XUser | undefined => {
  const value = settings.get(profileSetting);
  if (!value) return undefined;
  try {
    const candidate = JSON.parse(value) as Partial<XUser>;
    return typeof candidate.id === 'string' &&
      typeof candidate.name === 'string' &&
      typeof candidate.username === 'string' &&
      typeof candidate.protected === 'boolean'
      ? (candidate as XUser)
      : undefined;
  } catch {
    return undefined;
  }
};

export class SourceService implements RuntimeUnit {
  private started = false;
  private controller: AbortController | undefined;
  private completion: Promise<void> | undefined;
  private coordinator: SourceCoordinator | undefined;
  private state: SourceState;
  private lastErrorCode: string | undefined;

  public constructor(private readonly dependencies: SourceServiceDependencies) {
    this.coordinator = dependencies.demoCoordinator;
    this.state = dependencies.config.demoMode
      ? 'demo'
      : this.credentialSource() === 'none'
        ? 'unconfigured'
        : dependencies.settings.get(verifiedSetting)
          ? 'inactive'
          : 'unconfigured';
  }

  public status(): SourceStatus {
    const credentialSource = this.credentialSource();
    const active =
      this.dependencies.config.demoMode ||
      this.dependencies.settings.get(activeSetting) === 'true';
    const profile = this.dependencies.config.demoMode
      ? {
          id: '127000000000000001',
          name: 'Tibo',
          username: 'thsottiaux',
          protected: false,
        }
      : readProfile(this.dependencies.settings);

    return {
      mode: this.dependencies.config.demoMode ? 'demo' : 'x',
      state: this.state,
      configured: this.dependencies.config.demoMode || credentialSource !== 'none',
      active,
      credentialSource,
      credentialEditable:
        credentialSource !== 'environment' && !this.dependencies.config.demoMode,
      ...(profile ? { profile } : {}),
      ...(this.lastErrorCode ? { lastErrorCode: this.lastErrorCode } : {}),
    };
  }

  public async verify(token?: string): Promise<XUser> {
    if (this.dependencies.config.demoMode) {
      throw new SourceSetupError(
        'demo-mode-enabled',
        'X credentials are unavailable while demo mode is enabled',
      );
    }
    if (this.dependencies.config.xBearerToken && token) {
      throw new SourceSetupError(
        'credential-owned-by-environment',
        'The X credential is managed by the environment',
      );
    }

    const credential = this.dependencies.config.xBearerToken ?? token;
    if (!credential) {
      throw new SourceSetupError(
        'x-credential-required',
        'An X bearer token is required',
      );
    }

    const api = this.dependencies.createApi(credential);
    const source = new XSource(api);
    const profile = await source.prepare();
    await source.fetchLatest(profile.id);
    const streamController = new AbortController();
    try {
      await api.openFilteredStream(streamController.signal);
    } finally {
      streamController.abort();
    }

    await this.stopMonitoring();
    if (!this.dependencies.config.xBearerToken) {
      this.dependencies.settings.setSecret(tokenSetting, credential);
    }
    this.dependencies.settings.set(activeSetting, 'false');
    this.dependencies.settings.set(profileSetting, JSON.stringify(profile));
    this.dependencies.settings.set(verifiedSetting, new Date().toISOString());
    this.state = 'verified';
    this.lastErrorCode = undefined;
    return profile;
  }

  public async activate(): Promise<SourceStatus> {
    if (this.dependencies.config.demoMode) return this.status();
    if (!readProfile(this.dependencies.settings)) {
      throw new SourceSetupError(
        'x-credential-not-verified',
        'Verify the X credential before activating monitoring',
      );
    }
    const credential = this.readCredential();
    if (!credential) {
      throw new SourceSetupError(
        'x-credential-required',
        'An X bearer token is required',
      );
    }

    await this.stopMonitoring();
    this.coordinator = this.dependencies.createCoordinator(
      this.dependencies.createApi(credential),
    );
    this.dependencies.settings.set(activeSetting, 'true');
    this.state = 'inactive';
    this.lastErrorCode = undefined;
    if (this.started) this.launchMonitoring();
    return this.status();
  }

  public async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.dependencies.config.demoMode) {
      this.launchMonitoring();
      return;
    }
    if (this.dependencies.settings.get(activeSetting) !== 'true') return;
    const credential = this.readCredential();
    if (!credential) {
      this.state = 'unconfigured';
      return;
    }
    this.coordinator = this.dependencies.createCoordinator(
      this.dependencies.createApi(credential),
    );
    this.launchMonitoring();
  }

  public async stop(): Promise<void> {
    this.started = false;
    await this.stopMonitoring();
  }

  private credentialSource(): CredentialSource {
    if (this.dependencies.config.demoMode) return 'none';
    if (this.dependencies.config.xBearerToken) return 'environment';
    return this.dependencies.settings.getSecret(tokenSetting) ? 'database' : 'none';
  }

  private readCredential(): string | undefined {
    return (
      this.dependencies.config.xBearerToken ??
      this.dependencies.settings.getSecret(tokenSetting)
    );
  }

  private launchMonitoring(): void {
    if (!this.started || !this.coordinator || this.controller) return;
    this.controller = new AbortController();
    this.state = this.dependencies.config.demoMode ? 'demo' : 'monitoring';
    this.completion = this.coordinator.run(this.controller.signal).catch(() => {
      if (!this.controller?.signal.aborted) {
        this.state = 'degraded';
        this.lastErrorCode = 'source-stopped';
      }
    });
  }

  private async stopMonitoring(): Promise<void> {
    this.controller?.abort();
    await this.completion;
    this.controller = undefined;
    this.completion = undefined;
  }
}
