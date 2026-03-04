import * as vscode from 'vscode';
import { UsageEntry, BillingMode, WINDOW_LIMITS } from './types';
import { calculateCost, formatCost, formatTokens } from './costCalculator';

export class UsageStatusBar {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'claudeUsage.openDashboard';
  }

  update(entries: UsageEntry[], billingMode: BillingMode = 'api'): void {
    const today = new Date().toDateString();
    const todayEntries = entries.filter(e => new Date(e.timestamp).toDateString() === today);

    const totalTokens = todayEntries.reduce(
      (sum, e) => sum + e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens,
      0
    );

    const windowCutoff = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const windowEntries = entries.filter(e => new Date(e.timestamp) >= windowCutoff);
    const windowTokens = windowEntries.reduce(
      (sum, e) => sum + e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens,
      0
    );
    const windowLimit = WINDOW_LIMITS[billingMode];

    if (billingMode === 'pro') {
      if (windowTokens > 0 && windowLimit != null) {
        const pct = Math.round(windowTokens / windowLimit * 100);
        this.statusBarItem.text = `$(graph) Claude Pro · ${pct}% · ${formatTokens(windowTokens)}/${formatTokens(windowLimit)} tokens`;
      } else {
        this.statusBarItem.text = `$(graph) Claude Pro · ${formatTokens(totalTokens)} tokens`;
      }
      this.statusBarItem.tooltip = 'Claude Pro ($20/mo) — Click to open dashboard';
    } else if (billingMode === 'max5' || billingMode === 'max20') {
      const label = billingMode === 'max5' ? 'Max ($100/mo)' : 'Max ($400/mo)';
      if (windowTokens > 0 && windowLimit != null) {
        const pct = Math.round(windowTokens / windowLimit * 100);
        this.statusBarItem.text = `$(graph) Claude ${label} · ${pct}% · ${formatTokens(windowTokens)}/${formatTokens(windowLimit)} tokens`;
      } else {
        this.statusBarItem.text = `$(graph) Claude ${label} · ${formatTokens(totalTokens)} tokens`;
      }
      this.statusBarItem.tooltip = `Claude ${label} — Click to open dashboard`;
    } else {
      const totalCost = todayEntries.reduce((sum, e) => sum + calculateCost(e), 0);
      this.statusBarItem.text = `$(graph) Claude: ${formatCost(totalCost)} · ${formatTokens(totalTokens)} tokens`;
      this.statusBarItem.tooltip = 'Claude Usage Today — Click to open dashboard';
    }
  }

  show(): void { this.statusBarItem.show(); }
  dispose(): void { this.statusBarItem.dispose(); }
}
