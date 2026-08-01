const redacted = '[REDACTED]';
const sensitiveKey =
  /(?:authorization|cookie|password|secret|token|webhook|api[-_]?key)/iu;
const webhookUrl =
  /https:\/\/(?:hooks\.slack(?:-gov)?\.com\/services|(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks)\/[^\s"'<>]+/giu;

export type Redactor = (value: unknown) => unknown;

const replaceRegisteredSecrets = (value: string, secrets: readonly string[]): string => {
  let result = value.replace(webhookUrl, '[REDACTED_WEBHOOK_URL]');

  for (const secret of secrets) {
    result = result.split(secret).join(redacted);
  }

  return result;
};

export const createRedactor = (registeredSecrets: readonly string[] = []): Redactor => {
  const secrets = [...new Set(registeredSecrets.filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  );

  const visit = (value: unknown, key?: string): unknown => {
    if (key && sensitiveKey.test(key)) {
      return redacted;
    }

    if (typeof value === 'string') {
      return replaceRegisteredSecrets(value, secrets);
    }

    if (Array.isArray(value)) {
      return value.map((item) => visit(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [
          entryKey,
          visit(entryValue, entryKey),
        ]),
      );
    }

    return value;
  };

  return (value: unknown) => visit(value);
};
