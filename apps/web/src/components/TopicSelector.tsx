import { Code2, Gauge, Siren } from 'lucide-react';

import type { Category, Routing } from '../api/client.js';

const topics: Array<{
  id: Category;
  label: string;
  detail: string;
  icon: typeof Code2;
}> = [
  {
    id: 'codex',
    label: 'Codex + releases',
    detail: 'Features, models, rollouts, deprecations',
    icon: Code2,
  },
  {
    id: 'outages',
    label: 'Outages',
    detail: 'Incidents, degraded service, recovery',
    icon: Siren,
  },
  {
    id: 'usage-limits',
    label: 'Usage limits + resets',
    detail: 'Quotas, credits, capacity, big buttons',
    icon: Gauge,
  },
];

export const TopicSelector = ({
  value,
  onChange,
}: {
  value: Routing;
  onChange: (routing: Routing) => void;
}) => {
  const selected = value.mode === 'categories' ? value.categories : [];
  const toggle = (category: Category) => {
    const next = selected.includes(category)
      ? selected.filter((item) => item !== category)
      : [...selected, category];
    if (next.length > 0) onChange({ mode: 'categories', categories: next });
  };

  return (
    <div className="topic-selector">
      <label className="topic-selector__everything">
        <input
          type="radio"
          name="routing-mode"
          checked={value.mode === 'everything'}
          onChange={() => onChange({ mode: 'everything' })}
        />
        <span>
          <strong>Everything Tibo posts</strong>
          <small>Includes personal and unmatched posts too.</small>
        </span>
      </label>

      <div className="topic-selector__divider">
        <span>or tune the desk</span>
      </div>

      <div className="topic-selector__grid">
        {topics.map((topic) => {
          const Icon = topic.icon;
          const checked = selected.includes(topic.id);
          return (
            <label key={topic.id}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(topic.id)}
              />
              <span>
                <Icon size={20} aria-hidden="true" />
                <strong>{topic.label}</strong>
                <small>{topic.detail}</small>
              </span>
            </label>
          );
        })}
      </div>
      <p className="topic-selector__note">
        Multi-category posts still create only one notification per destination.
      </p>
    </div>
  );
};
