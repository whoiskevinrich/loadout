# ADR 0005: Tailwind v4 with CSS-based theme

**Status:** Accepted
**Date:** 2026-05-23

## Context

The SPA needs a styling layer that's fast to write, generates small bundles, and doesn't fight Vite's hot-reload. The previous-major-version Tailwind (v3) requires a JavaScript config file, content-scanning configuration, and PostCSS plugin wiring.

Tailwind v4 (stable since early 2025) ships with a native Vite plugin, derives content scanning from imports, and moves theme tokens into CSS-native `@theme {}` blocks.

## Decision

Use **Tailwind v4** via `@tailwindcss/vite`. All theme tokens (colors, etc.) live in `apps/web/src/index.css` under a single `@theme { --color-* }` block. **There is no `tailwind.config.{js,ts}` file** and one should not be added.

## Alternatives considered

- **Tailwind v3** — mature, vast plugin ecosystem, every example on the web targets it. Rejected because v4 is now stable, simpler, and faster, and we're not heavy plugin users.
- **CSS Modules / vanilla CSS** — viable but more boilerplate (separate files per component, manual BEM-style naming).
- **styled-components / emotion** — runtime cost (CSS-in-JS injection), no design-system token surface comparable to Tailwind's atomic utilities.
- **UI kit like shadcn/ui** — provides components, but we don't yet need a component library; the app's surface is small and intentionally bespoke. We may layer one on top later.

## Consequences

**Positive**

- No JS config file to maintain or version-pin against the framework.
- The Vite plugin is fast — incremental rebuilds during `pnpm dev` are subjectively instant.
- Theme tokens are valid CSS custom properties — usable from any CSS or inline `style={}`, not just utility classes.
- Smaller output than v3 in our limited use.

**Negative**

- **Common reflex of looking for `tailwind.config.js`.** New contributors (and AI tools) will hunt for it. Mitigated by a note in CLAUDE.md.
- **Smaller v4-compatible plugin ecosystem** vs v3. Not currently blocking; we have no third-party plugins.
- **Migration path.** If we ever want to roll back to v3 (e.g., a critical v4 bug we can't work around), the `@theme` block needs to be translated into a JS config.

## Conventions

- Theme additions go in `src/index.css` under `@theme`, not in component files.
- Custom token names follow Tailwind's convention (e.g., `--color-surface`, `--color-accent`) so they generate matching utility classes (`bg-surface`, `text-accent`).
- Prefer composition of utility classes over custom CSS where Tailwind already covers the pattern.
