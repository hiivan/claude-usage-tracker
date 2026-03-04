import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

interface UsageEntry {
  timestamp: string;
  sessionId: string;
  cwd: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

// Inline pricing logic mirroring costCalculator.ts
function getPricing(model: string) {
  if (model.includes('haiku')) {
    return { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 1.00 };
  }
  if (model.includes('opus')) {
    return { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 };
  }
  return { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };
}

function calculateCost(entry: UsageEntry): number {
  const p = getPricing(entry.model);
  return (
    (entry.inputTokens / 1_000_000) * p.input +
    (entry.outputTokens / 1_000_000) * p.output +
    (entry.cacheReadTokens / 1_000_000) * p.cacheRead +
    (entry.cacheCreationTokens / 1_000_000) * p.cacheWrite
  );
}

function formatCost(usd: number): string {
  return '$' + usd.toFixed(2);
}

function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return Math.round(count / 1000) + 'k';
  return (count / 1_000_000).toFixed(1) + 'M';
}

// Get basename of a path (inline, no path import)
function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p;
}

type Tab = 'today' | 'week' | 'month' | 'all';
type BillingMode = 'api' | 'pro' | 'max5' | 'max20';

const WINDOW_LIMITS: Record<BillingMode, number | null> = {
  api: null, pro: 19_000, max5: 88_000, max20: 220_000,
};

function filterEntries(entries: UsageEntry[], tab: Tab): UsageEntry[] {
  const now = new Date();
  if (tab === 'today') {
    const todayStr = now.toDateString();
    return entries.filter(e => new Date(e.timestamp).toDateString() === todayStr);
  }
  if (tab === 'week') {
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return entries.filter(e => new Date(e.timestamp) >= cutoff);
  }
  if (tab === 'month') {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return entries.filter(e => new Date(e.timestamp) >= cutoff);
  }
  return entries;
}

function totalTokens(e: UsageEntry): number {
  return e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens;
}

function formatTimeRemaining(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

// Build hourly bars for "today" tab
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

// Build daily bars for week/month/all tabs
function buildDailyBars(entries: UsageEntry[]): { label: string; tokens: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    const d = new Date(e.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    map.set(key, (map.get(key) ?? 0) + totalTokens(e));
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, tokens]) => ({ label: key.slice(5), tokens })); // "MM-DD"
}

interface BarChartProps {
  bars: { label: string; tokens: number }[];
}

