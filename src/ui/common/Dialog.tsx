/**
 * Modal dialog built on the native `<dialog>` element.
 *
 * Using the real element means focus trapping, the top layer, `Esc` handling and inert
 * background content all come from the browser instead of from hand-written code.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  labelledBy: string;
}

export function Dialog({ open, title, onClose, children, labelledBy }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (open && !element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.setAttribute('open', '');
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      class="dialog"
      aria-labelledby={labelledBy}
      onClose={() => onClose()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div class="dialog__head">
        <h2 class="dialog__title" id={labelledBy}>
          {title}
        </h2>
        <button type="button" class="btn btn--ghost" onClick={() => onClose()}>
          ✕
        </button>
      </div>
      <div class="dialog__body">{children}</div>
    </dialog>
  );
}
