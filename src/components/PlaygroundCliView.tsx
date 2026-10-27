import React, { useState, useRef } from 'react';
import { Play, Mic, Square, Copy, Check, ExternalLink, Volume2, Terminal } from 'lucide-react';
import { RouterStateResponse, ThemeMode } from '../types';

interface PlaygroundCliViewProps {
  theme: ThemeMode;
  routerState: RouterStateResponse;
  onRouterActivity: () => void;
}

type PlaygroundMode =
  | 'chat'
  | 'fusion'
  | 'search'
  | 'embeddings'
  | 'tts'
  | 'decision';

const MODES: Array<{ id: PlaygroundMode; label: string; defaultPrompt: string }> = [
  {
    id: 'chat',
    label: 'Chat & Artifacts',
    defaultPrompt:
      'Create a self-contained SVG architecture diagram showing VS Code v1.70.2 connecting to Kilo Agent, Ghost-Text FIM, and the FreeLLMAPI Multi-Provider Router.'
  },
  {
    id: 'fusion',
    label: 'Fusion Synthesis',
    defaultPrompt:
      'Design a lock-free token-bucket rate limiter in TypeScript that tracks both RPM and directional TPM across multiple API keys.'
  },
  {
    id: 'search',
    label: 'Web Search (/v1/search)',
    defaultPrompt: 'What are the key capabilities of VS Code InlineCompletionItemProvider and WebviewViewProvider?'
  },
  {
    id: 'embeddings',
    label: 'Embeddings (/v1/embeddings)',
    defaultPrompt: 'Autonomous multi-mode VS Code coding agent with inline completions'
  },
  {
    id: 'tts',
    label: 'Audio Speech (/v1/audio/speech)',
    defaultPrompt: 'FreeLLMAPI Kilo extension is active in Visual Studio Code with universal inline completions.'
  },
  {
    id: 'decision',
    label: 'Decision (/api/decisions)',
    defaultPrompt: 'A developer opened a 120,000-token TypeScript monorepo diff with 4 compiler errors during peak traffic hours. Select optimal route.'
  }
];

