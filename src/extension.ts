import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseUsageData } from './usageParser';
import { UsageStatusBar } from './statusBar';
import { DashboardPanel } from './dashboardPanel';

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new UsageStatusBar();
  statusBar.show();

  // Initial data load
  let entries = parseUsageData();
  statusBar.update(entries);

  // Refresh function
  function refresh() {
    entries = parseUsageData();
    statusBar.update(entries);
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.sendData(entries);
    }
  }

  // Register command
  const openCmd = vscode.commands.registerCommand('claudeUsage.openDashboard', () => {
    DashboardPanel.createOrShow(context.extensionUri, entries);
  });

  // 60-second polling interval
  const interval = setInterval(refresh, 60_000);

  // Node.js fs.watch on ~/.claude/projects/ for real-time updates
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  let watcher: fs.FSWatcher | undefined;
  if (fs.existsSync(projectsDir)) {
    watcher = fs.watch(projectsDir, { recursive: true }, () => refresh());
  }

  // Dispose all on deactivation
  context.subscriptions.push(
    openCmd,
    statusBar,
    { dispose: () => { clearInterval(interval); watcher?.close(); } }
  );
}

export function deactivate(): void {}
