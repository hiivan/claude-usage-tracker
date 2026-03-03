import * as vscode from 'vscode';
import { UsageEntry } from './types';
import { calculateCost, formatCost, formatTokens } from './costCalculator';

export class UsageStatusBar {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'claudeUsage.openDashboard';
    this.statusBarItem.tooltip = 'Claude Usage Today — Click to open dashboard';
  }

  update(entries: UsageEntry[]): void {
    const today = new Date().toDateString();
    const todayEntries = entries.filter(e => new Date(e.timestamp).toDateString() === today);

    const totalTokens = todayEntries.reduce(
      (sum, e) => sum + e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens,
      0
    );
    const totalCost = todayEntries.reduce((sum, e) => sum + calculateCost(e), 0);

    this.statusBarItem.text = `$(graph) Claude: ${formatCost(totalCost)} · ${formatTokens(totalTokens)} tokens`;
  }

  show(): void { this.statusBarItem.show(); }
  dispose(): void { this.statusBarItem.dispose(); }
}
