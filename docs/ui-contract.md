# FluxGrid Webview UI Contract

This document defines the non-negotiable rules for every FluxGrid webview implementation. All contributors **must adhere** to these requirements; deviations require an explicit update to this contract.

## Technology Stack

- **Language / Framework**: TypeScript + React (Vite entrypoint)
- **Component Library**: [VS Code Webview UI Toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit) (`<vscode-button>`, `<vscode-text-field>`, etc.)
- **Table Virtualization**: [`glide-data-grid`](https://github.com/glideapps/glide-data-grid) for all large result grids
- **Bundler**: Vite with CSP-safe configuration (no inline scripts except via nonce)

## Theming & Styling

- All colors, shadows, and typography derive from VS Code theme variables (`var(--vscode-*)`). Hard-coded values are forbidden.
- Spacing system: multiples of **8px / 12px**. Border radius defaults to **8px** unless specified.
- `:focus-visible` must use `--vscode-focusBorder`. Hover states use `--vscode-list-hoverBackground`.
- No inline styles. Use scoped CSS modules or dedicated CSS files.

## Accessibility

- WAI-ARIA roles, labels, and relationships must be applied (e.g., `aria-label`, `aria-controls`, `role="tree"`).
- Keyboard-first design: all primary actions must be reachable via keyboard (`Cmd/Ctrl+Enter` to run, `Esc` to cancel, logical Tab/Shift+Tab order).
- Contrast ratio ≥ 4.5:1 for text and interactive elements.
- Focus ring always visible on focused components.
- Screen readers must announce labels and state changes (use live regions where appropriate).

## Internationalization

- Text strings must be sourced from locale files (default `en.json`, stub `ja.json`). No inline literals in components.
- Components accept a locale context; adding new languages should not require refactoring UI logic.

## Performance

- `glide-data-grid` must be configured for virtualization and column resizing. Target smooth scrolling (60fps) and insert/copy operations on result sets up to 100k rows.
- Streaming result states must display non-blocking skeletons or progress indicators.

## Security & CSP

- Webview HTML must include a unique nonce for `<script>` tags. No external CDN or inline `<style>`/`<script>` blocks.
- All assets (JS/CSS/fonts) are bundled locally. Runtime-generated `<style>` tags require nonce or `nonce` via React `helmet` patterns.

## Testing

- Unit tests via Vitest cover core logic.
- End-to-end smoke tests through Playwright cover: query execution, cancellation, connection dialog workflow, keyboard shortcuts, i18n toggle, and result-grid interactions.
- Mock/stub data must exist to render UI offline (Storybook-equivalent host).

## Required UX Elements

- **Toolbar**: connection selector, run/stop buttons, timeout input, SQL formatting toggle.
- **SQL Panel**: text editor component supporting keyboard shortcuts and focus management.
- **Result Grid**: `glide-data-grid` with streaming placeholders, copy/export interactions, column resizing.
- **Schema Tree**: accessible tree view with search/filter.
- **Diagnostics Pane**: structured logs with severity chips and time stamps.
- **Connection Dialog**: VS Code toolkit elements, test connection workflow, SSH/SSL toggles.

## Implementation Checklist

- [ ] React component with toolkit wrappers
- [ ] Nonce-based CSP compliance
- [ ] Keyboard shortcut handlers (`Cmd/Ctrl+Enter`, `Esc`)
- [ ] Glide grid virtualization verified with mock 100k rows
- [ ] i18n keys present in `en.json` / `ja.json`
- [ ] Playwright scenario documented for this view

Any new UI work must reference this contract in the PR description and confirm adherence.

