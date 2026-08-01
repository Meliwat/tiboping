import { describe, expect, it } from 'vitest';

import { classifyPost } from '../src/classifier/classify.js';
import { classificationFixtures } from '../src/classifier/fixtures.js';

describe('classifyPost', () => {
  it.each(classificationFixtures)('$name', ({ text, categories, ruleIds }) => {
    const result = classifyPost(text);

    expect(result.version).toBe(1);
    expect(result.categories).toEqual(categories);
    expect(result.matchedRuleIds).toEqual(expect.arrayContaining(ruleIds));
  });

  it('does not repeat a category when several rules match', () => {
    const result = classifyPost('Codex usage limits and quota reset are rolling out.');

    expect(result.categories).toEqual(['codex', 'usage-limits']);
    expect(new Set(result.categories).size).toBe(result.categories.length);
  });

  it('normalizes compatibility characters and casing', () => {
    expect(classifyPost('ＣＯＤＥＸ RELEASE').categories).toEqual(['codex']);
  });
});
