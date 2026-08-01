import type { Category } from '../api/client.js';

const labels: Record<Category, string> = {
  codex: 'Codex',
  outages: 'Outage',
  'usage-limits': 'Usage limits',
};

export const CategoryBadge = ({ category }: { category: Category }) => (
  <span className={`category-badge category-badge--${category}`}>{labels[category]}</span>
);
