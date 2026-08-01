import { categoryValues, type Category } from '../schemas/category.js';
import { classificationRules } from './rules.js';
import { classifierVersion, type ClassificationResult } from './types.js';

const normalizeText = (text: string): string =>
  text.normalize('NFKC').toLocaleLowerCase('en-US');

export const classifyPost = (text: string): ClassificationResult => {
  const normalizedText = normalizeText(text);
  const matchedRules = classificationRules.filter((rule) => rule.matches(normalizedText));
  const matchedCategories = new Set<Category>(matchedRules.map((rule) => rule.category));

  return {
    version: classifierVersion,
    categories: categoryValues.filter((category) => matchedCategories.has(category)),
    matchedRuleIds: matchedRules.map((rule) => rule.id),
  };
};
