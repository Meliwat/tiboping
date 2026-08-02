import { TriangleAlert } from 'lucide-react';

export const ErrorNotice = ({
  title = 'Signal interrupted',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) => (
  <div className="error-notice" role="alert">
    <TriangleAlert aria-hidden="true" />
    <div>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
    {onRetry ? (
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    ) : null}
  </div>
);
