export type ToastKind = 'success' | 'info' | 'error';

interface ToastProps {
  message: string;
  kind: ToastKind;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

export default function Toast({
  message,
  kind,
  onClose,
  actionLabel,
  onAction
}: ToastProps): JSX.Element {
  return (
    <div className={`toast toast-${kind}`} role="status" aria-live="polite">
      <span>{message}</span>
      <div className="toast-actions">
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="toast-action-btn">
            {actionLabel}
          </button>
        ) : null}
        <button type="button" onClick={onClose} className="toast-close">
          Fermer
        </button>
      </div>
    </div>
  );
}
