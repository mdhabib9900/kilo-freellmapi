import * as vscode from 'vscode';
import { FreeLLMAPIRouterEngine } from './routerEngine';

/**
 * Universal Inline Ghost-Text Completion, CodeAction & Hover Provider
 * Compatible with VS Code v1.70.2+ across all programming languages ({ pattern: '**' }).
 */
export class UniversalCodeIntelligence implements vscode.InlineCompletionItemProvider, vscode.CodeActionProvider, vscode.HoverProvider {
  private router: FreeLLMAPIRouterEngine;
  private cache = new Map<string, string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private statusBar: vscode.StatusBarItem;
  private requestSeq = 0;

  constructor(router: FreeLLMAPIRouterEngine, statusBar: vscode.StatusBarItem) {
    this.router = router;
    this.statusBar = statusBar;
  }

  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    const cfg = vscode.workspace.getConfiguration('kiloFreeLLM');
    const enabled = cfg.get<boolean>('inlineCompletions.enabled', true);
    if (!enabled && context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
      return undefined;
    }

    const currentLine = document.lineAt(position.line).text;
    const linePrefix = currentLine.slice(0, position.character);
    if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic && linePrefix.trim().length < 2) {
      return undefined;
    }

    const docVersionAtStart = document.version;
    const mySeq = ++this.requestSeq;

    const startLine = Math.max(0, position.line - 45);
    const endLine = Math.min(document.lineCount - 1, position.line + 20);
    const prefixRange = new vscode.Range(startLine, 0, position.line, position.character);
    const suffixRange = new vscode.Range(position.line, position.character, endLine, document.lineAt(endLine).text.length);

    const prefix = document.getText(prefixRange);
    const suffix = document.getText(suffixRange);
    const cacheKey = `${document.languageId}:${prefix.slice(-180)}|${suffix.slice(0, 80)}`;

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      return [new vscode.InlineCompletionItem(cached, new vscode.Range(position, position))];
    }

    const debounceMs =
      context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke
        ? 0
        : cfg.get<number>('inlineCompletions.debounceMs', 240);

    if (debounceMs > 0) {
      await new Promise<void>((resolve) => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(resolve, debounceMs);
      });
    }

    if (token.isCancellationRequested || mySeq !== this.requestSeq || document.version !== docVersionAtStart) {
      return undefined;
    }

    try {
      this.statusBar.text = '$(sync~spin) FreeLLMAPI FIM';
      const fimPrompt = [
        `Language: ${document.languageId} | File: ${document.fileName.split(/[\\/]/).pop()}`,
        'Complete the exact missing code at <CURSOR>. Return ONLY raw code to insert at <CURSOR> without markdown fences or repeating surrounding lines.',
        '--- CODE ---',
        `${prefix}<CURSOR>${suffix}`
      ].join('\n');

      const res = await this.router.completeChat({
        model: 'auto:fast',
        messages: [
          {
            role: 'system',
            content: 'You are a deterministic Fill-In-The-Middle (FIM) code completion engine for VS Code. Output ONLY the exact code snippet to insert at <CURSOR>. Never wrap in ``` fences.'
          },
          { role: 'user', content: fimPrompt }
        ],
        temperature: 0.1,
        maxTokens: 220,
        surface: 'vscode/inlineCompletion'
      });

      this.statusBar.text = `$(hubot) FreeLLMAPI (${res.servedModel})`;
      if (token.isCancellationRequested || mySeq !== this.requestSeq || document.version !== docVersionAtStart) {
        return undefined;
      }

      const cleaned = res.content
        .replace(/^```[\w-]*\n?/, '')
        .replace(/\n?```$/, '');

      if (!cleaned.trim()) return undefined;

      if (this.cache.size > 150) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, cleaned);

      return [new vscode.InlineCompletionItem(cleaned, new vscode.Range(position, position))];
    } catch {
      this.statusBar.text = '$(hubot) FreeLLMAPI';
      return undefined;
    }
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    if (context.diagnostics.length > 0) {
      const fixAction = new vscode.CodeAction(
        `FreeLLMAPI Kilo: Fix ${context.diagnostics.length} diagnostic issue(s)`,
        vscode.CodeActionKind.QuickFix
      );
      fixAction.command = {
        command: 'kiloFreeLLM.fixDiagnostics',
        title: 'Fix Diagnostics',
        arguments: [document.uri, context.diagnostics]
      };
      fixAction.isPreferred = true;
      actions.push(fixAction);
    }

    if (!range.isEmpty) {
      const refactorAction = new vscode.CodeAction(
        'FreeLLMAPI Kilo: Inline Edit / Refactor Selection',
        vscode.CodeActionKind.RefactorRewrite
      );
      refactorAction.command = { command: 'kiloFreeLLM.inlineEdit', title: 'Inline Refactor' };
      actions.push(refactorAction);

      const explainAction = new vscode.CodeAction(
        'FreeLLMAPI Kilo: Explain Selected Code',
        vscode.CodeActionKind.Refactor
      );
      explainAction.command = { command: 'kiloFreeLLM.explainCode', title: 'Explain Code' };
      actions.push(explainAction);

      const optimizeAction = new vscode.CodeAction(
        'FreeLLMAPI Kilo: Optimize Selection',
        vscode.CodeActionKind.RefactorRewrite
      );
      optimizeAction.command = { command: 'kiloFreeLLM.optimizeCode', title: 'Optimize Code' };
      actions.push(optimizeAction);

      const testAction = new vscode.CodeAction(
        'FreeLLMAPI Kilo: Generate Unit Tests',
        vscode.CodeActionKind.Refactor
      );
      testAction.command = { command: 'kiloFreeLLM.generateTests', title: 'Generate Tests' };
      actions.push(testAction);
    }

    return actions;
  }

  public provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const diagnostics = vscode.languages
      .getDiagnostics(document.uri)
      .filter((d) => d.range.start.line === position.line);

    if (diagnostics.length === 0) return undefined;

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown(`**FreeLLMAPI Kilo Debug Assistant**\n\n`);
    md.appendMarkdown(`Detected \`${diagnostics[0].message}\` (${document.languageId}).\n\n`);
    md.appendMarkdown(`[Fix Automatically](command:kiloFreeLLM.fixDiagnostics) · [Explain Issue](command:kiloFreeLLM.explainCode)`);
    return new vscode.Hover(md);
  }
}
