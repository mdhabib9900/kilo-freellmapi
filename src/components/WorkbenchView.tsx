import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FileCode2,
  Wand2,
  Check,
  X,
  Play,
  GitCompare,
  AlertTriangle,
  Sparkles,
  FilePlus2
} from 'lucide-react';
import {
  WorkspaceFile,
  KiloMode,
  AgentChatMessage,
  ProposedFileEdit,
  ThemeMode,
  computeLiveDiagnostics
} from '../types';

interface WorkbenchViewProps {
  theme: ThemeMode;
  files: WorkspaceFile[];
  setFiles: React.Dispatch<React.SetStateAction<WorkspaceFile[]>>;
  onRouterActivity: () => void;
}

const LANGUAGE_BY_EXT: Record<string, { language: string; commentPrefix: string; commentSuffix?: string }> = {
  ts: { language: 'typescript', commentPrefix: '// ' },
  tsx: { language: 'typescriptreact', commentPrefix: '// ' },
  js: { language: 'javascript', commentPrefix: '// ' },
  jsx: { language: 'javascriptreact', commentPrefix: '// ' },
  py: { language: 'python', commentPrefix: '# ' },
  rs: { language: 'rust', commentPrefix: '// ' },
  go: { language: 'go', commentPrefix: '// ' },
  cpp: { language: 'cpp', commentPrefix: '// ' },
  c: { language: 'c', commentPrefix: '// ' },
  java: { language: 'java', commentPrefix: '// ' },
  cs: { language: 'csharp', commentPrefix: '// ' },
  php: { language: 'php', commentPrefix: '// ' },
  rb: { language: 'ruby', commentPrefix: '# ' },
  kt: { language: 'kotlin', commentPrefix: '// ' },
  swift: { language: 'swift', commentPrefix: '// ' },
  sh: { language: 'shellscript', commentPrefix: '# ' },
  sql: { language: 'sql', commentPrefix: '-- ' },
  html: { language: 'html', commentPrefix: '<!-- ', commentSuffix: ' -->' },
  css: { language: 'css', commentPrefix: '/* ', commentSuffix: ' */' },
  json: { language: 'json', commentPrefix: '' }
};

function inferLanguageMeta(filePath: string): { language: string; starter: string } {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const meta = LANGUAGE_BY_EXT[ext];
  if (!meta) {
    return { language: 'plaintext', starter: '' };
  }
  if (meta.language === 'json') {
    return { language: 'json', starter: '{\n  \n}\n' };
  }
  const suffix = meta.commentSuffix || '';
  return {
    language: meta.language,
    starter: `${meta.commentPrefix}${filePath}${suffix}\n`
  };
}

