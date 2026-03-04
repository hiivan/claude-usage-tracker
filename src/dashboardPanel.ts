import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { UsageEntry, BillingMode } from './types';

export class DashboardPanel {
  static currentPanel: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.panel.webview.html = this.getWebviewContent(this.panel.webview, extensionUri);
    this.panel.onDidDispose(
      () => {
        DashboardPanel.currentPanel = undefined;
        this.dispose();
      },
      null,
      this.disposables
    );
    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (message: { type: string; url?: string }) => {
        if (message.type === 'openUrl' && message.url) {
          vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
      },
      null,
      this.disposables
    );
  }

  static createOrShow(extensionUri: vscode.Uri, entries: UsageEntry[], billingMode: BillingMode = 'api'): void {
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      DashboardPanel.currentPanel.sendData(entries, billingMode);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'claudeUsage',
      'Claude Usage Dashboard',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
    DashboardPanel.currentPanel.sendData(entries, billingMode);
  }

  sendData(entries: UsageEntry[], billingMode: BillingMode = 'api'): void {
    this.panel.webview.postMessage({ type: 'update', entries, billingMode });
  }

  private getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const htmlPath = path.join(extensionUri.fsPath, 'webview', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')
    );
    html = html.replace('{{WEBVIEW_JS_URI}}', webviewUri.toString());
    return html;
  }

  dispose(): void {
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
