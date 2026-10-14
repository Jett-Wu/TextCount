/**
 * Number formatting for the UI.
 *
 * Counts are rendered with grouping separators so a seven-digit number stays readable, and the
 * `tabular-nums` CSS on the value elements keeps the width stable while the digits change.
 */
import { numberLocale, type LocaleId } from '../locales';

const CACHE = new Map<string, Intl.NumberFormat>();

function formatterFor(locale: LocaleId): Intl.NumberFormat {
  const key = numberLocale(locale);
  let formatter = CACHE.get(key);
  if (formatter === undefined) {
    try {
      formatter = new Intl.NumberFormat(key);
    } catch {
      formatter = new Intl.NumberFormat('en-US');
    }
    CACHE.set(key, formatter);
  }
  return formatter;
}

/** Groups a non-negative integer for display. */
export function formatInteger(value: number, locale: LocaleId): string {
  if (!Number.isFinite(value)) return '0';
  return formatterFor(locale).format(Math.trunc(value));
}
