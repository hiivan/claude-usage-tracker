import * as vscode from 'vscode';
import { UsageEntry, BillingMode } from './types';
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

    if (billingMode === 'pro') {
      this.statusBarItem.text = `$(graph) Claude Pro · ${formatTokens(totalTokens)} tokens`;
      this.statusBarItem.tooltip = 'Claude Pro ($20/mo) — Click to open dashboard';
    } else if (billingMode === 'max5' || billingMode === 'max20') {
      const label = billingMode === 'max5' ? 'Max ($100/mo)' : 'Max ($400/mo)';
      this.statusBarItem.text = `$(graph) Claude ${label} · ${formatTokens(totalTokens)} tokens`;
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
