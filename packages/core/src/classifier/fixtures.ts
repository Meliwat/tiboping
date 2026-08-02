import type { ClassificationFixture } from './types.js';

export const classificationFixtures: readonly ClassificationFixture[] = [
  {
    name: 'classifies a Codex release',
    text: 'Codex CLI v2 is rolling out today.',
    categories: ['codex'],
    ruleIds: ['codex.keyword'],
  },
  {
    name: 'classifies a named model release',
    text: 'GPT-5.7 is shipping this morning.',
    categories: ['codex'],
    ruleIds: ['codex.model-release'],
  },
  {
    name: 'classifies an outage',
    text: 'We are investigating a service outage.',
    categories: ['outages'],
    ruleIds: ['outages.direct'],
  },
  {
    name: 'classifies recovery language',
    text: 'The service has recovered and traffic looks healthy.',
    categories: ['outages'],
    ruleIds: ['outages.recovery'],
  },
  {
    name: 'classifies a usage reset',
    text: "I've reset everyone's usage limits.",
    categories: ['usage-limits'],
    ruleIds: ['usage-limits.direct', 'usage-limits.reset'],
  },
  {
    name: 'classifies the big button as Codex usage news',
    text: 'I have a new kind of big button that I can press for Codex.',
    categories: ['codex', 'usage-limits'],
    ruleIds: ['codex.keyword', 'usage-limits.big-button'],
  },
  {
    name: 'classifies a multi-category incident',
    text: 'Codex is degraded while we repair the usage limit service.',
    categories: ['codex', 'outages', 'usage-limits'],
    ruleIds: ['codex.keyword', 'outages.direct', 'usage-limits.direct'],
  },
  {
    name: 'leaves an unrelated personal post unmatched',
    text: 'Beautiful weather for a long walk.',
    categories: [],
    ruleIds: [],
  },
  {
    name: 'does not treat dinner as an outage',
    text: 'I fixed dinner and it was excellent.',
    categories: [],
    ruleIds: [],
  },
  {
    name: 'does not treat clothing as a usage reset',
    text: 'The big red button on my jacket fell off.',
    categories: [],
    ruleIds: [],
  },
  {
    name: 'does not treat a playlist release as Codex',
    text: 'We released a playlist for the weekend.',
    categories: [],
    ruleIds: [],
  },
  {
    name: 'does not treat a coffee invitation as an outage',
    text: "I'm down for coffee tomorrow.",
    categories: [],
    ruleIds: [],
  },
];
