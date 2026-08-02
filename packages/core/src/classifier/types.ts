import type { Category } from '../schemas/category.js';

export const classifierVersion = 1 as const;

export type ClassificationRule = {
  id: string;
  category: Category;
  matches: (normalizedText: string) => boolean;
};

export type ClassificationResult = {
  version: typeof classifierVersion;
  categories: Category[];
  matchedRuleIds: string[];
};

export type ClassificationFixture = {
  name: string;
  text: string;
  categories: Category[];
  ruleIds: string[];
};