function BarChart({ bars }: BarChartProps) {
  const maxTokens = Math.max(...bars.map(b => b.tokens), 1);
  const chartHeight = 120;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: '2px',
      height: chartHeight + 40 + 'px',
      overflowX: 'auto',
      padding: '8px 0',
    }}>
      {bars.map((bar, i) => {
        const barHeight = Math.round((bar.tokens / maxTokens) * chartHeight);
        return (
          <div key={i} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: '28px',
            flex: '1 0 auto',
          }}>
            <div style={{
              fontSize: '9px',
              color: 'var(--vscode-descriptionForeground, #888)',
              marginBottom: '2px',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}>
              {bar.tokens > 0 ? formatTokens(bar.tokens) : ''}
            </div>
            <div style={{
              width: '100%',
              height: `${barHeight}px`,
              background: 'var(--vscode-charts-blue, #007acc)',
              borderRadius: '2px 2px 0 0',
              minHeight: bar.tokens > 0 ? '2px' : '0',
            }} />
            <div style={{
              fontSize: '9px',
              color: 'var(--vscode-descriptionForeground, #888)',
              marginTop: '4px',
              textAlign: 'center',
            }}>
              {bar.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
}

function SummaryCard({ title, value }: SummaryCardProps) {
  return (
    <div style={{
      flex: '1 1 0',
      minWidth: '120px',
      padding: '12px 16px',
      background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.05))',
      borderRadius: '6px',
      border: '1px solid var(--vscode-panel-border, rgba(255,255,255,0.1))',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground, #888)', marginBottom: '6px' }}>
        {title}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}

const PLAN_LABELS: Record<BillingMode, string | null> = {
  api: null, pro: 'Claude Pro ($20/mo)', max5: 'Claude Max ($100/mo)', max20: 'Claude Max ($400/mo)',
};

// Acquire the VS Code API for postMessage back to the extension host
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscodeApi = acquireVsCodeApi();

function openPlanUsage() {
  vscodeApi.postMessage({ type: 'openUrl', url: 'https://claude.ai/settings' });
}

function App() {
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [billingMode, setBillingMode] = useState<BillingMode>('api');

  useEffect(() => {
    function handler(event: MessageEvent) {
      if (event.data?.type === 'update') {
        setEntries(event.data.entries as UsageEntry[]);
        if (event.data.billingMode) {
          setBillingMode(event.data.billingMode as BillingMode);
        }
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const showCost = billingMode === 'api';

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

  const filtered = filterEntries(entries, activeTab);

  // Summary totals
  const totalInput = filtered.reduce((s, e) => s + e.inputTokens, 0);
  const totalOutput = filtered.reduce((s, e) => s + e.outputTokens, 0);
  const totalCache = filtered.reduce((s, e) => s + e.cacheCreationTokens + e.cacheReadTokens, 0);
  const totalCost = filtered.reduce((s, e) => s + calculateCost(e), 0);

  // Bar chart data
  const bars = activeTab === 'today' ? buildHourlyBars(filtered) : buildDailyBars(filtered);

  // Model breakdown
  const modelMap = new Map<string, { sessions: Set<string>; input: number; output: number; cost: number }>();
  for (const e of filtered) {
    if (!modelMap.has(e.model)) {
      modelMap.set(e.model, { sessions: new Set(), input: 0, output: 0, cost: 0 });
    }
    const m = modelMap.get(e.model)!;
    m.sessions.add(e.sessionId);
    m.input += e.inputTokens;
    m.output += e.outputTokens;
    m.cost += calculateCost(e);
  }
  const modelRows = Array.from(modelMap.entries()).sort((a, b) => b[1].cost - a[1].cost);

  // Project breakdown
  const projectMap = new Map<string, { sessions: Set<string>; tokens: number; cost: number }>();
  for (const e of filtered) {
    const proj = basename(e.cwd);
    if (!projectMap.has(proj)) {
      projectMap.set(proj, { sessions: new Set(), tokens: 0, cost: 0 });
    }
    const p = projectMap.get(proj)!;
    p.sessions.add(e.sessionId);
    p.tokens += totalTokens(e);
    p.cost += calculateCost(e);
  }
  const projectRows = Array.from(projectMap.entries()).sort((a, b) => b[1].cost - a[1].cost);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'all', label: 'All Time' },
  ];

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: '1px solid var(--vscode-panel-border, rgba(255,255,255,0.1))',
    color: 'var(--vscode-descriptionForeground, #888)',
    fontWeight: 500,
    fontSize: '11px',
    textTransform: 'uppercase',
  };

  const tdStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid var(--vscode-panel-border, rgba(255,255,255,0.05))',
  };

  return (
    <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600 }}>Claude Usage Dashboard</h2>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              background: activeTab === tab.id
                ? 'var(--vscode-button-background, #007acc)'
                : 'var(--vscode-button-secondaryBackground, rgba(255,255,255,0.1))',
              color: activeTab === tab.id
                ? 'var(--vscode-button-foreground, #fff)'
                : 'var(--vscode-editor-foreground, inherit)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Subscription plan banner */}
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

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <SummaryCard title="Total Input Tokens" value={formatTokens(totalInput)} />
        <SummaryCard title="Total Output Tokens" value={formatTokens(totalOutput)} />
        <SummaryCard title="Total Cache Tokens" value={formatTokens(totalCache)} />
        {showCost
          ? <SummaryCard title="Estimated Cost" value={formatCost(totalCost)} />
          : <SummaryCard title="API Equivalent Cost" value={`~${formatCost(totalCost)}`} />
        }
      </div>

      {/* Bar chart */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>
          {activeTab === 'today' ? 'Tokens by Hour' : 'Tokens by Day'}
        </h3>
        <BarChart bars={bars} />
      </div>

      {/* Model breakdown */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>Model Breakdown</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Model</th>
                <th style={thStyle}>Sessions</th>
                <th style={thStyle}>Input Tokens</th>
                <th style={thStyle}>Output Tokens</th>
                <th style={thStyle}>{showCost ? 'Est. Cost' : 'API Equiv. Cost'}</th>
              </tr>
            </thead>
            <tbody>
              {modelRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, color: 'var(--vscode-descriptionForeground, #888)', textAlign: 'center' }}>
                    No data for this period
                  </td>
                </tr>
              ) : (
                modelRows.map(([model, data]) => (
                  <tr key={model}>
                    <td style={tdStyle}>{model}</td>
                    <td style={tdStyle}>{data.sessions.size}</td>
                    <td style={tdStyle}>{formatTokens(data.input)}</td>
                    <td style={tdStyle}>{formatTokens(data.output)}</td>
                    <td style={tdStyle}>{formatCost(data.cost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subscription footnote under model table */}
      {!showCost && (
        <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground, #888)', marginTop: '-16px', marginBottom: '24px' }}>
          * API Equiv. Cost is for reference only — you are on a flat-rate subscription plan.
        </div>
      )}

      {/* Project breakdown */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>Project Breakdown</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Project</th>
                <th style={thStyle}>Sessions</th>
                <th style={thStyle}>Tokens</th>
                <th style={thStyle}>{showCost ? 'Est. Cost' : 'API Equiv. Cost'}</th>
              </tr>
            </thead>
            <tbody>
              {projectRows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ ...tdStyle, color: 'var(--vscode-descriptionForeground, #888)', textAlign: 'center' }}>
                    No data for this period
                  </td>
                </tr>
              ) : (
                projectRows.map(([proj, data]) => (
                  <tr key={proj}>
                    <td style={tdStyle}>{proj}</td>
                    <td style={tdStyle}>{data.sessions.size}</td>
                    <td style={tdStyle}>{formatTokens(data.tokens)}</td>
                    <td style={tdStyle}>{formatCost(data.cost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
