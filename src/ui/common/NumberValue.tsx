/**
 * A count rendered with grouping separators.
 *
 * The `.value` class carries `font-variant-numeric: tabular-nums`, so the digits do not change
 * width as the number grows — the labels stay still while the user types.
 */
import { formatInteger } from '../../app/format';
import { useLocale } from '../../app/useTranslate';

interface NumberValueProps {
  value: number;
  class?: string;
}

export function NumberValue({ value, class: className }: NumberValueProps) {
  const locale = useLocale();
  return (
    <span class={className === undefined ? 'value' : `value ${className}`}>
      {formatInteger(value, locale)}
    </span>
  );
}
