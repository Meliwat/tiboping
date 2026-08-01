import { X } from 'lucide-react';

import { Button } from './Button.js';

export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="confirm-dialog__close" type="button" onClick={onCancel}>
          <X aria-hidden="true" />
          <span className="sr-only">Close dialog</span>
        </button>
        <p className="eyebrow eyebrow--dark">Confirm operation</p>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="confirm-dialog__actions">
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
};
