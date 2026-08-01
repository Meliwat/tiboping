import { Check } from 'lucide-react';

const steps = ['Source', 'Destination', 'Topics', 'Test', 'Go live'];

export const StepIndicator = ({ current }: { current: number }) => (
  <nav className="setup-steps" aria-label="Setup progress">
    <ol>
      {steps.map((label, index) => {
        const complete = index < current;
        const active = index === current;
        return (
          <li
            className={`${active ? 'setup-steps__item--active' : ''} ${complete ? 'setup-steps__item--complete' : ''}`.trim()}
            key={label}
            aria-current={active ? 'step' : undefined}
          >
            <span className="setup-steps__number">
              {complete ? <Check size={13} aria-hidden="true" /> : index + 1}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  </nav>
);
