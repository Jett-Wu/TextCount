# 0001 — Tech stack: TypeScript (strict) + Preact + Vite + plain CSS + Vitest

Date: 2026-10-14
Status: Accepted

## Context

TextCount is a static, local-first counting tool for mixed Chinese and English text. It has no
backend, so the entire cost of the product is the bundle shipped to the browser plus the
correctness of the counting logic. Counting rules (CJK vs. Latin word boundaries, full-width vs.
half-width punctuation) are the risky part and must be testable without a DOM.

## Decision

Use TypeScript in strict mode for both engine and UI, Preact for the component layer, Vite as
the build tool and dev server, plain CSS with custom properties (no CSS framework) for styling
and theming, and Vitest for unit tests of the pure engine.

## Alternatives

- **Vanilla TypeScript + direct DOM manipulation** — smallest output, but hand-rolled rendering
  and state synchronisation for a UI with several live-updating panels.
- **Svelte** — excellent output size and DX, but a compiler-specific component model and tooling
  surface that adds a second mental model for no gain at this size.
- **React** — the most familiar component model and ecosystem, but a larger runtime than the
  product's actual logic justifies.

## Consequences

Preact keeps the runtime small while staying close to a familiar component model; Vite gives a
mature static build with first-class GitHub Pages support (`base`); plain CSS custom properties
cover light/dark theming without a framework dependency; Vitest runs the pure engine in Node, so
rules are testable without a browser. Bundle size is a measured outcome, not a promise: the only
acceptable figure is whatever the built `dist/` actually measures.

## Rollback

The counting engine lives in `src/core/` and is framework-free. If Preact or Vite ever has to go,
the UI layer can be replaced — or the engine lifted into another host entirely — without changing
any counting result, because results are defined by engine tests, not by components.
