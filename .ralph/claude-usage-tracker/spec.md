# claude-usage-tracker — Project Spec

## Overview
A VS Code extension that tracks and visualizes Claude Code (CLI) usage by parsing local JSONL session files stored in `~/.claude/projects/`. It shows a live token count and estimated cost in the VS Code status bar, and provides a rich webview dashboard for detailed analytics.

## Goals
- Give users instant visibility into their Claude Code token consumption and estimated API cost directly inside VS Code
- Parse all JSONL session files under `~/.claude/projects/**/*.jsonl` to extract usage data
- Display a persistent status bar item showing today's total tokens and cost
- Provide a clickable webview panel dashboard with charts and breakdowns
- Auto-refresh when new session data is written to JSONL files

## Requirements

### 1. JSONL Data Parser (`src/usageParser.ts`)
- Recursively scan `~/.claude/projects/**/*.jsonl` for all session files, including nested subagent sessions (e.g. `~/.claude/projects/{project}/{sessionId}/subagents/*.jsonl`)
- Parse each line as JSON and extract entries with `type === "assistant"` and a `message.usage` object; skip `"user"` and `"queue-operation"` entries
- Each JSONL line is a top-level JSON object. The actual field names on the entry are:
  - `entry.timestamp` — ISO 8601 string (e.g. `"2026-03-03T09:22:59.592Z"`)
  - `entry.sessionId` — UUID string identifying the session
  - `entry.cwd` — full filesystem path of the working directory (e.g. `/Users/ivan/Downloads/my-project`)
  - `entry.message.model` — model string (e.g. `"claude-sonnet-4-6"`)
  - `entry.message.usage.input_tokens` — number
  - `entry.message.usage.output_tokens` — number
  - `entry.message.usage.cache_creation_input_tokens` — number (maps to cache_write cost; default 0 if absent)
  - `entry.message.usage.cache_read_input_tokens` — number (default 0 if absent)
- Aggregate all parsed entries into a flat array of `UsageEntry` objects (see Section 9 for the interface)

### 2. Cost Calculator (`src/costCalculator.ts`)
Calculate estimated USD cost based on model and token counts using these per-million-token rates:
- **claude-sonnet-4-6** (default for unknown models starting with "claude-sonnet"):
  - input: $3.00, output: $15.00, cache_read: $0.30, cache_write: $3.75
- **claude-opus-4-6** (match model strings containing "opus"):
  - input: $15.00, output: $75.00, cache_read: $1.50, cache_write: $18.75
- **claude-haiku-4-5** (match model strings containing "haiku"):
  - input: $0.80, output: $4.00, cache_read: $0.08, cache_write: $1.00
- Fall back to sonnet pricing for unrecognized models

### 3. Status Bar Item (`src/statusBar.ts`)
- Create a VS Code status bar item aligned to the left with priority 100
- Display icon `$(graph)` and text: `Claude: {cost_today} · {tokens_today}` (e.g. `$(graph) Claude: $0.45 · 125K tokens`)
- Clicking it opens the webview dashboard panel
- Tooltip shows: "Claude Usage Today — Click to open dashboard"
- Update every 60 seconds and on file system changes

### 4. Webview Dashboard Panel (`src/dashboardPanel.ts` + `webview/`)
Open a VS Code Webview panel titled "Claude Usage Dashboard" with a React-based UI (`webview/App.tsx`).

The dashboard must include:

**Tab navigation**: Today | This Week | This Month | All Time

**Summary cards** at the top of each tab:
- Total Input Tokens
- Total Output Tokens
- Total Cache Tokens (read + write combined)
- Estimated Cost (USD)

**Daily Bar Chart** (simple HTML/CSS bars, no external chart library):
- Today tab: hourly bars with X-axis = hours 0–23 of the current calendar day, Y-axis = token count per hour
- This Week tab: daily bars for the last 7 days
- This Month tab: daily bars for the last 30 days
- All Time tab: daily bars for the last 30 days (same as Month)
- Each bar labeled with its token value

**Model Breakdown table**:
- Columns: Model | Sessions | Input Tokens | Output Tokens | Est. Cost
- One row per model used

**Project Breakdown table**:
- Columns: Project (cwd basename) | Sessions | Tokens | Est. Cost
- One row per unique project directory

### 5. File Watcher (`src/extension.ts`)
- Use `vscode.workspace.createFileSystemWatcher` with glob `**/*.jsonl` to detect new/changed session files
- Also use Node.js `fs.watch` on `~/.claude/projects/` directory recursively
- On any file change, re-parse data and update the status bar
- If the dashboard panel is open, send updated data via `panel.webview.postMessage`

