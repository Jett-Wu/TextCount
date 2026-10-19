/** Shared UI primitives: a formatted count and a segmented control. */

import { useLocale } from '../app/state';
import { numberLocale } from '../locales';
import { useLayoutEffect, useRef } from 'preact/hooks';

/** Measure only controls: unequal translated labels must not move the highlight off its target. */
export function useSelectionIndicator(selection: string) {
  const ref = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const update = () => {
    const track = ref.current;
    const selected = track?.querySelector<HTMLButtonElement>(
      'button[aria-pressed="true"], button[aria-selected="true"]',
    );
    if (!track || !selected) return;
    track.style.setProperty('--selection-x', `${selected.offsetLeft}px`);
    track.style.setProperty('--selection-width', `${selected.offsetWidth}px`);
    track.dataset['indicatorReady'] = 'true';
  };
  useLayoutEffect(update, [selection, locale]);
  useLayoutEffect(() => {
    const track = ref.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(track);
    for (const button of track.querySelectorAll('button')) observer.observe(button);
    return () => observer.disconnect();
  }, []);
  return ref;
}

export function Icon({ name }: { name: 'copy' | 'clear' | 'shield' | 'chevron' | 'language' | 'monitor' | 'sun' | 'moon' | 'github' | 'system' | 'check' | 'import' | 'close' }) {
  if (name === 'system') {
    return (
      <svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="10" cy="10" r="5" />
        <path d="M10 5a5 5 0 0 1 0 10Z" fill="currentColor" stroke="none" />
        <path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.6 3.6 5 5M15 15l1.4 1.4M3.6 16.4 5 15M15 5l1.4-1.4" stroke-linecap="round" />
      </svg>
    );
  }
  const paths = {
    import: 'M4 12v5h12v-5 M10 3v10 M6 7l4-4 4 4',
    close: 'M5 5l10 10 M15 5 5 15',
    copy: 'M7 7h10v11H7z M4 13V3h10',
    clear: 'M4 6h12 M8 6V3h4v3 M6 6l1 12h6l1-12 M9 9v6 M11 9v6',
    shield: 'M10 2l6 3v5c0 4-6 8-6 8s-6-4-6-8V5z M7 10l2 2 4-4',
    chevron: 'M6 8l4 4 4-4',
    check: 'M5 10l3 3 7-7',
    language: 'M2 4h10 M7 2v2 M4 4c0 5 3 7 6 9 M10 4c0 5-3 7-7 9 M11 18l4-10 4 10 M12.5 14h5',
    monitor: 'M3 3h14v10H3z M10 13v4 M6 17h8',
    sun: 'M10 1v2 M10 17v2 M1 10h2 M17 10h2 M3.6 3.6l1.4 1.4 M15 15l1.4 1.4 M3.6 16.4L5 15 M15 5l1.4-1.4 M14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    moon: 'M17 12A7.5 7.5 0 0 1 8 3a7.5 7.5 0 1 0 9 9z',
    github: 'M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.043-1.61-4.043-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.084 1.838 1.237 1.838 1.237 1.07 1.835 2.809 1.305 3.493.998.108-.776.418-1.305.762-1.605-2.665-.303-5.467-1.334-5.467-5.933 0-1.31.469-2.381 1.236-3.221-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.301 1.23a11.5 11.5 0 0 1 6.006 0c2.291-1.552 3.297-1.23 3.297-1.23.655 1.652.243 2.873.12 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.806 5.625-5.479 5.922.43.372.823 1.102.823 2.222 0 1.606-.015 2.9-.015 3.293 0 .322.216.694.825.576C20.565 21.795 24 17.3 24 12c0-6.627-5.373-12-12-12z',
  };
  return (
    <svg class="icon" viewBox={name === 'github' ? '0 0 24 24' : '0 0 20 20'}
      fill={name === 'github' ? 'currentColor' : 'none'} stroke={name === 'github' ? 'none' : 'currentColor'}
      stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

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