export const PlaygroundCliView: React.FC<PlaygroundCliViewProps> = ({
  theme,
  routerState,
  onRouterActivity
}) => {
  const isHighVis = theme === 'high-vis';
  const [pgMode, setPgMode] = useState<PlaygroundMode>('chat');
  const [prompt, setPrompt] = useState<string>(MODES[0].defaultPrompt);
  const [secondText, setSecondText] = useState<string>(
    'AI code assistant with Fill-In-The-Middle ghost text suggestions'
  );
  const [voiceName, setVoiceName] = useState<string>('Kore');
  const [busy, setBusy] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string>('');
  const [mcpOutput, setMcpOutput] = useState<string>('');

  const [recording, setRecording] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const surfaceCls = isHighVis
    ? 'bg-[#0B111E] border-[#1E293B] text-slate-100'
    : 'bg-[#252526] border-[#3C3C3C] text-zinc-100';

  const switchMode = (next: PlaygroundMode) => {
    setPgMode(next);
    const preset = MODES.find((m) => m.id === next);
    if (preset) setPrompt(preset.defaultPrompt);
    setResult(null);
  };

  const runPlayground = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/playground/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modality: pgMode,
          prompt,
          secondText,
          voiceName
        })
      });
      const data = await res.json();
      setResult(data);
      onRouterActivity();
    } catch (err: any) {
      setResult({ error: err?.message || 'Playground request failed' });
    } finally {
      setBusy(false);
    }
  };

  const toggleDictation = async () => {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = String(reader.result || '').split(',')[1] || '';
          if (!base64) return;
          setBusy(true);
          try {
            const res = await fetch('/api/playground/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                modality: 'transcribe',
                audioBase64: base64,
                audioMimeType: blob.type || 'audio/webm'
              })
            });
            const data = await res.json();
            if (data.transcript) {
              setPrompt((prev) => (prev ? `${prev}\n${data.transcript}` : data.transcript));
              onRouterActivity();
            } else if (data.error) {
              setResult({ error: data.error });
            }
          } finally {
            setBusy(false);
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setResult({ error: 'Microphone permission unavailable in this browser context.' });
    }
  };

  const copyCommand = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(''), 1800);
  };

  const probeMcp = async () => {
    const res = await fetch('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    const data = await res.json();
    setMcpOutput(JSON.stringify(data, null, 2));
  };

  return (
    <div className="space-y-6">
      <div className={`p-5 rounded-lg border space-y-4 ${surfaceCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              Multi-Modal Playground (Chat · Artifacts · Fusion · Search · Embeddings · TTS · Dictation · Decision)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live FreeLLMAPI surfaces with automatic failover, WAV speech synthesis, voice dictation ASR, and HTML/SVG artifact rendering.
            </p>
          </div>

          <div
            className={`flex flex-wrap items-center gap-1 p-1 rounded-lg border ${
              isHighVis ? 'bg-[#090D16] border-[#1E293B]' : 'bg-[#1E1E1E] border-[#3C3C3C]'
            }`}
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => switchMode(m.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded cursor-pointer whitespace-nowrap shrink-0 ${
                  pgMode === m.id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Input Column */}
          <div className="lg:col-span-5 space-y-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className={`w-full p-3 text-xs font-mono rounded-md border focus:outline-none focus:border-sky-500 ${
                isHighVis ? 'bg-[#090D16] border-slate-700 text-slate-100' : 'bg-[#1E1E1E] border-[#454545] text-zinc-100'
              }`}
            />

            {pgMode === 'embeddings' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Comparison Text B (Cosine Similarity)
                </label>
                <input
                  type="text"
                  value={secondText}
                  onChange={(e) => setSecondText(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded border ${
                    isHighVis ? 'bg-[#090D16] border-slate-700 text-slate-100' : 'bg-[#1E1E1E] border-[#454545] text-zinc-100'
                  }`}
                />
              </div>
            )}

            {pgMode === 'tts' && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-400">Voice Persona:</span>
                <select
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className={`px-2.5 py-1 rounded border ${
                    isHighVis ? 'bg-[#090D16] border-slate-700 text-slate-100' : 'bg-[#1E1E1E] border-[#454545] text-zinc-100'
                  }`}
                >
                  {['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={toggleDictation}
                type="button"
                className={`px-3 py-1.5 text-xs font-medium rounded border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  recording
                    ? 'bg-rose-600 border-rose-500 text-white'
                    : isHighVis
                    ? 'bg-[#090D16] border-slate-700 text-slate-300 hover:border-sky-500'
                    : 'bg-[#1E1E1E] border-[#454545] text-zinc-300 hover:border-sky-500'
                }`}
              >
                {recording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-sky-400" />}
                {recording ? 'Stop & Transcribe' : 'Voice Dictation'}
              </button>

              <button
                onClick={runPlayground}
                disabled={busy}
                className="px-4 py-1.5 text-xs font-semibold rounded bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                {busy ? 'Executing...' : 'Execute Request'}
              </button>
            </div>
          </div>

          {/* Output Column */}
          <div
            className={`lg:col-span-7 p-4 rounded-md border min-h-[220px] text-xs space-y-3 overflow-auto ${
              isHighVis ? 'bg-[#090D16] border-slate-800' : 'bg-[#1E1E1E] border-[#3C3C3C]'
            }`}
          >
            {!result && !busy && (
              <div className="text-slate-400 py-10 text-center">
                Select a FreeLLMAPI modality above and click Execute Request to inspect live output.
              </div>
            )}

            {busy && (
              <div className="text-sky-400 font-mono py-10 text-center">
                Routing request through FreeLLMAPI v0.16.9 pipeline...
              </div>
            )}

            {result?.error && <div className="text-rose-400 font-mono">{result.error}</div>}

            {result?.modality === 'chat' && (
              <div className="space-y-3">
                <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                  Routed via {result.platform}/{result.servedModel} in {result.latencyMs}ms · Saved {result.savedTokens || 0} tokens
                </div>
                {result.artifact && (
                  <div className="border border-slate-700 rounded-md overflow-hidden bg-slate-950 p-3">
                    <div className="text-[11px] font-mono text-sky-400 mb-2">
                      Live Artifact Preview ({result.artifact.type.toUpperCase()})
                    </div>
                    <iframe
                      title="Playground Artifact"
                      sandbox="allow-scripts"
                      srcDoc={
                        result.artifact.type === 'svg'
                          ? `<html><body style="margin:0;display:flex;justify-content:center;align-items:center;background:#090D16;color:#fff;">${result.artifact.code}</body></html>`
                          : result.artifact.code
                      }
                      className="w-full h-56 border-0 rounded bg-[#090D16]"
                    />
                  </div>
                )}
                <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">{result.answer}</pre>
              </div>
            )}

            {result?.modality === 'fusion' && (
              <div className="space-y-3">
                <div className="text-[11px] text-amber-400 font-mono tabular-nums">
                  Fusion Judge Synthesized Output ({result.latencyMs}ms)
                </div>
                <div className="whitespace-pre-wrap break-words leading-relaxed">{result.synthesized}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800">
                  {result.drafts?.map((d: any, i: number) => (
                    <div key={i} className="p-2.5 rounded border border-slate-800 text-[11px]">
                      <div className="font-semibold text-sky-400 mb-1">{d.specialist}</div>
                      <div className="text-slate-400 line-clamp-6 whitespace-pre-wrap">{d.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result?.modality === 'search' && (
              <div className="space-y-3">
                <div className="whitespace-pre-wrap leading-relaxed">{result.answer}</div>
                {result.sources?.length > 0 && (
                  <div className="pt-2 border-t border-slate-800 space-y-1">
                    <div className="text-[11px] font-semibold text-sky-400">Grounded Web Sources:</div>
                    {result.sources.map((s: any, idx: number) => (
                      <a
                        key={idx}
                        href={s.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-[11px] text-sky-400 hover:underline truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{s.title}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {result?.modality === 'embeddings' && (
              <div className="space-y-2 font-mono">
                <div>Vector Dimensions: <strong className="text-sky-400">{result.dimensions}</strong></div>
                {typeof result.cosineSimilarity === 'number' && (
                  <div>
                    Cosine Similarity (A vs B):{' '}
                    <strong className="text-emerald-400">{result.cosineSimilarity.toFixed(4)}</strong>
                  </div>
                )}
                <div className="text-[11px] text-slate-400">First 16 float32 components:</div>
                <pre className="p-2.5 rounded border border-slate-800 text-[11px] whitespace-pre-wrap">
                  [{result.previewValues?.map((v: number) => v.toFixed(5)).join(', ')}, ...]
                </pre>
              </div>
            )}

            {result?.modality === 'tts' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sky-400 font-medium">
                  <Volume2 className="w-4 h-4" />
                  <span>Generated 24kHz RIFF/WAV Speech ({result.latencyMs}ms)</span>
                </div>
                {result.audioDataUrl && (
                  <audio controls src={result.audioDataUrl} className="w-full" />
                )}
              </div>
            )}

            {result?.modality === 'decision' && result.decision && (
              <div className="space-y-2">
                <div className="font-mono">
                  Verdict: <strong className="text-emerald-400">{result.decision.verdict}</strong> · Route:{' '}
                  <strong className="text-sky-400">{result.decision.selectedRoute}</strong> · Confidence:{' '}
                  <strong>{result.decision.confidencePct}%</strong>
                </div>
                <p className="text-slate-300">{result.decision.rationale}</p>
                <ul className="list-disc pl-5 text-[11px] text-slate-400 space-y-0.5">
                  {result.decision.riskChecks?.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CLI Agent Setup Generators + MCP Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-8 p-5 rounded-lg border ${surfaceCls}`}>
          <h2 className="text-base font-semibold mb-1">
            Compatible Coding Agents &amp; One-Command Config Generators
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Configures Kilo Code, Claude Code, Codex CLI, Cline, Roo Code, Continue, Aider, OpenCode, Qwen, Goose, Zed, and Cursor against FreeLLMAPI.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {routerState.cliGenerators.map((gen) => (
              <div
                key={gen.id}
                className={`p-3 rounded-md border flex items-center justify-between gap-2 ${
                  isHighVis ? 'bg-[#090D16] border-slate-800' : 'bg-[#1E1E1E] border-[#3C3C3C]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">
                    {gen.name} <span className="text-slate-500 font-normal">· {gen.protocol}</span>
                  </div>
                  <div className="text-[11px] font-mono text-sky-400 truncate mt-0.5">{gen.command}</div>
                </div>
                <button
                  onClick={() => copyCommand(gen.id, gen.command)}
                  className="p-1.5 rounded border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer shrink-0"
                  title="Copy Setup Command"
                >
                  {copiedId === gen.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className={`lg:col-span-4 p-5 rounded-lg border flex flex-col justify-between ${surfaceCls}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-sky-400" />
                <h2 className="text-base font-semibold">MCP &amp; Wire Surfaces</h2>
              </div>
              <button
                onClick={probeMcp}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-sky-600 text-white hover:bg-sky-500 cursor-pointer"
              >
                Probe /mcp
              </button>
            </div>
            <div className="text-xs text-slate-400 space-y-1 mb-3 font-mono">
              <div>POST /v1/chat/completions</div>
              <div>POST /v1/completions (FIM)</div>
              <div>POST /v1/responses (Codex)</div>
              <div>POST /v1/messages (Anthropic)</div>
              <div>GET  /api/tags (Ollama)</div>
              <div>POST /api/chat (Ollama)</div>
              <div>POST /mcp (JSON-RPC 2.0)</div>
            </div>
            {mcpOutput && (
              <pre className="p-2.5 rounded border border-slate-800 bg-[#090D16] text-[11px] font-mono text-sky-300 max-h-40 overflow-auto">
                {mcpOutput}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* Live Request Analytics & Router Logs */}
      <div className={`p-5 rounded-lg border ${surfaceCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold">Live Request Analytics &amp; Router Logs</h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
              Requests: {routerState.analytics.totalRequests} · p50: {routerState.analytics.p50LatencyMs}ms · p95:{' '}
              {routerState.analytics.p95LatencyMs}ms · Avg TTFT: {routerState.analytics.avgTtftMs}ms · Saved:{' '}
              {routerState.analytics.totalSavedTokens} tok
            </p>
          </div>
        </div>

        {routerState.analytics.logs.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-md">
            No requests recorded yet in this session — trigger an inline completion, run Kilo Agent, or execute a Playground query above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 px-3 font-medium">Time</th>
                  <th className="py-2 px-3 font-medium">Surface · Caller</th>
                  <th className="py-2 px-3 font-medium">Requested → Served</th>
                  <th className="py-2 px-3 font-medium text-right">TTFT / Latency</th>
                  <th className="py-2 px-3 font-medium text-right">Tokens (Saved)</th>
                  <th className="py-2 px-3 font-medium text-right">HTTP</th>
                </tr>
              </thead>
              <tbody>
                {routerState.analytics.logs.slice(0, 15).map((log) => (
                  <tr key={log.id} className="border-b border-slate-800/60">
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-400">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {log.surface} <span className="text-slate-500">· {log.caller}</span>
                    </td>
                    <td className="py-2 px-3 font-mono">
                      <span className="text-slate-400">{log.requestedModel}</span> →{' '}
                      <span className="text-sky-400">
                        {log.platform}/{log.servedModel}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      {log.ttftMs}ms / {log.latencyMs}ms
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      {log.promptTokens + log.completionTokens} ({log.savedTokens > 0 ? `-${log.savedTokens}` : '0'})
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-400">
                      {log.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
