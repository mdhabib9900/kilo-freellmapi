import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FreeLLMAPIRouterEngine } from './routerEngine';

export type KiloAgentMode = 'architect' | 'code' | 'ask' | 'debug' | 'orchestrator';

const MODE_PROMPTS: Record<KiloAgentMode, string> = {
  architect:
    'You are Kilo FreeLLM in ARCHITECT mode. Analyze system boundaries, trade-offs, and multi-file plans before proposing clean implementation steps.',
  code:
    'You are Kilo FreeLLM in CODE mode. Write complete, production-grade code across any language. When proposing file changes, emit <write_file path="relative/path.ext">...full code...</write_file> blocks so the user can inspect diffs and apply with one click.',
  ask:
    'You are Kilo FreeLLM in ASK mode. Provide clear explanations, complexity analysis, and concrete examples grounded in the active workspace files.',
  debug:
    'You are Kilo FreeLLM in DEBUG mode. Diagnose root causes from stack traces, compiler diagnostics, and state mutations, then emit surgical <write_file path="...">...</write_file> fixes.',
  orchestrator:
    'You are Kilo FreeLLM in ORCHESTRATOR (Boomerang) mode. Decompose complex engineering goals into numbered sub-tasks (Architect -> Code -> Verify) and execute them systematically.'
};

function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveSafeWorkspacePath(rootDir: string, candidateRelPath: string): string | null {
  const normalizedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(normalizedRoot, candidateRelPath);
  if (resolvedTarget === normalizedRoot || !resolvedTarget.startsWith(normalizedRoot + path.sep)) {
    return null;
  }
  return resolvedTarget;
}

