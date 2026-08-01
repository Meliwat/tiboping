import { forwardRef, useId, type InputHTMLAttributes } from 'react';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, error, id, className = '', ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const detailId = `${inputId}-detail`;

    return (
      <div className={`field ${className}`.trim()}>
        <label className="field__label" htmlFor={inputId}>
          {label}
        </label>
        <input
          ref={ref}
          className="field__input"
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? detailId : undefined}
          {...props}
        />
        {error || hint ? (
          <span
            className={`field__detail ${error ? 'field__detail--error' : ''}`}
            id={detailId}
            role={error ? 'alert' : undefined}
          >
            {error ?? hint}
          </span>
        ) : null}
      </div>
    );
  },
);

Field.displayName = 'Field';
