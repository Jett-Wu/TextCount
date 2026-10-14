/** Shared UI primitives: a formatted count and a segmented control. */

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
