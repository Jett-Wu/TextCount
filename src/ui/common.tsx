/** Shared UI primitives: a formatted count, a segmented control and a modal dialog. */

import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useLocale } from '../app/state';
import { numberLocale } from '../locales';

interface NumberValueProps {
  value: number;
  class?: string;
}

const FORMATTERS = new Map<string, Intl.NumberFormat>();

/** Grouped digits; `.value` carries `tabular-nums` so the width never shifts. */
export function NumberValue({ value, class: className }: NumberValueProps) {
  const locale = useLocale();
  const key = numberLocale(locale);
  let formatter = FORMATTERS.get(key);
  if (formatter === undefined) {
    try {
      formatter = new Intl.NumberFormat(key);
    } catch {
      formatter = new Intl.NumberFormat('en-US');
    }
    FORMATTERS.set(key, formatter);
  }
  const text = Number.isFinite(value) ? formatter.format(Math.trunc(value)) : '0';
  return <span class={className === undefined ? 'value' : `value ${className}`}>{text}</span>;
}

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  name: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  name,
}: SegmentedProps<T>) {
  return (
    <div class="segmented" role="group" aria-label={ariaLabel} data-control={name}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            class={selected ? 'segmented__item segmented__item--on' : 'segmented__item'}
            aria-pressed={selected}
            title={option.title ?? option.label}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  labelledBy: string;
}

/** Uses the native `<dialog>` element, so focus trapping, the top layer and Esc come for free. */
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