export class KiloAgentSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kiloFreeLLM.agentView';
  private view?: vscode.WebviewView;
  private mode: KiloAgentMode = 'code';
  private activeModel = 'auto:coding';
  private context: vscode.ExtensionContext;
  private router: FreeLLMAPIRouterEngine;

  constructor(context: vscode.ExtensionContext, router: FreeLLMAPIRouterEngine) {
    this.context = context;
    this.router = router;
    const configuredProfile = vscode.workspace.getConfiguration('kiloFreeLLM').get<string>('activeProfile', 'auto:coding');
    if (configuredProfile) {
      this.activeModel = configuredProfile;
    }
  }

  public setMode(mode: KiloAgentMode): void {
    this.mode = mode;
    this.view?.webview.postMessage({ type: 'modeChanged', mode });
  }

  public async sendTaskToAgent(prompt: string, forcedMode?: KiloAgentMode): Promise<void> {
    if (forcedMode) this.setMode(forcedMode);
    this.view?.show(true);
    this.view?.webview.postMessage({ type: 'injectUserPrompt', prompt });
    await this.handleUserPrompt(prompt);
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    webviewView.webview.html = this.buildAgentHtml();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'prompt') {
        if (msg.mode) this.mode = msg.mode;
        if (msg.model) this.activeModel = msg.model;
        await this.handleUserPrompt(String(msg.text || ''));
      } else if (msg.type === 'applyFileBlock') {
        await this.applyProposedFile(String(msg.filePath || ''), String(msg.content || ''));
      } else if (msg.type === 'previewDiff') {
        await this.previewDiffInEditor(String(msg.filePath || ''), String(msg.content || ''));
      } else if (msg.type === 'openDashboard') {
        vscode.commands.executeCommand('kiloFreeLLM.openRouterDashboard');
      }
    });
  }

  private async gatherContext(rawPrompt: string): Promise<string> {
    const parts: string[] = [];
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const fileName = vscode.workspace.workspaceFolders?.[0]
        ? path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, editor.document.fileName)
        : editor.document.fileName;
      const selectionText = !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '';
      parts.push(`Active Editor File: ${fileName} (${editor.document.languageId})`);
      if (selectionText) {
        parts.push(`Selected Code:\n\`\`\`${editor.document.languageId}\n${selectionText}\n\`\`\``);
      } else {
        parts.push(`Current File Snippet:\n\`\`\`${editor.document.languageId}\n${editor.document.getText().slice(0, 6000)}\n\`\`\``);
      }
      if (rawPrompt.includes('@problems') || this.mode === 'debug') {
        const diags = vscode.languages.getDiagnostics(editor.document.uri);
        if (diags.length > 0) {
          parts.push(
            `Active Diagnostics:\n` +
              diags.map((d) => `- Line ${d.range.start.line + 1}: ${d.message}`).join('\n')
          );
        }
      }
    }

    const fileMentions = rawPrompt.match(/@([\w./-]+\.[\w]+)/g) || [];
    const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (rootDir) {
      for (const mention of fileMentions) {
        const rel = mention.slice(1);
        const safeFull = resolveSafeWorkspacePath(rootDir, rel);
        if (safeFull && fs.existsSync(safeFull) && fs.statSync(safeFull).isFile()) {
          parts.push(`Referenced ${rel}:\n\`\`\`\n${fs.readFileSync(safeFull, 'utf8').slice(0, 8000)}\n\`\`\``);
        }
      }
    }
    return parts.join('\n\n');
  }

  private async handleUserPrompt(text: string): Promise<void> {
    if (!text.trim()) return;
    this.view?.webview.postMessage({ type: 'status', status: `Routing via ${this.activeModel} (${this.mode.toUpperCase()})...` });

    try {
      const workspaceContext = await this.gatherContext(text);
      const result = await this.router.completeChat({
        model: this.activeModel,
        sessionId: 'kilo-sidebar-session',
        surface: `kilo-agent/${this.mode}`,
        messages: [
          { role: 'system', content: MODE_PROMPTS[this.mode] },
          {
            role: 'user',
            content: workspaceContext ? `${workspaceContext}\n\nUser Task:\n${text}` : text
          }
        ]
      });

      const fileProposals: Array<{ path: string; content: string }> = [];
      const regex = /<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(result.content)) !== null) {
        fileProposals.push({
          path: match[1].trim(),
          content: match[2].replace(/^\n/, '').replace(/\n$/, '')
        });
      }

      const displayContent = result.content
        .replace(/<write_file\s+path="([^"]+)">[\s\S]*?<\/write_file>/g, (_m, p) => `[Proposed file update: ${p}]`)
        .trim();

      const autoWrite = vscode.workspace.getConfiguration('kiloFreeLLM').get<boolean>('agent.autoApproveWrite', false);
      if (autoWrite && fileProposals.length > 0) {
        for (const fp of fileProposals) {
          await this.applyProposedFile(fp.path, fp.content);
        }
      }

      this.view?.webview.postMessage({
        type: 'assistantReply',
        content: displayContent || result.content,
        servedModel: result.servedModel,
        platform: result.platform,
        latencyMs: result.latencyMs,
        savedTokens: result.savedTokens,
        fileProposals
      });
    } catch (err: any) {
      this.view?.webview.postMessage({
        type: 'error',
        message: err?.message || 'Router request failed. Add a provider key or verify network access.'
      });
    }
  }

  private async previewDiffInEditor(relPath: string, newContent: string): Promise<void> {
    const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const safePath = rootDir ? resolveSafeWorkspacePath(rootDir, relPath) : null;
    const targetUri = safePath ? vscode.Uri.file(safePath) : vscode.window.activeTextEditor?.document.uri;
    const proposedDoc = await vscode.workspace.openTextDocument({ content: newContent });
    if (targetUri && fs.existsSync(targetUri.fsPath)) {
      await vscode.commands.executeCommand('vscode.diff', targetUri, proposedDoc.uri, `Kilo Diff: ${relPath}`);
    } else {
      await vscode.window.showTextDocument(proposedDoc, vscode.ViewColumn.Beside);
    }
  }

  private async applyProposedFile(relPath: string, newContent: string): Promise<void> {
    const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!rootDir) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const lastLine = Math.max(0, editor.document.lineCount - 1);
        const fullRange = new vscode.Range(0, 0, lastLine, editor.document.lineAt(lastLine).text.length);
        await editor.edit((eb) => eb.replace(fullRange, newContent));
        vscode.window.showInformationMessage('Kilo FreeLLM applied changes to active editor.');
      }
      return;
    }
    const fullPath = resolveSafeWorkspacePath(rootDir, relPath);
    if (!fullPath) {
      vscode.window.showErrorMessage(`Blocked unsafe relative path outside workspace: ${relPath}`);
      return;
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, newContent, 'utf8');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Kilo FreeLLM updated ${relPath}`);
  }

  private buildAgentHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<style>
  :root {
    --bg: #090D16; --surface: #0F172A; --border: #1E293B;
    --fg: #F1F5F9; --muted: #94A3B8; --accent: #38BDF8;
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12px; background: var(--bg); color: var(--fg); font-family: var(--vscode-font-family, system-ui, sans-serif); font-size: 12.5px; display: flex; flex-direction: column; height: 100vh; }
  .toolbar { display: flex; gap: 6px; margin-bottom: 10px; align-items: center; }
  select, button, textarea { font: inherit; color: var(--fg); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; }
  select { padding: 5px 8px; flex: 1; }
  .btn { padding: 5px 10px; cursor: pointer; background: #0284C7; border-color: #0284C7; color: #fff; font-weight: 600; }
  .btn-ghost { padding: 5px 8px; cursor: pointer; background: var(--surface); }
  #feed { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-bottom: 10px; }
  .msg { padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .msg.user { background: #0C192C; border-color: #0369A1; }
  .meta { font-size: 11px; color: var(--muted); margin-bottom: 6px; font-variant-numeric: tabular-nums; }
  .diff-card { margin-top: 8px; padding: 8px; border: 1px solid #334155; border-radius: 6px; background: #070B14; display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .composer { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border); padding-top: 8px; }
  textarea { width: 100%; min-height: 68px; padding: 8px; resize: vertical; }
</style>
</head>
<body>
  <div class="toolbar">
    <select id="modeSelect" title="Kilo Agent Mode">
      <option value="code" selected>Code Mode</option>
      <option value="architect">Architect Mode</option>
      <option value="ask">Ask Mode</option>
      <option value="debug">Debug Mode</option>
      <option value="orchestrator">Orchestrator Mode</option>
    </select>
    <select id="modelSelect" title="FreeLLMAPI Chain / Model">
      <option value="auto:coding">auto:coding</option>
      <option value="fusion">fusion (Multi-Model)</option>
      <option value="auto:architect">auto:architect</option>
      <option value="auto:fast">auto:fast</option>
    </select>
    <button class="btn-ghost" id="dashBtn" title="Open FreeLLMAPI Router Dashboard">Router</button>
  </div>
  <div id="feed">
    <div class="msg">
      <div class="meta">FreeLLMAPI Kilo v0.16.9 · VS Code v1.70.2+</div>
      Use @filename or @problems to attach workspace context. Switch between Architect, Code, Ask, Debug, and Orchestrator modes, or run multi-model Fusion synthesis.
    </div>
  </div>
  <div class="composer">
    <textarea id="input" placeholder="Describe feature, refactor, or bug fix... (@problems, @file)"></textarea>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span id="statusText" style="font-size:11px;color:var(--muted);">Inline Ghost-Text Active</span>
      <button class="btn" id="sendBtn">Run Agent</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const feed = document.getElementById('feed');
    const input = document.getElementById('input');
    const modeSelect = document.getElementById('modeSelect');
    const modelSelect = document.getElementById('modelSelect');
    const statusText = document.getElementById('statusText');

    function appendMessage(cls, meta, body, proposals) {
      const div = document.createElement('div');
      div.className = 'msg ' + cls;
      const m = document.createElement('div');
      m.className = 'meta';
      m.textContent = meta;
      div.appendChild(m);
      const b = document.createElement('div');
      b.textContent = body;
      div.appendChild(b);
      if (Array.isArray(proposals)) {
        proposals.forEach((fp) => {
          const card = document.createElement('div');
          card.className = 'diff-card';
          const label = document.createElement('span');
          label.textContent = fp.path;
          const actions = document.createElement('div');
          actions.style.display = 'flex';
          actions.style.gap = '4px';
          const diffBtn = document.createElement('button');
          diffBtn.className = 'btn-ghost';
          diffBtn.textContent = 'Diff';
          diffBtn.onclick = () => vscode.postMessage({ type: 'previewDiff', filePath: fp.path, content: fp.content });
          const applyBtn = document.createElement('button');
          applyBtn.className = 'btn';
          applyBtn.textContent = 'Apply';
          applyBtn.onclick = () => vscode.postMessage({ type: 'applyFileBlock', filePath: fp.path, content: fp.content });
          actions.appendChild(diffBtn);
          actions.appendChild(applyBtn);
          card.appendChild(label);
          card.appendChild(actions);
          div.appendChild(card);
        });
      }
      feed.appendChild(div);
      feed.scrollTop = feed.scrollHeight;
    }

    function submitPrompt() {
      const text = input.value.trim();
      if (!text) return;
      appendMessage('user', 'Developer · ' + modeSelect.value, text);
      vscode.postMessage({ type: 'prompt', text, mode: modeSelect.value, model: modelSelect.value });
      input.value = '';
    }

    document.getElementById('sendBtn').onclick = submitPrompt;
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        submitPrompt();
      }
    });
    document.getElementById('dashBtn').onclick = () => vscode.postMessage({ type: 'openDashboard' });

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'status') statusText.textContent = msg.status;
      if (msg.type === 'modeChanged') modeSelect.value = msg.mode;
      if (msg.type === 'injectUserPrompt') appendMessage('user', 'Editor Action', msg.prompt);
      if (msg.type === 'assistantReply') {
        statusText.textContent = msg.servedModel + ' · ' + msg.latencyMs + 'ms';
        appendMessage('assistant', msg.platform + '/' + msg.servedModel + ' · saved ' + msg.savedTokens + ' tok', msg.content, msg.fileProposals);
      }
      if (msg.type === 'error') {
        statusText.textContent = 'Error';
        appendMessage('assistant', 'Router Alert', msg.message);
      }
    });
  </script>
</body>
</html>`;
  }
}

export class FreeLLMAPIRouterViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kiloFreeLLM.routerView';
  private context: vscode.ExtensionContext;
  private router: FreeLLMAPIRouterEngine;

  constructor(context: vscode.ExtensionContext, router: FreeLLMAPIRouterEngine) {
    this.context = context;
    this.router = router;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: true };
    const render = () => {
      const snap = this.router.getStateSnapshot();
      webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
</head>
<body style="margin:0;padding:12px;background:#090D16;color:#F1F5F9;font-family:system-ui,sans-serif;font-size:12px;font-variant-numeric:tabular-nums;">
  <div style="font-weight:700;margin-bottom:8px;">FreeLLMAPI v0.16.9 Local Gateway</div>
  <div style="padding:8px;border:1px solid #1E293B;border-radius:6px;background:#0F172A;margin-bottom:10px;">
    <div>Endpoint: <code>http://127.0.0.1:${snap.port}/v1</code></div>
    <div style="margin-top:4px;">Strategy: <strong>${escapeHtml(snap.strategy)}</strong> · Keys: <strong>${snap.keys.length}</strong></div>
    <div style="margin-top:4px;">Requests: <strong>${snap.analytics.totalRequests}</strong> · p95: <strong>${snap.analytics.p95LatencyMs}ms</strong></div>
  </div>
  <button id="addKey" style="width:100%;padding:7px;background:#0284C7;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:600;margin-bottom:6px;">Add Provider API Key to AES-256 Vault</button>
  <button id="openFull" style="width:100%;padding:7px;background:#0F172A;color:#F1F5F9;border:1px solid #334155;border-radius:6px;cursor:pointer;">Open Router &amp; Analytics Dashboard</button>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('addKey').onclick = () => vscode.postMessage({ type: 'promptAddKey' });
    document.getElementById('openFull').onclick = () => vscode.postMessage({ type: 'openFull' });
  </script>
</body>
</html>`;
    };
    render();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'openFull') {
        vscode.commands.executeCommand('kiloFreeLLM.openRouterDashboard');
      } else if (msg.type === 'promptAddKey') {
        const picked = await vscode.window.showQuickPick(
          this.router.getStateSnapshot().platforms.map((p) => ({ label: p.id, description: p.name, detail: p.baseUrl })),
          { placeHolder: 'Select upstream FreeLLMAPI provider' }
        );
        if (!picked) return;
        const rawKey = await vscode.window.showInputBox({
          prompt: `Enter ${picked.description} API Key (encrypted with AES-256-GCM in VS Code SecretStorage)`,
          password: true
        });
        if (rawKey) {
          this.router.addProviderKey(picked.label, `${picked.label}-vault`, rawKey.trim());
          await this.context.secrets.store('kiloFreeLLM.vaultState', this.router.exportEncryptedBackup());
          render();
          vscode.window.showInformationMessage(`Saved ${picked.description} key to encrypted vault.`);
        }
      }
    });
  }
}
