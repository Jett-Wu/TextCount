/**
 * A minimal observable store.
 *
 * The user's text is deliberately NOT held here: a multi-megabyte string must never be part of
 * a reactive state object that the whole component tree re-reads. Only small, derived values
 * (counts, flags, the current settings) live in the store, and components subscribe to the
 * slices they actually render.
 */
import { useEffect, useRef, useState } from 'preact/hooks';

export type Listener = () => void;

export class Store<T extends object> {
  private state: T;
  private readonly listeners = new Set<Listener>();

  constructor(initial: T) {
    this.state = initial;
  }

  get(): T {
    return this.state;
  }

  /** Shallow-merges a patch. Returns true when at least one field actually changed. */
  set(patch: Partial<T> | ((previous: T) => Partial<T>)): boolean {
    const resolved = typeof patch === 'function' ? patch(this.state) : patch;
    let changed = false;
    for (const key of Object.keys(resolved) as (keyof T)[]) {
      if (!Object.is(this.state[key], resolved[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return false;
    this.state = { ...this.state, ...resolved };
    for (const listener of [...this.listeners]) listener();
    return true;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

/**
 * Subscribes to one slice of a store.
 *
 * The selector must return a stable value for unchanged state (a primitive, or an object that
 * is only replaced when it really changes), otherwise the component would re-render on every
 * notification.
 */
export function useStore<T extends object, S>(store: Store<T>, selector: (state: T) => S): S {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const [value, setValue] = useState<S>(() => selector(store.get()));

  useEffect(() => {
    const update = (): void => {
      const next = selectorRef.current(store.get());
      setValue((previous) => (Object.is(previous, next) ? previous : next));
    };
    update();
    return store.subscribe(update);
  }, [store]);

  return value;
}