### 6. Extension Entry Point (`src/extension.ts`)
- Register command `claudeUsage.openDashboard` to open the webview panel
- Activate on VS Code startup (`"activationEvents": ["*"]`)
- Dispose all resources on deactivation

### 7. Build System
- Use `esbuild` to bundle `src/extension.ts` → `dist/extension.js` (CommonJS, external: vscode)
- Use `esbuild` to bundle `webview/App.tsx` → `dist/webview.js` (IIFE/ESM for browser)
- Include build scripts in `package.json`: `"build"`, `"watch"`, `"package"`

### 8. Package Manifest (`package.json`)
```json
{
  "name": "claude-usage-tracker",
  "displayName": "Claude Usage Tracker",
  "description": "Track your Claude Code token usage and cost",
  "version": "0.0.1",
  "engines": { "vscode": "^1.85.0" },
  "activationEvents": ["*"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [{
      "command": "claudeUsage.openDashboard",
      "title": "Claude Usage: Open Dashboard"
    }]
  }
}
```

### 9. Shared Types (`src/types.ts`)
Define a single shared interface used by all extension-side modules:
```typescript
export interface UsageEntry {
  timestamp: string;             // ISO string from entry.timestamp
  sessionId: string;             // from entry.sessionId (UUID)
  cwd: string;                   // from entry.cwd (full path, e.g. "/Users/ivan/my-project")
  model: string;                 // from entry.message.model
  inputTokens: number;           // entry.message.usage.input_tokens
  outputTokens: number;          // entry.message.usage.output_tokens
  cacheCreationTokens: number;   // entry.message.usage.cache_creation_input_tokens ?? 0
  cacheReadTokens: number;       // entry.message.usage.cache_read_input_tokens ?? 0
}
```
> Note: The webview (`webview/App.tsx`) runs in a browser sandbox and cannot import this file. It should declare an equivalent local interface or use the same field names without an import.

### 10. Package Configuration Details
`package.json` devDependencies (not bundled with extension):
- `esbuild`, `typescript`, `@types/vscode@^1.85.0`, `@types/react@^18`, `@types/react-dom@^18`

`package.json` dependencies (bundled into webview bundle by esbuild):
- `react@^18`, `react-dom@^18`

`tsconfig.json` settings:
- `"target": "ES2020"`, `"module": "commonjs"`, `"jsx": "react"`, `"strict": true`, `"esModuleInterop": true`, `"outDir": "dist"`, `"include": ["src", "webview"]`

Build config file: `esbuild.mjs` at project root, with two build steps:
1. `src/extension.ts` → `dist/extension.js` (format: `cjs`, platform: `node`, external: `['vscode']`, bundle: true, sourcemap: true)
2. `webview/App.tsx` → `dist/webview.js` (format: `iife`, platform: `browser`, bundle: true, sourcemap: true)
- Support `--watch` flag: when `process.argv.includes('--watch')`, call `ctx.watch()` on both contexts

### 11. Webview HTML Template (`webview/index.html`)
`dashboardPanel.ts` reads `webview/index.html`, replaces the placeholder `{{WEBVIEW_JS_URI}}` with a VS Code webview-safe URI (via `panel.webview.asWebviewUri`), and sets it as `panel.webview.html`. Template:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src {{CSP_NONCE}}; style-src 'unsafe-inline';">
  <title>Claude Usage Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script src="{{WEBVIEW_JS_URI}}"></script>
</body>
</html>
```

### 12. Webview Data Protocol
- Extension → webview: `panel.webview.postMessage({ type: 'update', entries: UsageEntry[] })`
- Webview receives via: `window.addEventListener('message', (event) => { const { type, entries } = event.data; ... })`
- Extension sends current data immediately when panel opens, and re-sends on every refresh

## Out of Scope
- Syncing with Anthropic's API for official usage data
- Authentication or API key management
- Publishing to the VS Code Marketplace
- Tracking usage from non-Claude-Code CLI sessions
- Any network requests

## Technical Notes
- Language: TypeScript for extension, React (TSX) for webview
- Bundler: esbuild (same pattern as ralph-vscode in Ralph Wiggum)
- No external chart libraries — use CSS/HTML for bar charts to keep bundle small
- The webview communicates with the extension via `postMessage` / `onDidReceiveMessage`
- All file reading is done in the extension host (Node.js context), not in the webview
- The `~/.claude/projects/` path must use `os.homedir()` for cross-platform safety
- JSONL files may have malformed lines; wrap each parse in try/catch
- Token numbers should be formatted: < 1000 show as-is, >= 1000 show as "Xk", >= 1000000 show as "XM"
- Cost should be formatted as "$X.XX" (2 decimal places minimum)
