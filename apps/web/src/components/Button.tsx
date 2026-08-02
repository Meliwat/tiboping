import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  variant?: 'primary' | 'quiet' | 'danger';
};

export const Button = ({
  children,
  loading = false,
  variant = 'primary',
  disabled,
  className = '',
  ...props
}: ButtonProps) => (
  <button
    className={`button button--${variant} ${className}`.trim()}
    disabled={disabled || loading}
    aria-busy={loading}
    {...props}
  >
    {loading ? <LoaderCircle aria-hidden="true" className="button__spinner" /> : null}
    <span className="button__label">{children}</span>
  </button>
);
