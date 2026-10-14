/**
 * A compact segmented control.
 *
 * Used for the two-or-three-way choices in the interface (theme, language, counting rules).
 * Implemented as toggle buttons in a labelled group rather than as tabs, because each option is
 * an independent setting rather than a panel switch.
 */
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
