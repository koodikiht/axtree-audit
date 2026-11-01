<!-- SPDX-FileCopyrightText: 2026 Mark (malfunctionAI) / KoodiKiht -->
<!-- SPDX-License-Identifier: MIT -->

# axtree-audit

[![CI](https://github.com/koodikiht/axtree-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/koodikiht/axtree-audit/actions/workflows/ci.yml) [![SLSA Build Level 3](https://img.shields.io/badge/SLSA-Build%20Level%203-brightgreen)](https://github.com/koodikiht/axtree-audit/attestations) [![REUSE status](https://api.reuse.software/badge/github.com/koodikiht/axtree-audit)](https://api.reuse.software/info/github.com/koodikiht/axtree-audit) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Out-of-band Chrome DevTools Protocol (`CDP`) accessibility tree (`AXTree`) and pre-consent network verifier. Emits `W3C EARL 1.0 JSON-LD` and `SARIF v2.1.0`.

## Why CDP instead of DOM injection

Usually web accessibility runners (`axe-core`, `pa11y`) inject a JavaScript bundle into the inspected page and walk the DOM, it breaks under a strict `Content-Security-Policy` and misses what screen readers (`NVDA`, `Orca`, `VoiceOver`) actually see, since assistive tools consume the browser's computed Accessibility Tree (`AXTree`) rather than raw HTML tags.

A widget can look valid in JSX while still computing `name: ""` in the `AXTree` (for example, `role="combobox"` elements where ARIA 1.2 forbids `nameFrom: contents`, or `<svg><use>` icons rendered without `aria-hidden="true"`). `axtree-audit` pulls `Accessibility.getFullAXTree` and `Network` events over CDP without touching the page DOM.

## Running

Requires `bun >= 1.1` (or `node >= 22.6` with `--experimental-strip-types`). No external runtime dependencies.

```bash
# Audit a live browser tab over CDP
bun run src/cli.ts live --cdp http://127.0.0.1:9222 --url https://example.org

# Export W3C EARL 1.0 JSON-LD for WCAG conformance reporting
bun run src/cli.ts live --cdp http://127.0.0.1:9222 --url https://example.org --format earl > report.earl.json

# Scan an offline AXTree snapshot
bun run src/cli.ts scan snapshot.json --format sarif --fail-on-high

# Run unit tests
bun test
```

## Rules (`v0.1.0`)

`src/axtree.ts` first reduces raw CDP `AXNode` graphs by collapsing ignored wrappers (`generic`, `none`, `presentation`, `InlineTextBox`) while keeping landmarks, headings, and interactive controls:

- `WCAG-4.1.2-NAME`: interactive control (`button`, `link`, `textbox`, `combobox`, `checkbox`) computes an empty accessible name in the browser `AXTree`.
- `WCAG-4.1.2-FOCUS-HIDDEN`: focusable node is marked `ignored: true` or trapped inside an ignored ancestor.
- `WCAG-1.1.1-IMG`: non-decorative `image` node has no label.
- `WCAG-2.4.4-LINK`: link name resolves to a generic placeholder (`click here`, `read more`, `link`).
- `WCAG-1.3.1-HEADING-ORDER` and `WCAG-1.3.1-LANDMARK`: skipped heading levels (for example `h1` straight to `h4`) or documents missing a primary `main` landmark region.
- `PRIV-001..003` (`src/privacy.ts`): flags missing or permissive `Content-Security-Policy` headers (`unsafe-inline`, `unsafe-eval`) and third-party telemetry or tracker hosts contacted before user consent.

## Upstream issues found with `axtree-audit`

| Target | Finding | Issue |
| :--- | :--- | :--- |
| Gitea / Forgejo | `WCAG-4.1.2-NAME`: Fomantic `.ui.dropdown` widgets in `web_src/js/modules/fomantic/dropdown.ts` set `role="combobox"` without `aria-label` or `aria-labelledby`, computing `name: ""` in the `AXTree`. | [`#40107`](https://github.com/go-gitea/gitea/issues/40107) |
| Lemmy UI | `WCAG-4.1.2-NAME` / `WCAG-1.1.1-IMG`: `<svg><use>` icons in `src/shared/components/common/icon.tsx` lacked `aria-hidden="true"` (exposing unlabeled `role="image"` nodes across post listings), duplicated `#plus-square-alt` IDs, and left icon-only buttons with `name: ""`. | [`#4368`](https://github.com/LemmyNet/lemmy-ui/issues/4368) |

## License

MIT © 2026 Mark ([@malfunctionAI](https://github.com/malfunctionAI)) / [KoodiKiht](https://koodikiht.dev). Compliant with [FSFE REUSE 3.2](https://reuse.software/).
