# usage-window-bar — Project Spec

## Overview
Add a 5-hour rolling window progress bar to the Claude Usage Tracker VS Code extension dashboard. Claude Code rate-limits subscription plans using 5-hour rolling windows with community-discovered token limits. This feature shows users how much of their current window they've consumed and when the window resets — mimicking what the Claude desktop app shows.

## Goals
- Show a visual progress bar for the current 5-hour window token usage vs plan limit
- Display "Reset in Xh Xmin" countdown until the window resets
- Colour the bar green → amber → red as usage approaches the limit
- Update every minute automatically (the extension already has a 60s interval + file watcher)

## Requirements

### 1. Plan limits (`src/types.ts`)
`BillingMode` is already defined as `'api' | 'pro' | 'max5' | 'max20'` in `src/types.ts`. Add a new exported constant map after the existing `BillingMode` type:

```typescript
export const WINDOW_LIMITS: Record<BillingMode, number | null> = {
  api:   null,    // no window limit — pay per token
  pro:   19_000,  // ~19k tokens per 5-hour window (community-discovered)
  max5:  88_000,  // ~88k tokens per 5-hour window
  max20: 220_000, // ~220k tokens per 5-hour window
};
```

### 2. Status bar (`src/statusBar.ts`)
Import `WINDOW_LIMITS` from `./types`. For `pro`/`max5`/`max20` billing modes, update the status bar text to show the window percentage when there is activity in the last 5 hours:

Format: `$(graph) Claude Pro · 75% · 14k/19k tokens`

Logic:
- Compute `windowCutoff = new Date(Date.now() - 5 * 60 * 60 * 1000)`
- Filter entries to last 5 hours and sum all token types
- `pct = Math.round(windowTokens / windowLimit * 100)`
- If `windowTokens > 0 && windowLimit != null`, show the percentage format
- Otherwise fall back to: `$(graph) Claude Pro · ${formatTokens(todayTokens)} tokens`

### 3. Webview dashboard (`webview/App.tsx`)
All changes are inside the existing React `App` component.

#### 3a. Update type declarations at the top of the file
Replace the existing `BillingMode` type alias and `PLAN_LABELS` constant with:
```typescript
type BillingMode = 'api' | 'pro' | 'max5' | 'max20';

const WINDOW_LIMITS: Record<BillingMode, number | null> = {
  api: null, pro: 19_000, max5: 88_000, max20: 220_000,
};

const PLAN_LABELS: Record<BillingMode, string | null> = {
  api: null, pro: 'Claude Pro ($20/mo)', max5: 'Claude Max ($100/mo)', max20: 'Claude Max ($400/mo)',
};
```

#### 3b. Extract `totalTokens` helper and fix `buildHourlyBars`
Add this helper before `buildHourlyBars`:
```typescript
function totalTokens(e: UsageEntry): number {
  return e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens;
}
```
Replace all inline occurrences of `e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens` in `buildHourlyBars`, `buildDailyBars`, and the project/week reduce loops with `totalTokens(e)`.

Replace `buildHourlyBars` with an O(n) single-pass implementation:
```typescript
function buildHourlyBars(entries: UsageEntry[]): { label: string; tokens: number }[] {
  const map = new Map<number, number>();
  for (const e of entries) {
    const h = new Date(e.timestamp).getHours();
    map.set(h, (map.get(h) ?? 0) + totalTokens(e));
  }
  return Array.from({ length: 24 }, (_, h) => ({
    label: String(h).padStart(2, '0'),
    tokens: map.get(h) ?? 0,
  }));
}
```

Add a `formatTimeRemaining` helper:
```typescript
function formatTimeRemaining(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}
```

#### 3c. 5-hour window computed values in App()
Add these inside the `App` function body, after `const showCost = billingMode === 'api'`:

```typescript
const windowLimit = WINDOW_LIMITS[billingMode];
const windowCutoff = new Date(Date.now() - 5 * 60 * 60 * 1000);
const windowEntries = entries.filter(e => new Date(e.timestamp) >= windowCutoff);
const windowTokensCount = windowEntries.reduce((s, e) => s + totalTokens(e), 0);
const windowPct = windowLimit ? Math.round(windowTokensCount / windowLimit * 100) : 0;

const windowStart = windowEntries.length > 0
  ? Math.min(...windowEntries.map(e => new Date(e.timestamp).getTime()))
  : null;
const resetAt = windowStart !== null ? windowStart + 5 * 60 * 60 * 1000 : null;
const resetInMs = resetAt !== null ? Math.max(0, resetAt - Date.now()) : null;
```

Remove the existing `weekSessions`, `weekMessages`, and `weekEntries` lines (no longer needed in the banner).

#### 3d. Replace the subscription banner JSX
Replace the entire `{/* Subscription plan banner */}` block with:

```tsx
{!showCost && PLAN_LABELS[billingMode] && (
  <div style={{
    marginBottom: '20px', padding: '14px 16px', borderRadius: '8px',
    border: '1px solid var(--vscode-charts-blue, #007acc)',
    background: 'rgba(0, 122, 204, 0.08)',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
      <span style={{ fontWeight: 600, fontSize: '14px' }}>✦ {PLAN_LABELS[billingMode]}</span>
      <button onClick={openPlanUsage} style={{
        padding: '4px 10px', border: '1px solid var(--vscode-charts-blue, #007acc)',
        borderRadius: '4px', background: 'transparent', color: 'var(--vscode-charts-blue, #007acc)',
        cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap',
      }}>claude.ai →</button>
    </div>

    {windowLimit !== null && (
      <>
        <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground, #888)', marginBottom: '6px' }}>
          Current 5-hour window
        </div>
        {windowEntries.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground, #888)' }}>
            No activity in the last 5 hours
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div style={{ flex: 1, height: '10px', borderRadius: '5px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(windowPct, 100)}%`, height: '100%', borderRadius: '5px',
                  background: windowPct < 70 ? 'var(--vscode-charts-green, #4caf50)'
                    : windowPct < 90 ? '#f0a500'
                    : 'var(--vscode-charts-red, #f44336)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <span style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                {formatTokens(windowTokensCount)} / ~{formatTokens(windowLimit)} tokens ({windowPct}%)
              </span>
            </div>
            {resetInMs !== null && (
              <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground, #888)' }}>
                Resets in {formatTimeRemaining(resetInMs)}
              </div>
            )}
          </>
        )}
        <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground, #666)', marginTop: '8px' }}>
          Limits are approximate (community-discovered, not from Anthropic).
        </div>
      </>
    )}
  </div>
)}
```

## Out of Scope
- Fetching plan limits from Anthropic's API
- Supporting custom/enterprise plan limits via user input
- Changing the tab/chart/table sections of the dashboard

## Technical Notes
- `WINDOW_LIMITS` values are from Claude-Code-Usage-Monitor community research
- The 5-hour window is rolling (starts from the FIRST message in the current window), not calendar-based
- The webview cannot import from `src/` — all types and constants must be duplicated inline in `webview/App.tsx`
- Only modify: `src/types.ts`, `src/statusBar.ts`, `webview/App.tsx`
- Do NOT modify: `src/extension.ts`, `src/dashboardPanel.ts`, `src/usageParser.ts`, `src/costCalculator.ts`, `webview/index.html`, `esbuild.mjs`, `package.json`
- After implementing, run `npm run build` and fix any TypeScript errors before finishing
