## Overview

This PR implements the `claude-usage-tracker` VS Code extension from scratch. The extension parses Claude Code's local JSONL session files under `~/.claude/projects/` and surfaces real-time token usage and estimated API cost directly in VS Code — via a persistent status bar item and a clickable webview dashboard with tab navigation, bar charts, and model/project breakdowns.

## Key Changes

- **`package.json`, `tsconfig.json`, `.gitignore`, `.vscodeignore`** — Project scaffold with VS Code extension manifest, TypeScript config (ES2020/CommonJS/JSX), and packaging configuration
- **`esbuild.mjs`** — Dual esbuild build system: extension bundle (CJS/Node, vscode external) and webview bundle (IIFE/browser); supports `--watch` mode via esbuild context API
- **`src/types.ts`** — Shared `UsageEntry` interface (timestamp, sessionId, cwd, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens)
- **`src/usageParser.ts`** — Recursive JSONL parser that walks `~/.claude/projects/`, filters `type === "assistant"` entries with `message.usage`, and returns a flat `UsageEntry[]`; handles missing directory and malformed lines gracefully
- **`src/costCalculator.ts`** — Per-million-token pricing for haiku, opus, and sonnet/default tiers; exports `calculateCost`, `formatCost` (`$X.XX`), and `formatTokens` (`Xk`/`XM` suffixes)
- **`webview/index.html`** — HTML scaffold with `{{WEBVIEW_JS_URI}}` placeholder, VS Code CSS variable theming, and `#root` mount point
- **`webview/App.tsx`** — Full React dashboard with tab navigation (Today/This Week/This Month/All Time), summary cards (input tokens, output tokens, cache tokens, estimated cost), an HTML/CSS bar chart (hourly for Today, daily for other tabs), a model breakdown table, and a project breakdown table
- **`src/dashboardPanel.ts`** — Singleton `DashboardPanel` class: creates/reveals a VS Code WebviewPanel, injects the webview JS URI into the HTML template, and sends data updates via `postMessage`
- **`src/statusBar.ts`** — `UsageStatusBar` class displaying `$(graph) Claude: {cost} · {tokens} tokens` in the left status bar; clicking opens the dashboard
- **`src/extension.ts`** — Extension entry point: wires all components, registers `claudeUsage.openDashboard` command, polls every 60 seconds, and watches `~/.claude/projects/` with Node.js `fs.watch` for real-time updates; disposes all resources on deactivation

## Testing

No automated tests were run. All 10 implementation tasks completed without errors or obstacles, each verified by the Ralph Wiggum agent immediately after creation. Manual testing would involve:

1. Running `npm install` to install dependencies
2. Running `node esbuild.mjs` to verify both bundles build without errors
3. Opening the extension in VS Code (F5) and confirming the status bar item appears
4. Clicking the status bar item to open the dashboard and verifying tab navigation, charts, and tables render correctly
5. Confirming the status bar and dashboard update when new JSONL session data is written to `~/.claude/projects/`

## Notes

- The webview (`webview/App.tsx`) intentionally duplicates the `UsageEntry` interface and pricing logic from `src/` because webview code runs in a browser sandbox and cannot import Node.js extension modules.
- The extension uses Node.js `fs.watch` with `recursive: true` rather than `vscode.workspace.createFileSystemWatcher` because the latter only covers files within the VS Code workspace, whereas `~/.claude/projects/` is an external directory.
- The 60-second polling interval provides a fallback refresh in case `fs.watch` events are missed (e.g., on network drives or certain macOS configurations).
