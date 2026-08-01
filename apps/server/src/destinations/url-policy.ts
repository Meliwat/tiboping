import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type ResolveAddresses = (hostname: string) => Promise<string[]>;

export type UrlPolicyOptions = {
  provider: 'slack' | 'discord' | 'generic';
  allowPrivate: boolean;
  resolveAddresses?: ResolveAddresses;
};

const defaultResolveAddresses: ResolveAddresses = async (hostname) => {
  if (isIP(hostname)) return [hostname];
  return (await lookup(hostname, { all: true, verbatim: true })).map(
    ({ address }) => address,
  );
};

const isNonRoutableIpv4 = (address: string): boolean => {
  const octets = address.split('.').map(Number);
  const [first, second, third] = octets;
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet)))
    return true;
  if (first === undefined || second === undefined || third === undefined) return true;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
};

const isNonRoutableIpv6 = (address: string): boolean => {
  const normalized = address.toLowerCase().split('%')[0] ?? '';
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return isIP(mapped) !== 4 || isNonRoutableIpv4(mapped);
  }
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/u.test(normalized) ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:')
  );
};

const isNonRoutableAddress = (address: string): boolean => {
  const version = isIP(address);
  return version === 4
    ? isNonRoutableIpv4(address)
    : version === 6
      ? isNonRoutableIpv6(address)
      : true;
};

const validateProviderShape = (
  url: URL,
  provider: UrlPolicyOptions['provider'],
): void => {
  if (url.username || url.password)
    throw new Error('Webhook URLs cannot contain credentials');

  if (provider === 'slack') {
    const hostAllowed = ['hooks.slack.com', 'hooks.slack-gov.com'].includes(url.hostname);
    if (!hostAllowed || !/^\/services\/[^/]+\/[^/]+\/[^/]+$/u.test(url.pathname)) {
      throw new Error('Expected an official Slack incoming webhook URL');
    }
  }

  if (provider === 'discord') {
    const hostAllowed = [
      'discord.com',
      'canary.discord.com',
      'ptb.discord.com',
      'discordapp.com',
      'canary.discordapp.com',
      'ptb.discordapp.com',
    ].includes(url.hostname);
    if (!hostAllowed || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/u.test(url.pathname)) {
      throw new Error('Expected an official Discord incoming webhook URL');
    }
  }
};

export const assertOutboundUrl = async (
  value: string,
  options: UrlPolicyOptions,
): Promise<URL> => {
  const url = new URL(value);
  const protocolAllowed =
    url.protocol === 'https:' || (options.allowPrivate && url.protocol === 'http:');
  if (!protocolAllowed) throw new Error('Webhook URLs must use HTTPS');
  validateProviderShape(url, options.provider);

  if (!options.allowPrivate) {
    const addresses = await (options.resolveAddresses ?? defaultResolveAddresses)(
      url.hostname,
    );
    if (addresses.length === 0 || addresses.some(isNonRoutableAddress)) {
      throw new Error('Webhook hostname resolves to a private or non-routable address');
    }
  }

  return url;
};
