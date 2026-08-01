import type { ClassificationRule } from './types.js';

const has = (pattern: RegExp) => (text: string) => pattern.test(text);

const hasWithin = (left: string, right: string, distance = 64) => {
  const pattern = new RegExp(
    `(?:${left})[\\s\\S]{0,${distance}}(?:${right})|(?:${right})[\\s\\S]{0,${distance}}(?:${left})`,
    'u',
  );
  return has(pattern);
};

export const classificationRules: readonly ClassificationRule[] = [
  {
    id: 'codex.keyword',
    category: 'codex',
    matches: has(/\bcodex\b/u),
  },
  {
    id: 'codex.model-release',
    category: 'codex',
    matches: hasWithin(
      String.raw`\b(?:gpt[- ]?\d+(?:\.\d+)*|o\d+(?:[- ]mini)?|sol)\b`,
      String.raw`\b(?:ship(?:ped|ping)?|releas(?:e|ed|ing)|roll(?:out|ing)|sunset(?:ting)?|deprecat(?:e|ed|ing|ion))\b`,
    ),
  },
  {
    id: 'outages.direct',
    category: 'outages',
    matches: has(/\b(?:outage|incident|degrad(?:ed|ation)|unavailable)\b/u),
  },
  {
    id: 'outages.recovery',
    category: 'outages',
    matches: has(/\b(?:recover(?:ed|ing|y)|resolv(?:ed|ing)|restor(?:ed|ing|ation))\b/u),
  },
  {
    id: 'outages.contextual-state',
    category: 'outages',
    matches: hasWithin(
      String.raw`\b(?:codex|api|service|issue|outage|incident|latency)\b`,
      String.raw`\b(?:down|fixed|back up|offline|online again)\b`,
      48,
    ),
  },
  {
    id: 'usage-limits.direct',
    category: 'usage-limits',
    matches: has(
      /\b(?:usage limits?|rate limits?|quotas?|allowances?|token limits?|weekly limits?|credits?)\b/u,
    ),
  },
  {
    id: 'usage-limits.reset',
    category: 'usage-limits',
    matches: hasWithin(
      String.raw`\b(?:reset|refresh(?:ed|ing)?|replenish(?:ed|ing)?)\b`,
      String.raw`\b(?:usage|limits?|quotas?|allowances?|credits?|everyone|weekly)\b`,
      56,
    ),
  },
  {
    id: 'usage-limits.big-button',
    category: 'usage-limits',
    matches: has(/\bbig button\b/u),
  },
];
