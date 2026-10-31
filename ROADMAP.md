<!-- SPDX-FileCopyrightText: 2026 Mark (malfunctionAI) / KoodiKiht -->
<!-- SPDX-License-Identifier: MIT -->

# Technical Roadmap (`v0.1.0 -> v1.0.0`)

`axtree-audit` verifies web accessibility (`WCAG 2.2` / `EN 301 549`) and network privacy out-of-band by inspecting the browser engine's computed **Accessibility Tree (`AXTree`)** and protocol-level network telemetry over `CDP` / `WebDriver BiDi`, without injecting DOM scripts that fail under strict `Content-Security-Policy` headers.

## Completed Baseline (`v0.1.0` — October 2026)
- Standalone `Accessibility.getFullAXTree` protocol client and snapshot parser (`src/axtree.ts`, `src/cdp.ts`).
- Semantic tree reducer that collapses ignored/presentation wrappers while flagging screen-reader focus traps (`WCAG-4.1.2-FOCUS-HIDDEN`), missing accessible names (`WCAG-4.1.2-NAME`), unlabeled images (`WCAG-1.1.1-IMG`), non-descriptive links (`WCAG-2.4.4-LINK`), and missing landmarks (`WCAG-1.3.1-LANDMARK`).
- Pre-consent third-party tracker and `Content-Security-Policy` header auditor (`src/privacy.ts`).
- Exporters for **W3C EARL 1.0 JSON-LD** (`--format earl`), **SARIF v2.1.0** (`--format sarif`), and compact terminal trees.

---

## Planned Milestones (Aligned with Restack / Open Internet Stack)

### Milestone 1 (`v0.3.0`): Cross-Engine Protocol Support (Chromium CDP, Firefox / Gecko & WebDriver BiDi)
- **W3C WebDriver BiDi & Gecko Accessibility Inspector**: Extend the live protocol adapter beyond Chromium CDP to support Firefox/Gecko and emerging open web engines (`Servo` / `Verso`) via standard `WebDriver BiDi` sessions.
- **Shadow DOM, Iframe & Custom Element (`ElementInternals`) Stitching**: Merge multi-frame and closed Shadow-DOM `AXTree` subgraphs into a unified document accessibility hierarchy with accurate cross-frame `backendDOMNodeId` pointers.

### Milestone 2 (`v0.5.0`): Interactive Keyboard Navigation, Focus-Order & State-Transition Verifier
- **Protocol-Driven Tab-Order & Focus-Trap State Machine**: Dispatch synthetic protocol-level `Input.dispatchKeyEvent` (`Tab`, `Shift+Tab`, `Escape`, arrow keys) across interactive `AXNode` targets to detect keyboard focus loops, unfocusable custom widgets, and missing `focus-visible` states (`WCAG 2.1.1`, `2.1.2`, `2.4.3`, `2.4.7`, `2.4.11`).
- **Dynamic ARIA State Diffing (`before -> after`)**: Verify that modal dialogs, accordions, and comboboxes update `aria-expanded`, `aria-selected`, and `aria-modal` states in the computed `AXTree` when triggered.

### Milestone 3 (`v0.8.0`): Out-of-Band Fingerprinting, Storage & Consent-Wall Audit Engine
- **Pre-Interaction Telemetry & Cookie Harvester**: Capture `Network.requestWillBeSent`, `Network.responseReceivedExtraInfo`, and `Storage` mutations during cold page load to flag non-essential cookies, tracking pixels, and CNAME-cloaked beacons fired prior to user consent.
- **Browser API Fingerprinting Detector**: Use protocol-level `Debugger` / `Runtime` breakpoints out-of-band to detect silent canvas, WebGL, AudioContext, and font-enumeration fingerprinting reads without modifying page globals.

### Milestone 4 (`v1.0.0`): European Accessibility Act (`EN 301 549`) & W3C ACT-Rules Suite + Nixpkgs
- **W3C ACT-Rules & EN 301 549 Conformance Mapping**: Map all accessibility assertions to official **W3C Accessibility Conformance Testing (ACT)** rule identifiers and European standard **`EN 301 549`** clauses in `W3C EARL JSON-LD` exports.
- **CI Diffing & Reproducible Packaging**: Implement `axtree-audit diff <baseline.json> <current.json>` for CI regression gating, package reproducible derivations for `Nixpkgs` (`flake.nix`) and Debian, and release `v1.0.0`.
