const vscode = require('vscode');
const { TradeSignalPanel } = require('./panel');

function activate(context) {
  // Register the sidebar webview
  const provider = new TradeSignalPanel(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('trade-signal.panel', provider)
  );

  // Command: Set API key
  context.subscriptions.push(
    vscode.commands.registerCommand('trade-signal.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        prompt: 'Enter your Anthropic API Key',
        password: true,
        placeHolder: 'sk-ant-...',
        ignoreFocusOut: true
      });
      if (key) {
        await context.secrets.store('anthropicApiKey', key);
        vscode.window.showInformationMessage('✅ Trade Signal: API key saved securely.');
        provider.notifyApiKeySet();
      }
    })
  );

  // Command: Quick analyze from command palette
  context.subscriptions.push(
    vscode.commands.registerCommand('trade-signal.analyze', async () => {
      const ticker = await vscode.window.showInputBox({
        prompt: 'Enter ticker symbol to analyze',
        placeHolder: 'e.g. AAPL, MSFT, NVDA',
        validateInput: v => v && v.trim().length > 0 ? null : 'Enter a valid ticker'
      });
      if (ticker) {
        provider.analyzeTicker(ticker.trim().toUpperCase());
        await vscode.commands.executeCommand('trade-signal.panel.focus');
      }
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
