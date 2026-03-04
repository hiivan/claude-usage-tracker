import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseUsageData } from './usageParser';
import { UsageStatusBar } from './statusBar';
import { DashboardPanel } from './dashboardPanel';
import { BillingMode } from './types';

function getBillingMode(): BillingMode {
  const cfg = vscode.workspace.getConfiguration('claudeUsage');
  const mode = cfg.get<string>('billingMode', 'api');
  if (mode === 'pro' || mode === 'max5' || mode === 'max20') return mode;
  return 'api';
}

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new UsageStatusBar();
  statusBar.show();

  // Initial data load
  let entries = parseUsageData();
  statusBar.update(entries, getBillingMode());

  // Refresh function
  function refresh() {
    const billingMode = getBillingMode();
    entries = parseUsageData();
    statusBar.update(entries, billingMode);
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.sendData(entries, billingMode);
    }
  }

  // Re-render when user changes the billing mode setting
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeUsage.billingMode')) {
        refresh();
      }
    })
  );

  // Register command
  const openCmd = vscode.commands.registerCommand('claudeUsage.openDashboard', () => {
    DashboardPanel.createOrShow(context.extensionUri, entries, getBillingMode());
  });

  // 60-second polling interval
  const interval = setInterval(refresh, 60_000);

  // Node.js fs.watch on ~/.claude/projects/ for real-time updates (debounced 500ms)
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  let watcher: fs.FSWatcher | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    watcher = fs.watch(projectsDir, { recursive: true }, (_, filename) => {
      if (!filename?.endsWith('.jsonl')) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refresh, 500);
    });
  } catch { /* directory doesn't exist yet */ }

  // Dispose all on deactivation
  context.subscriptions.push(
    openCmd,
    statusBar,
    { dispose: () => { clearInterval(interval); watcher?.close(); } }
  );
}

export function deactivate(): void {}
