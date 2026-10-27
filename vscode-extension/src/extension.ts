import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { FreeLLMAPIRouterEngine, RoutingStrategy, KeySelectionStrategy } from './routerEngine';
import { UniversalCodeIntelligence } from './completionProvider';
import { KiloAgentSidebarProvider, FreeLLMAPIRouterViewProvider, KiloAgentMode } from './kiloAgentProvider';

let routerEngine: FreeLLMAPIRouterEngine | undefined;
let dashboardPanel: vscode.WebviewPanel | undefined;

function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDashboardHtml(engine: FreeLLMAPIRouterEngine): string {
  const snap = engine.getStateSnapshot();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body { margin:0; padding:24px; background:#090D16; color:#F1F5F9; font-family:system-ui,-apple-system,sans-serif; }
    .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:16px 0; }
    .card { padding:14px; border:1px solid #1E293B; border-radius:8px; background:#0F172A; font-variant-numeric:tabular-nums; }
    table { width:100%; border-collapse:collapse; margin-top:12px; font-size:13px; font-variant-numeric:tabular-nums; }
    th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #1E293B; }
    code { background:#070B14; padding:2px 6px; border-radius:4px; color:#38BDF8; }
  </style>
</head>
<body>
  <h2 style="margin:0 0 6px;">FreeLLMAPI v0.16.9 Router Dashboard</h2>
  <div style="color:#94A3B8;font-size:13px;">
    Local Base URL: <code>http://127.0.0.1:${snap.port}/v1</code> · Unified Token: <code>${escapeHtml(snap.unifiedToken)}</code>
  </div>
  <div class="grid">
    <div class="card"><div style="color:#94A3B8;font-size:12px;">Routing Strategy</div><div style="font-size:20px;font-weight:700;margin-top:4px;">${escapeHtml(snap.strategy)}</div></div>
    <div class="card"><div style="color:#94A3B8;font-size:12px;">Vault Keys</div><div style="font-size:20px;font-weight:700;margin-top:4px;">${snap.keys.length}</div></div>
    <div class="card"><div style="color:#94A3B8;font-size:12px;">p50 / p95 Latency</div><div style="font-size:20px;font-weight:700;margin-top:4px;">${snap.analytics.p50LatencyMs}ms / ${snap.analytics.p95LatencyMs}ms</div></div>
    <div class="card"><div style="color:#94A3B8;font-size:12px;">Compression Saved</div><div style="font-size:20px;font-weight:700;margin-top:4px;">${snap.analytics.totalSavedTokens} tok</div></div>
  </div>
  <h3>Fallback Chain &amp; Multi-Modal Catalog</h3>
  <table>
    <thead><tr><th>Model ID</th><th>Platform</th><th>Modality</th><th>Context</th><th>Intel / Speed / Rel</th></tr></thead>
    <tbody>
      ${snap.catalog
        .map(
          (m) =>
            `<tr><td><code>${escapeHtml(m.id)}</code></td><td>${escapeHtml(m.platform)}</td><td>${escapeHtml(m.modality)}</td><td>${m.contextWindow.toLocaleString()}</td><td>${m.intelligenceRank} / ${m.speedRank} / ${m.reliabilityScore}</td></tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('FreeLLMAPI Router');
  context.subscriptions.push(output);

  let vaultSeed = await context.secrets.get('kiloFreeLLM.masterVaultSeed');
  if (!vaultSeed) {
    vaultSeed = crypto.randomBytes(32).toString('hex');
    await context.secrets.store('kiloFreeLLM.masterVaultSeed', vaultSeed);
  }

  routerEngine = new FreeLLMAPIRouterEngine(vaultSeed);

  const savedBackup = await context.secrets.get('kiloFreeLLM.vaultState');
  if (savedBackup) {
    try {
      routerEngine.importEncryptedBackup(savedBackup);
    } catch {
      output.appendLine('Initialized clean encrypted vault.');
    }
  }

  const syncSettingsToRouter = () => {
    if (!routerEngine) return;
    const cfg = vscode.workspace.getConfiguration('kiloFreeLLM');
    routerEngine.setStrategy(cfg.get<RoutingStrategy>('routingStrategy', 'balanced'));
    routerEngine.setKeySelectionStrategy(cfg.get<KeySelectionStrategy>('keySelectionStrategy', 'auto'));
    routerEngine.setCompression(cfg.get<boolean>('promptCompression.enabled', true));
  };
  syncSettingsToRouter();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((ev) => {
      if (ev.affectsConfiguration('kiloFreeLLM')) {
        syncSettingsToRouter();
      }
    })
  );

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(hubot) FreeLLMAPI';
  statusBar.tooltip = 'FreeLLMAPI Kilo Agent & Multi-Provider Router (Click to open Dashboard)';
  statusBar.command = 'kiloFreeLLM.openRouterDashboard';
  statusBar.show();
  context.subscriptions.push(statusBar);

  const initialCfg = vscode.workspace.getConfiguration('kiloFreeLLM');
  if (initialCfg.get<boolean>('autoStartRouter', true)) {
    const port = initialCfg.get<number>('routerPort', 3001);
    const boundPort = await routerEngine.startServer(port);
    output.appendLine(`FreeLLMAPI v0.16.9 router active on http://127.0.0.1:${boundPort}/v1`);
  }

  const intelligence = new UniversalCodeIntelligence(routerEngine, statusBar);
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, intelligence),
    vscode.languages.registerCodeActionsProvider({ pattern: '**' }, intelligence, {
      providedCodeActionKinds: [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.Refactor,
        vscode.CodeActionKind.RefactorRewrite
      ]
    }),
    vscode.languages.registerHoverProvider({ pattern: '**' }, intelligence)
  );

  const agentProvider = new KiloAgentSidebarProvider(context, routerEngine);
  const routerViewProvider = new FreeLLMAPIRouterViewProvider(context, routerEngine);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(KiloAgentSidebarProvider.viewType, agentProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.window.registerWebviewViewProvider(FreeLLMAPIRouterViewProvider.viewType, routerViewProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kiloFreeLLM.openAgent', () => {
      vscode.commands.executeCommand('kiloFreeLLM.agentView.focus');
    }),

    vscode.commands.registerCommand('kiloFreeLLM.triggerCompletion', () => {
      vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    }),

    vscode.commands.registerCommand('kiloFreeLLM.switchMode', async () => {
      const modes: Array<{ label: KiloAgentMode; description: string }> = [
        { label: 'architect', description: 'Design multi-file system architecture and execution plan' },
        { label: 'code', description: 'Autonomous multi-language coding and diff generation' },
        { label: 'ask', description: 'Codebase Q&A with @file and @problems context' },
        { label: 'debug', description: 'Diagnose compiler errors, stack traces and runtime bugs' },
        { label: 'orchestrator', description: 'Boomerang task decomposition across sub-modes' }
      ];
      const selected = await vscode.window.showQuickPick(modes, {
        placeHolder: 'Select Kilo Agent Mode'
      });
      if (selected) {
        agentProvider.setMode(selected.label);
      }
    }),

    vscode.commands.registerCommand('kiloFreeLLM.inlineEdit', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const instruction = await vscode.window.showInputBox({
        prompt: 'Inline Edit: Describe how to transform or generate code here',
        placeHolder: 'e.g., Add retry backoff, convert to async/await, add strong types...'
      });
      if (!instruction || !routerEngine) return;

      const selection = editor.selection;
      const selectedCode = selection.isEmpty
        ? editor.document.lineAt(selection.active.line).text
        : editor.document.getText(selection);

      statusBar.text = '$(sync~spin) FreeLLMAPI Editing...';
      try {
        const res = await routerEngine.completeChat({
          model: 'auto:coding',
          surface: 'vscode/inlineEdit',
          messages: [
            {
              role: 'system',
              content: `Rewrite the ${editor.document.languageId} snippet per the user's instruction. Output ONLY valid replacement code with zero markdown fences.`
            },
            {
              role: 'user',
              content: `Instruction: ${instruction}\n\nOriginal (${editor.document.languageId}):\n${selectedCode}`
            }
          ],
          temperature: 0.15
        });
        const replacement = res.content.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '');
        const targetRange = selection.isEmpty ? editor.document.lineAt(selection.active.line).range : selection;
        await editor.edit((eb) => eb.replace(targetRange, replacement));
        statusBar.text = `$(hubot) FreeLLMAPI (${res.servedModel})`;
      } catch (err: any) {
        statusBar.text = '$(hubot) FreeLLMAPI';
        vscode.window.showErrorMessage(`Inline Edit failed: ${err?.message || err}`);
      }
    }),

    vscode.commands.registerCommand('kiloFreeLLM.explainCode', async () => {
      await agentProvider.sendTaskToAgent('Explain the selected code clearly, including data flow and edge cases.', 'ask');
    }),

    vscode.commands.registerCommand('kiloFreeLLM.fixDiagnostics', async () => {
      await agentProvider.sendTaskToAgent('Inspect @problems in the active file, explain root causes, and emit a clean fix.', 'debug');
    }),

    vscode.commands.registerCommand('kiloFreeLLM.optimizeCode', async () => {
      await agentProvider.sendTaskToAgent('Optimize the selected code for complexity, readability, and safety.', 'code');
    }),

    vscode.commands.registerCommand('kiloFreeLLM.generateTests', async () => {
      await agentProvider.sendTaskToAgent('Write unit tests covering normal paths and edge cases for the selected code.', 'code');
    }),

    vscode.commands.registerCommand('kiloFreeLLM.startLocalRouter', async () => {
      if (!routerEngine) return;
      routerEngine.stopServer();
      const port = vscode.workspace.getConfiguration('kiloFreeLLM').get<number>('routerPort', 3001);
      const active = await routerEngine.startServer(port);
      vscode.window.showInformationMessage(`FreeLLMAPI Router active on http://127.0.0.1:${active}/v1`);
    }),

    vscode.commands.registerCommand('kiloFreeLLM.setupCliAgents', async () => {
      if (!routerEngine) return;
      const snap = routerEngine.getStateSnapshot();
      const chosen = await vscode.window.showQuickPick(
        snap.cliRecipes.map((r) => ({
          label: r.name,
          description: r.protocol,
          detail: `${r.command} --url http://127.0.0.1:${snap.port} --api-key ${snap.unifiedToken}`
        })),
        { placeHolder: 'Copy CLI setup command for external coding agent' }
      );
      if (chosen && chosen.detail) {
        await vscode.env.clipboard.writeText(chosen.detail);
        vscode.window.showInformationMessage(`Copied ${chosen.label} setup command to clipboard.`);
      }
    }),

    vscode.commands.registerCommand('kiloFreeLLM.applyHighVisTheme', async () => {
      await vscode.workspace
        .getConfiguration('workbench')
        .update('colorTheme', 'FreeLLMAPI Kilo High-Visibility', vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('Activated FreeLLMAPI Kilo High-Visibility theme.');
    }),

    vscode.commands.registerCommand('kiloFreeLLM.openRouterDashboard', () => {
      if (!routerEngine) return;
      if (dashboardPanel) {
        dashboardPanel.webview.html = renderDashboardHtml(routerEngine);
        dashboardPanel.reveal(vscode.ViewColumn.One);
        return;
      }
      dashboardPanel = vscode.window.createWebviewPanel(
        'kiloFreeLLMDashboard',
        'FreeLLMAPI Router Dashboard',
        vscode.ViewColumn.One,
        { enableScripts: false, retainContextWhenHidden: true }
      );
      dashboardPanel.onDidDispose(() => {
        dashboardPanel = undefined;
      });
      dashboardPanel.webview.html = renderDashboardHtml(routerEngine);
    })
  );
}

export async function deactivate(): Promise<void> {
  if (routerEngine) {
    routerEngine.stopServer();
  }
}