export const WorkbenchView: React.FC<WorkbenchViewProps> = ({
  theme,
  files,
  setFiles,
  onRouterActivity
}) => {
  const isHighVis = theme === 'high-vis';
  const [activePath, setActivePath] = useState<string>(files[0]?.path || '');
  const [cursorOffset, setCursorOffset] = useState<number>(0);
  const [ghostSuggestion, setGhostSuggestion] = useState<string>('');
  const [ghostLoading, setGhostLoading] = useState<boolean>(false);
  const [autoGhostEnabled, setAutoGhostEnabled] = useState<boolean>(true);

  const [creatingFile, setCreatingFile] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('utils/validator.ts');

  const [inlineBarOpen, setInlineBarOpen] = useState<boolean>(false);
  const [inlineInstruction, setInlineInstruction] = useState<string>('');
  const [inlineBusy, setInlineBusy] = useState<boolean>(false);
  const [inlineError, setInlineError] = useState<string>('');
  const [pendingDiff, setPendingDiff] = useState<{
    targetPath: string;
    original: string;
    proposed: string;
    summary: string;
  } | null>(null);

  const [kiloMode, setKiloMode] = useState<KiloMode>('code');
  const [selectedChain, setSelectedChain] = useState<string>('auto:coding');
  const [agentInput, setAgentInput] = useState<string>('');
  const [agentBusy, setAgentBusy] = useState<boolean>(false);
  const [messages, setMessages] = useState<AgentChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      mode: 'code',
      text: 'Kilo Agent ready (VS Code v1.70.2+ engine). Switch between Architect, Code, Ask, Debug, and Orchestrator modes to inspect files, generate multi-file diffs, resolve diagnostics, or trigger inline ghost-text completions across any language.',
      servedModel: 'auto:coding'
    }
  ]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const ghostAbortRef = useRef<AbortController | null>(null);
  const ghostSeqRef = useRef<number>(0);

  const activeFile = files.find((f) => f.path === activePath) || files[0];

  const diagnosticsByPath = useMemo(() => {
    const map: Record<string, ReturnType<typeof computeLiveDiagnostics>> = {};
    for (const f of files) {
      map[f.path] = computeLiveDiagnostics(f.content, f.language);
    }
    return map;
  }, [files]);

  const activeDiagnostics = activeFile ? diagnosticsByPath[activeFile.path] || [] : [];

  useEffect(() => {
    setGhostSuggestion('');
    setInlineError('');
    if (ghostAbortRef.current) {
      ghostAbortRef.current.abort();
      ghostAbortRef.current = null;
    }
  }, [activePath]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (ghostAbortRef.current) ghostAbortRef.current.abort();
    };
  }, []);

  const updateFileContent = (targetPath: string, nextContent: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.path === targetPath ? { ...f, content: nextContent } : f))
    );
  };

  const requestGhostCompletion = async (
    content: string,
    offset: number,
    language: string,
    fileName: string
  ) => {
    const prefix = content.slice(0, offset);
    const suffix = content.slice(offset);
    if (prefix.trim().length < 3) return;

    if (ghostAbortRef.current) {
      ghostAbortRef.current.abort();
    }
    const ctrl = new AbortController();
    ghostAbortRef.current = ctrl;
    const seq = ++ghostSeqRef.current;

    setGhostLoading(true);
    try {
      const res = await fetch('/api/agent/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, fileName, prefix, suffix }),
        signal: ctrl.signal
      });
      if (!res.ok) return;
      const data = await res.json();
      if (seq !== ghostSeqRef.current) return;
      if (data.suggestion && typeof data.suggestion === 'string' && data.suggestion.trim()) {
        setGhostSuggestion(data.suggestion);
        onRouterActivity();
      }
    } catch {
      // Aborted or transient typing cancellation
    } finally {
      if (seq === ghostSeqRef.current) {
        setGhostLoading(false);
      }
    }
  };

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart ?? val.length;
    setCursorOffset(pos);
    setGhostSuggestion('');
    if (ghostAbortRef.current) {
      ghostAbortRef.current.abort();
      ghostAbortRef.current = null;
    }
    if (activeFile) {
      updateFileContent(activeFile.path, val);
      if (autoGhostEnabled) {
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          requestGhostCompletion(val, pos, activeFile.language, activeFile.path);
        }, 650);
      }
    }
  };

  const acceptGhostCompletion = () => {
    if (!ghostSuggestion || !activeFile) return;
    const pos = textareaRef.current?.selectionStart ?? cursorOffset;
    const next = activeFile.content.slice(0, pos) + ghostSuggestion + activeFile.content.slice(pos);
    updateFileContent(activeFile.path, next);
    const nextPos = pos + ghostSuggestion.length;
    setGhostSuggestion('');
    window.requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    });
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && ghostSuggestion) {
      e.preventDefault();
      acceptGhostCompletion();
      return;
    }
    if (e.key === 'Escape' && ghostSuggestion) {
      setGhostSuggestion('');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setInlineBarOpen((prev) => !prev);
      return;
    }
    if (e.altKey && e.key === '\\' && activeFile) {
      e.preventDefault();
      const pos = textareaRef.current?.selectionStart ?? activeFile.content.length;
      setCursorOffset(pos);
      requestGhostCompletion(activeFile.content, pos, activeFile.language, activeFile.path);
    }
  };

  const runInlineQuickEdit = async (customInstruction?: string) => {
    if (!activeFile) return;
    const instruction = (customInstruction || inlineInstruction).trim();
    if (!instruction) return;
    setInlineBusy(true);
    setInlineError('');

    const selStart = textareaRef.current?.selectionStart ?? 0;
    const selEnd = textareaRef.current?.selectionEnd ?? 0;
    const hasSelection = selEnd > selStart;
    const snippetToTransform = hasSelection
      ? activeFile.content.slice(selStart, selEnd)
      : activeFile.content;

    try {
      const res = await fetch('/api/agent/inline-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: activeFile.language,
          fileName: activeFile.path,
          code: snippetToTransform,
          instruction
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setInlineError(data.error || 'Inline edit request failed.');
        return;
      }
      if (typeof data.replacementCode === 'string') {
        const proposedFull = hasSelection
          ? activeFile.content.slice(0, selStart) +
            data.replacementCode +
            activeFile.content.slice(selEnd)
          : data.replacementCode;

        setPendingDiff({
          targetPath: activeFile.path,
          original: activeFile.content,
          proposed: proposedFull,
          summary: data.summary || instruction
        });
        setInlineBarOpen(false);
        setInlineInstruction('');
        onRouterActivity();
      }
    } catch (err: any) {
      setInlineError(err?.message || 'Unable to reach inline edit endpoint.');
    } finally {
      setInlineBusy(false);
    }
  };

  const handleCreateFile = () => {
    const clean = newFileName.trim().replace(/^\/+/, '');
    if (!clean) return;
    const { language, starter } = inferLanguageMeta(clean);
    if (!files.some((f) => f.path === clean)) {
      setFiles((prev) => [
        ...prev,
        {
          path: clean,
          language,
          content: starter
        }
      ]);
    }
    setActivePath(clean);
    setCreatingFile(false);
  };

  const sendAgentPrompt = async (overrideText?: string, overrideMode?: KiloMode) => {
    const promptText = (overrideText ?? agentInput).trim();
    if (!promptText || agentBusy) return;
    const usedMode = overrideMode || kiloMode;
    if (overrideMode) setKiloMode(overrideMode);

    const userMsg: AgentChatMessage = {
      id: 'u_' + Date.now(),
      role: 'user',
      mode: usedMode,
      text: promptText
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!overrideText) setAgentInput('');
    setAgentBusy(true);

    try {
      const allDiags = files.flatMap((f) =>
        (diagnosticsByPath[f.path] || []).map((d) => ({
          file: f.path,
          line: d.line,
          message: d.message
        }))
      );

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: usedMode,
          model: selectedChain,
          prompt: promptText,
          activeFile: activeFile?.path || '',
          workspaceFiles: files,
          diagnostics: allDiags
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: 'err_' + Date.now(),
            role: 'assistant',
            mode: usedMode,
            text: `Router Alert: ${data.error || 'Upstream unavailable'}`
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: 'a_' + Date.now(),
            role: 'assistant',
            mode: usedMode,
            text: data.reply || '',
            servedModel: data.servedModel,
            platform: data.platform,
            latencyMs: data.latencyMs,
            savedTokens: data.savedTokens,
            thoughtSteps: data.thoughtSteps || [],
            fileEdits: data.fileEdits || []
          }
        ]);
        onRouterActivity();
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'err_' + Date.now(),
          role: 'assistant',
          mode: usedMode,
          text: `Connection error: ${err?.message || 'Unable to reach server'}`
        }
      ]);
    } finally {
      setAgentBusy(false);
    }
  };

  const applyProposedEdit = (msgId: string, edit: ProposedFileEdit) => {
    const cleanPath = edit.path.trim().replace(/^\/+/, '');
    setFiles((prev) => {
      const exists = prev.some((f) => f.path === cleanPath);
      if (exists) {
        return prev.map((f) =>
          f.path === cleanPath ? { ...f, content: edit.newContent } : f
        );
      }
      const { language } = inferLanguageMeta(cleanPath);
      return [...prev, { path: cleanPath, language, content: edit.newContent }];
    });
    setActivePath(cleanPath);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              fileEdits: m.fileEdits?.map((fe) =>
                fe.path === edit.path ? { ...fe, applied: true } : fe
              )
            }
          : m
      )
    );
  };

  const lineCount = activeFile ? activeFile.content.split('\n').length : 1;

  return (
    <div
      className={`grid grid-cols-1 lg:grid-cols-12 border rounded-lg overflow-hidden ${
        isHighVis ? 'bg-[#090D16] border-[#1E293B]' : 'bg-[#1E1E1E] border-[#3C3C3C]'
      }`}
    >
      {/* Column 1: Workspace Explorer (2 cols) */}
      <aside
        className={`lg:col-span-2 border-b lg:border-b-0 lg:border-r flex flex-col ${
          isHighVis ? 'bg-[#0B111E] border-[#1E293B]' : 'bg-[#252526] border-[#3C3C3C]'
        }`}
      >
        <div className="flex items-center justify-between px-3.5 py-3 border-b border-inherit">
          <span className="text-xs font-semibold tracking-tight">Workspace Files</span>
          <button
            onClick={() => setCreatingFile((v) => !v)}
            title="New File (Any Language)"
            className="p-1 rounded hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
          >
            <FilePlus2 className="w-4 h-4" />
          </button>
        </div>

        {creatingFile && (
          <div className="p-2.5 border-b border-inherit space-y-2">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFile();
              }}
              placeholder="e.g. app.rs, main.py, query.sql"
              className={`w-full px-2.5 py-1.5 text-xs font-mono rounded border ${
                isHighVis
                  ? 'bg-[#090D16] border-slate-700 text-slate-100'
                  : 'bg-[#1E1E1E] border-[#454545] text-zinc-100'
              }`}
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                onClick={() => setCreatingFile(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFile}
                className="px-2.5 py-1 text-xs font-medium bg-sky-600 text-white rounded hover:bg-sky-500 cursor-pointer"
              >
                Create
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1.5">
          {files.map((file) => {
            const active = file.path === activeFile?.path;
            const fileDiags = diagnosticsByPath[file.path] || [];
            return (
              <button
                key={file.path}
                onClick={() => setActivePath(file.path)}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                  active
                    ? isHighVis
                      ? 'bg-sky-500/15 text-white font-semibold'
                      : 'bg-[#37373D] text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <FileCode2 className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                  <span className="truncate font-mono">{file.path}</span>
                </span>
                {fileDiags.length > 0 && (
                  <AlertTriangle
                    className="w-3.5 h-3.5 shrink-0 text-amber-400"
                    aria-label="Syntax or delimiter diagnostic"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-inherit text-[11px] space-y-1 text-slate-400">
          <div className="font-medium text-slate-300">All-Language Integration</div>
          <div>TS · JS · Python · Rust · Go · C/C++ · Java · C# · PHP · SQL · HTML</div>
        </div>
      </aside>

      {/* Column 2: Code Editor + Ghost-Text + Diff Pane (6 cols) */}
      <section className="lg:col-span-6 flex flex-col border-b lg:border-b-0 lg:border-r border-inherit min-h-[560px]">
        <div
          className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b ${
            isHighVis ? 'bg-[#070B14] border-[#1E293B]' : 'bg-[#252526] border-[#3C3C3C]'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="font-semibold">{activeFile?.path}</span>
            <span className="text-slate-500">·</span>
            <span className="text-sky-400">{activeFile?.language}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400 tabular-nums">{lineCount} lines</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => {
                if (!activeFile) return;
                const pos = textareaRef.current?.selectionStart ?? activeFile.content.length;
                setCursorOffset(pos);
                requestGhostCompletion(activeFile.content, pos, activeFile.language, activeFile.path);
              }}
              disabled={ghostLoading}
              className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                isHighVis
                  ? 'bg-[#0F172A] border-slate-700 text-sky-300 hover:border-sky-500'
                  : 'bg-[#2D2D2D] border-[#454545] text-sky-300 hover:border-sky-500'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {ghostLoading ? 'Completing...' : 'Suggest (Alt+\\)'}
            </button>

            <button
              onClick={() => setInlineBarOpen((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                isHighVis
                  ? 'bg-[#0F172A] border-slate-700 text-slate-200 hover:border-slate-500'
                  : 'bg-[#2D2D2D] border-[#454545] text-zinc-200 hover:border-zinc-400'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 text-amber-400" />
              Inline Edit (Ctrl+K)
            </button>

            <button
              onClick={() =>
                runInlineQuickEdit(
                  'Fix any bugs, edge cases, or type issues while preserving clean idiomatic code.'
                )
              }
              disabled={inlineBusy}
              className="px-2.5 py-1 text-xs font-medium rounded bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {inlineBusy ? 'Analyzing...' : 'Auto-Fix & Optimize'}
            </button>
          </div>
        </div>

        {/* Live Diagnostics Banner (shown only when real delimiter/conflict errors exist) */}
        {activeDiagnostics.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b text-xs bg-amber-950/35 border-amber-800/50 text-amber-200">
            <div className="flex items-center gap-2 truncate">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="truncate font-mono">
                Line {activeDiagnostics[0].line}: {activeDiagnostics[0].message}
              </span>
            </div>
            <button
              onClick={() =>
                sendAgentPrompt(
                  `Fix the syntax issue on line ${activeDiagnostics[0].line} in @${activeFile?.path}: "${activeDiagnostics[0].message}"`,
                  'debug'
                )
              }
              className="px-2.5 py-1 text-xs font-medium rounded bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer whitespace-nowrap shrink-0"
            >
              Fix in Debug Mode
            </button>
          </div>
        )}

        {inlineError && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b text-xs bg-rose-950/40 border-rose-800/50 text-rose-200">
            <span className="truncate font-mono">{inlineError}</span>
            <button onClick={() => setInlineError('')} className="text-rose-300 hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Ctrl+K Inline Quick Edit Bar */}
        {inlineBarOpen && (
          <div
            className={`flex items-center gap-2 px-4 py-2.5 border-b ${
              isHighVis ? 'bg-[#0F172A] border-slate-700' : 'bg-[#2D2D2D] border-[#454545]'
            }`}
          >
            <input
              type="text"
              value={inlineInstruction}
              onChange={(e) => setInlineInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runInlineQuickEdit();
              }}
              placeholder="Instruction (transforms selection or full file): e.g., Add retry backoff, add types, write docstrings..."
              className={`flex-1 px-3 py-1.5 text-xs rounded border ${
                isHighVis
                  ? 'bg-[#090D16] border-slate-700 text-slate-100 placeholder:text-slate-500'
                  : 'bg-[#1E1E1E] border-[#454545] text-zinc-100'
              }`}
            />
            <button
              onClick={() => runInlineQuickEdit()}
              disabled={inlineBusy || !inlineInstruction.trim()}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              {inlineBusy ? 'Transforming...' : 'Generate Diff'}
            </button>
            <button
              onClick={() => setInlineBarOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Diff Review Pane OR Synchronized Code Editor */}
        {pendingDiff ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div
              className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b text-xs ${
                isHighVis ? 'bg-[#0F172A] border-[#1E293B]' : 'bg-[#252526] border-[#3C3C3C]'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <GitCompare className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="font-semibold">{pendingDiff.targetPath}</span>
                <span className="text-slate-500">·</span>
                <span className="truncate text-slate-400">{pendingDiff.summary}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setPendingDiff(null)}
                  className="px-3 py-1 text-xs font-medium rounded border border-slate-600 text-slate-300 hover:bg-slate-800 cursor-pointer flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  Reject
                </button>
                <button
                  onClick={() => {
                    updateFileContent(pendingDiff.targetPath, pendingDiff.proposed);
                    setActivePath(pendingDiff.targetPath);
                    setPendingDiff(null);
                  }}
                  className="px-3 py-1 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  Apply Diff
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 flex-1 overflow-auto font-mono text-xs">
              <div className="p-4 border-r bg-rose-950/15 border-[#1E293B]">
                <div className="text-[11px] font-semibold text-rose-400 mb-2">Current Version</div>
                <pre className="whitespace-pre-wrap break-words leading-relaxed">{pendingDiff.original}</pre>
              </div>
              <div className="p-4 bg-emerald-950/15">
                <div className="text-[11px] font-semibold text-emerald-400 mb-2">Proposed Kilo Update</div>
                <pre className="whitespace-pre-wrap break-words leading-relaxed">{pendingDiff.proposed}</pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <div className="flex-1 flex overflow-hidden min-h-[420px]">
              {/* Synchronized Line Numbers Gutter */}
              <div
                ref={gutterRef}
                aria-hidden="true"
                className={`py-4 px-3 text-right font-mono text-xs select-none border-r tabular-nums leading-6 overflow-hidden ${
                  isHighVis
                    ? 'bg-[#070B14] border-[#1E293B] text-slate-500'
                    : 'bg-[#1E1E1E] border-[#3C3C3C] text-zinc-500'
                }`}
              >
                {Array.from({ length: lineCount }).map((_, idx) => (
                  <div key={idx}>{idx + 1}</div>
                ))}
              </div>

              {/* Editable Code Surface */}
              <textarea
                ref={textareaRef}
                value={activeFile?.content || ''}
                onChange={handleEditorChange}
                onKeyDown={handleEditorKeyDown}
                onScroll={(e) => {
                  if (gutterRef.current) {
                    gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                  }
                }}
                onClick={(e) => setCursorOffset((e.target as HTMLTextAreaElement).selectionStart)}
                spellCheck={false}
                className={`flex-1 p-4 font-mono text-[13px] leading-6 focus:outline-none resize-none overflow-auto ${
                  isHighVis
                    ? 'bg-[#090D16] text-[#F8FAFC] caret-amber-400'
                    : 'bg-[#1E1E1E] text-[#D4D4D4] caret-sky-400'
                }`}
              />
            </div>

            {/* Inline Ghost-Text Completion Banner */}
            {ghostSuggestion && (
              <div
                className={`px-4 py-3 border-t flex items-start justify-between gap-4 ${
                  isHighVis
                    ? 'bg-[#0F172A] border-sky-500/40 text-sky-200'
                    : 'bg-[#252526] border-sky-500/40 text-sky-200'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-sky-400 mb-1">
                    Ghost-Text Inline Suggestion — Press Tab to Accept or Esc to Dismiss
                  </div>
                  <pre className="font-mono text-xs whitespace-pre-wrap break-words opacity-90">
                    {ghostSuggestion}
                  </pre>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setGhostSuggestion('')}
                    className="px-2.5 py-1 text-xs rounded border border-slate-600 text-slate-300 hover:bg-slate-800 cursor-pointer"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={acceptGhostCompletion}
                    className="px-3 py-1 text-xs font-semibold rounded bg-sky-600 text-white hover:bg-sky-500 cursor-pointer"
                  >
                    Accept (Tab)
                  </button>
                </div>
              </div>
            )}

            {/* Editor Status & Quick CodeActions */}
            <div
              className={`px-4 py-2 border-t flex flex-wrap items-center justify-between gap-2 text-xs ${
                isHighVis ? 'bg-[#070B14] border-[#1E293B] text-slate-400' : 'bg-[#252526] border-[#3C3C3C] text-zinc-400'
              }`}
            >
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoGhostEnabled}
                    onChange={(e) => setAutoGhostEnabled(e.target.checked)}
                    className="accent-sky-500"
                  />
                  <span>Auto Ghost-Text FIM</span>
                </label>
                <span>·</span>
                <button
                  onClick={() =>
                    sendAgentPrompt(`Explain the architecture and edge cases of @${activeFile?.path}`, 'ask')
                  }
                  className="hover:underline text-sky-400 cursor-pointer"
                >
                  Explain File
                </button>
                <span>·</span>
                <button
                  onClick={() =>
                    sendAgentPrompt(`Generate comprehensive unit tests for @${activeFile?.path}`, 'code')
                  }
                  className="hover:underline text-sky-400 cursor-pointer"
                >
                  Generate Tests
                </button>
              </div>
              <div className="font-mono text-[11px] tabular-nums">
                UTF-8 · {activeFile?.language.toUpperCase()} · VS Code v1.70.2 API
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Column 3: Kilo Code Autonomous Multi-Mode Agent Panel (4 cols) */}
      <aside
        className={`lg:col-span-4 flex flex-col min-h-[560px] ${
          isHighVis ? 'bg-[#0B111E]' : 'bg-[#252526]'
        }`}
      >
        <div className="p-3 border-b border-inherit space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Kilo Autonomous Agent</span>
            <select
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value)}
              className={`px-2.5 py-1 text-xs font-mono rounded border ${
                isHighVis
                  ? 'bg-[#090D16] border-slate-700 text-sky-300'
                  : 'bg-[#1E1E1E] border-[#454545] text-sky-300'
              }`}
            >
              <option value="auto:coding">auto:coding</option>
              <option value="fusion">fusion (Multi-Model)</option>
              <option value="auto:architect">auto:architect</option>
              <option value="auto:fast">auto:fast</option>
            </select>
          </div>

          <div
            className={`grid grid-cols-5 gap-1 p-1 rounded-md border ${
              isHighVis ? 'bg-[#090D16] border-[#1E293B]' : 'bg-[#1E1E1E] border-[#3C3C3C]'
            }`}
          >
            {(['architect', 'code', 'ask', 'debug', 'orchestrator'] as KiloMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setKiloMode(m)}
                className={`py-1.5 px-1 text-[11px] font-medium rounded capitalize transition-colors cursor-pointer truncate ${
                  kiloMode === m ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'orchestrator' ? 'Orch.' : m}
              </button>
            ))}
          </div>
        </div>

        <div ref={feedRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 max-h-[420px]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded-lg border text-xs leading-relaxed space-y-2 ${
                msg.role === 'user'
                  ? 'bg-sky-950/35 border-sky-800/60 text-slate-100'
                  : isHighVis
                  ? 'bg-[#090D16] border-[#1E293B] text-slate-200'
                  : 'bg-[#1E1E1E] border-[#3C3C3C] text-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>
                  {msg.role === 'user' ? 'Developer' : 'Kilo Agent'} · {msg.mode}
                </span>
                {msg.servedModel && (
                  <span className="tabular-nums">
                    {msg.platform ? `${msg.platform}/` : ''}
                    {msg.servedModel}
                    {msg.latencyMs ? ` · ${msg.latencyMs}ms` : ''}
                  </span>
                )}
              </div>

              {msg.thoughtSteps && msg.thoughtSteps.length > 0 && (
                <div
                  className={`p-2 rounded border space-y-1 font-mono text-[11px] ${
                    isHighVis ? 'bg-[#0F172A] border-slate-800 text-slate-300' : 'bg-[#252526] border-[#3C3C3C] text-zinc-300'
                  }`}
                >
                  {msg.thoughtSteps.map((step, idx) => (
                    <div key={idx} className="truncate">
                      <span className="text-sky-400">{step.tool}</span>
                      <span className="text-slate-500">({step.target})</span> — {step.summary}
                    </div>
                  ))}
                </div>
              )}

              <div className="whitespace-pre-wrap break-words">{msg.text}</div>

              {msg.fileEdits && msg.fileEdits.length > 0 && (
                <div className="space-y-2 pt-1">
                  {msg.fileEdits.map((edit, idx) => {
                    const cleanTarget = edit.path.trim().replace(/^\/+/, '');
                    const existing = files.find((f) => f.path === cleanTarget)?.content || '';
                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded border flex flex-col gap-2 ${
                          isHighVis ? 'bg-[#0F172A] border-slate-700' : 'bg-[#252526] border-[#454545]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-sky-400 truncate">
                            {String(edit.action || 'modify').toUpperCase()}: {cleanTarget}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() =>
                                setPendingDiff({
                                  targetPath: cleanTarget,
                                  original: existing,
                                  proposed: edit.newContent,
                                  summary: edit.explanation
                                })
                              }
                              className="px-2 py-1 text-[11px] rounded border border-slate-600 hover:bg-slate-800 cursor-pointer"
                            >
                              Diff
                            </button>
                            <button
                              onClick={() => applyProposedEdit(msg.id, edit)}
                              disabled={edit.applied}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                                edit.applied
                                  ? 'bg-emerald-700/50 text-emerald-200'
                                  : 'bg-sky-600 text-white hover:bg-sky-500'
                              }`}
                            >
                              {edit.applied ? 'Applied' : 'Apply'}
                            </button>
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400">{edit.explanation}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Agent Composer */}
        <div className="p-3 border-t border-inherit space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              onClick={() =>
                setAgentInput((prev) => `${prev}${prev ? ' ' : ''}@${activeFile?.path || ''} `)
              }
              className="px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:border-sky-500 font-mono cursor-pointer"
            >
              + @{activeFile?.path.split('/').pop()}
            </button>
            <button
              onClick={() => setAgentInput((prev) => `${prev}${prev ? ' ' : ''}@problems `)}
              className="px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:border-amber-500 font-mono cursor-pointer"
            >
              + @problems
            </button>
          </div>

          <textarea
            value={agentInput}
            onChange={(e) => setAgentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendAgentPrompt();
              }
            }}
            rows={3}
            placeholder={`Ask Kilo (${kiloMode}) to architect, write code, debug @problems, or refactor...`}
            className={`w-full px-3 py-2 text-xs rounded-md border resize-none focus:outline-none focus:border-sky-500 ${
              isHighVis
                ? 'bg-[#090D16] border-slate-700 text-slate-100 placeholder:text-slate-500'
                : 'bg-[#1E1E1E] border-[#454545] text-zinc-100 placeholder:text-zinc-500'
            }`}
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {agentBusy ? 'Executing Kilo tool loop...' : 'Enter to send · Shift+Enter newline'}
            </span>
            <button
              onClick={() => sendAgentPrompt()}
              disabled={agentBusy || !agentInput.trim()}
              className="px-4 py-1.5 text-xs font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              {agentBusy ? 'Running...' : 'Run Agent'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};
