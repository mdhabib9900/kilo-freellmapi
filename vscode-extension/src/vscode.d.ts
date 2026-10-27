declare module 'vscode' {
  export interface Disposable {
    dispose(): any;
  }

  export class Uri {
    readonly scheme: string;
    readonly authority: string;
    readonly path: string;
    readonly fsPath: string;
    static file(path: string): Uri;
    static parse(value: string): Uri;
    static joinPath(base: Uri, ...pathSegments: string[]): Uri;
    with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri;
    toString(): string;
  }

  export class Position {
    readonly line: number;
    readonly character: number;
    constructor(line: number, character: number);
    translate(lineDelta?: number, characterDelta?: number): Position;
  }

  export class Range {
    readonly start: Position;
    readonly end: Position;
    readonly isEmpty: boolean;
    constructor(start: Position, end: Position);
    constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  }

  export class Selection extends Range {
    readonly anchor: Position;
    readonly active: Position;
    constructor(anchor: Position, active: Position);
  }

  export interface TextLine {
    readonly lineNumber: number;
    readonly text: string;
    readonly range: Range;
  }

  export interface TextDocument {
    readonly uri: Uri;
    readonly fileName: string;
    readonly languageId: string;
    readonly lineCount: number;
    readonly version: number;
    getText(range?: Range): string;
    lineAt(line: number | Position): TextLine;
    offsetAt(position: Position): number;
    positionAt(offset: number): Position;
    getWordRangeAtPosition(position: Position): Range | undefined;
    save(): Thenable<boolean>;
  }

  export interface TextEditorEdit {
    replace(location: Position | Range | Selection, value: string): void;
    insert(location: Position, value: string): void;
    delete(location: Range | Selection): void;
  }

  export interface TextEditor {
    readonly document: TextDocument;
    selection: Selection;
    selections: readonly Selection[];
    edit(callback: (editBuilder: TextEditorEdit) => void): Thenable<boolean>;
  }

  export class WorkspaceEdit {
    replace(uri: Uri, range: Range, newText: string): void;
    insert(uri: Uri, position: Position, newText: string): void;
    createFile(uri: Uri, options?: { overwrite?: boolean; ignoreIfExists?: boolean }): void;
  }

  export interface CancellationToken {
    readonly isCancellationRequested: boolean;
    onCancellationRequested: (listener: () => any) => Disposable;
  }

  export enum InlineCompletionTriggerKind {
    Invoke = 0,
    Automatic = 1
  }

  export interface InlineCompletionContext {
    readonly triggerKind: InlineCompletionTriggerKind;
  }

  export class InlineCompletionItem {
    insertText: string;
    range?: Range;
    command?: Command;
    constructor(insertText: string, range?: Range, command?: Command);
  }

  export class InlineCompletionList {
    items: InlineCompletionItem[];
    constructor(items: InlineCompletionItem[]);
  }

  export interface InlineCompletionItemProvider {
    provideInlineCompletionItems(
      document: TextDocument,
      position: Position,
      context: InlineCompletionContext,
      token: CancellationToken
    ): InlineCompletionItem[] | InlineCompletionList | Thenable<InlineCompletionItem[] | InlineCompletionList | undefined>;
  }

  export interface Command {
    title: string;
    command: string;
    arguments?: any[];
  }

  export class CodeActionKind {
    static readonly QuickFix: CodeActionKind;
    static readonly Refactor: CodeActionKind;
    static readonly RefactorRewrite: CodeActionKind;
  }

  export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3
  }

  export interface Diagnostic {
    range: Range;
    message: string;
    severity: DiagnosticSeverity;
    source?: string;
  }

  export interface CodeActionContext {
    readonly diagnostics: readonly Diagnostic[];
  }

  export class CodeAction {
    title: string;
    kind?: CodeActionKind;
    command?: Command;
    diagnostics?: Diagnostic[];
    isPreferred?: boolean;
    constructor(title: string, kind?: CodeActionKind);
  }

  export interface CodeActionProvider {
    provideCodeActions(
      document: TextDocument,
      range: Range | Selection,
      context: CodeActionContext,
      token: CancellationToken
    ): (Command | CodeAction)[] | Thenable<(Command | CodeAction)[]>;
  }

  export class MarkdownString {
    value: string;
    isTrusted?: boolean;
    constructor(value?: string);
    appendMarkdown(value: string): MarkdownString;
    appendCodeblock(value: string, language?: string): MarkdownString;
  }

  export class Hover {
    contents: MarkdownString[];
    range?: Range;
    constructor(contents: MarkdownString | MarkdownString[], range?: Range);
  }

  export interface HoverProvider {
    provideHover(document: TextDocument, position: Position, token: CancellationToken): Hover | undefined | Thenable<Hover | undefined>;
  }

  export interface SecretStorage {
    get(key: string): Thenable<string | undefined>;
    store(key: string, value: string): Thenable<void>;
    delete(key: string): Thenable<void>;
  }

  export interface Memento {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: any): Thenable<void>;
  }

  export interface ExtensionContext {
    readonly subscriptions: { push(...items: Disposable[]): number };
    readonly extensionUri: Uri;
    readonly extensionPath: string;
    readonly globalState: Memento;
    readonly workspaceState: Memento;
    readonly secrets: SecretStorage;
  }

  export interface WebviewOptions {
    enableScripts?: boolean;
    localResourceRoots?: readonly Uri[];
  }

  export interface Webview {
    options: WebviewOptions;
    html: string;
    readonly cspSource: string;
    onDidReceiveMessage: (listener: (e: any) => any) => Disposable;
    postMessage(message: any): Thenable<boolean>;
    asWebviewUri(localResource: Uri): Uri;
  }

  export interface WebviewView {
    readonly webview: Webview;
    show(preserveFocus?: boolean): void;
  }

  export interface WebviewViewResolveContext {
    readonly state: unknown;
  }

  export interface WebviewViewProvider {
    resolveWebviewView(
      webviewView: WebviewView,
      context: WebviewViewResolveContext,
      token: CancellationToken
    ): void | Thenable<void>;
  }

  export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
    Two = 2
  }

  export interface WebviewPanel extends Disposable {
    readonly webview: Webview;
    reveal(viewColumn?: ViewColumn, preserveFocus?: boolean): void;
    onDidDispose: (listener: () => any) => Disposable;
  }

  export enum StatusBarAlignment {
    Left = 1,
    Right = 2
  }

  export interface StatusBarItem extends Disposable {
    text: string;
    tooltip?: string;
    command?: string;
    show(): void;
    hide(): void;
  }

  export interface OutputChannel extends Disposable {
    appendLine(value: string): void;
    show(preserveFocus?: boolean): void;
  }

  export interface Terminal extends Disposable {
    sendText(text: string, addNewLine?: boolean): void;
    show(preserveFocus?: boolean): void;
  }

  export interface WorkspaceFolder {
    readonly uri: Uri;
    readonly name: string;
  }

  export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string): T | undefined;
    get<T>(section: string, defaultValue: T): T;
    update(section: string, value: any, configurationTarget?: ConfigurationTarget | boolean): Thenable<void>;
  }

  export interface QuickPickItem {
    label: string;
    description?: string;
    detail?: string;
  }

  export type DocumentSelector = string | { scheme?: string; language?: string; pattern?: string };

  export namespace window {
    export const activeTextEditor: TextEditor | undefined;
    export function showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
    export function showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>;
    export function showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>;
    export function showInputBox(options?: { prompt?: string; placeHolder?: string; password?: boolean; value?: string }): Thenable<string | undefined>;
    export function showQuickPick<T extends QuickPickItem>(items: T[], options?: { placeHolder?: string; title?: string }): Thenable<T | undefined>;
    export function createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem;
    export function createOutputChannel(name: string): OutputChannel;
    export function createTerminal(name?: string): Terminal;
    export function registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider, options?: { webviewOptions?: { retainContextWhenHidden?: boolean } }): Disposable;
    export function createWebviewPanel(viewType: string, title: string, showOptions: ViewColumn, options?: WebviewOptions & { retainContextWhenHidden?: boolean }): WebviewPanel;
    export function showTextDocument(document: TextDocument | Uri, column?: ViewColumn): Thenable<TextEditor>;
  }

  export interface ConfigurationChangeEvent {
    affectsConfiguration(section: string): boolean;
  }

  export namespace workspace {
    export const workspaceFolders: readonly WorkspaceFolder[] | undefined;
    export function getConfiguration(section?: string): WorkspaceConfiguration;
    export function onDidChangeConfiguration(listener: (e: ConfigurationChangeEvent) => any): Disposable;
    export function openTextDocument(uri: Uri | { content?: string; language?: string }): Thenable<TextDocument>;
    export function applyEdit(edit: WorkspaceEdit): Thenable<boolean>;
    export function findFiles(include: string, exclude?: string, maxResults?: number): Thenable<Uri[]>;
  }

  export namespace commands {
    export function registerCommand(command: string, callback: (...args: any[]) => any): Disposable;
    export function executeCommand<T = unknown>(command: string, ...rest: any[]): Thenable<T>;
  }

  export namespace languages {
    export function registerInlineCompletionItemProvider(selector: DocumentSelector, provider: InlineCompletionItemProvider): Disposable;
    export function registerCodeActionsProvider(selector: DocumentSelector, provider: CodeActionProvider, metadata?: { providedCodeActionKinds?: readonly CodeActionKind[] }): Disposable;
    export function registerHoverProvider(selector: DocumentSelector, provider: HoverProvider): Disposable;
    export function getDiagnostics(resource: Uri): Diagnostic[];
  }

  export namespace env {
    export const clipboard: { writeText(value: string): Thenable<void> };
  }
}
