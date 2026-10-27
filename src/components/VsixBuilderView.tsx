import React, { useEffect, useState } from 'react';
import { Download, Archive, Copy, Check, FileCode } from 'lucide-react';
import { ThemeMode } from '../types';

interface VsixBuilderViewProps {
  theme: ThemeMode;
}

interface InspectedExtensionFile {
  path: string;
  sizeBytes: number;
  content: string;
}

export const VsixBuilderView: React.FC<VsixBuilderViewProps> = ({ theme }) => {
  const isHighVis = theme === 'high-vis';
  const [files, setFiles] = useState<InspectedExtensionFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('package.json');
  const [bundleBytes, setBundleBytes] = useState<number>(0);
  const [logoError, setLogoError] = useState<boolean>(false);
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/vsix/inspect')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.files)) {
          setFiles(data.files);
        }
        if (typeof data.compiledBundleBytes === 'number') {
          setBundleBytes(data.compiledBundleBytes);
        }
      })
      .catch(() => {});
  }, []);

  const currentFileObj = files.find((f) => f.path === selectedFile) || files[0];
  const installCli = 'code --install-extension freellmapi-kilo-vscode-0.16.9.vsix';

  const surfaceCls = isHighVis
    ? 'bg-[#0B111E] border-[#1E293B] text-slate-100'
    : 'bg-[#252526] border-[#3C3C3C] text-zinc-100';

  return (
    <div className="space-y-6">
      {/* VSIX Package Download & Official Extension Icon */}
      <div className={`p-6 rounded-lg border grid grid-cols-1 lg:grid-cols-12 gap-6 items-center ${surfaceCls}`}>
        <div className="lg:col-span-3 flex justify-center">
          <div className="w-40 h-40 rounded-2xl overflow-hidden border border-slate-700/70 bg-[#090D16] flex items-center justify-center shrink-0">
            {!logoError ? (
              <img
                src="/kilo-freellmapi-logo.jpg"
                alt="FreeLLMAPI Kilo VS Code Extension Logo"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src="/kilo-freellm-mark.svg"
                alt="FreeLLMAPI Kilo Vector Logo"
                className="w-24 h-24"
              />
            )}
          </div>
        </div>

        <div className="lg:col-span-9 space-y-4">
          <div>
            <div className="text-xs font-mono text-sky-400">
              freellmapi.freellmapi-kilo-vscode · v0.16.9 · engines.vscode: ^1.70.2
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-1">
              FreeLLMAPI Kilo Agent for Visual Studio Code v1.70.2+
            </h1>
            <p className="text-sm text-slate-400 mt-1.5 max-w-3xl leading-relaxed">
              Packaged for VS Code <code className="font-mono text-sky-400">v1.70.2+</code> (Node 16 CommonJS) with universal{' '}
              <code className="font-mono text-sky-400">InlineCompletionItemProvider</code> across all languages, 5-mode Kilo Agent sidebar, custom High-Visibility UI theme, and the embedded FreeLLMAPI v0.16.9 multi-provider router.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/api/vsix/download"
              download="freellmapi-kilo-vscode-0.16.9.vsix"
              className="px-4 py-2.5 text-xs font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-500 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              Download .vsix for VS Code v1.70.2 {bundleBytes > 0 ? `(${(bundleBytes / 1024).toFixed(1)} KB Bundle)` : ''}
            </a>

            <a
              href="/api/vsix/source-zip"
              download="freellmapi-kilo-vscode-v1.70.2-source.zip"
              className={`px-4 py-2.5 text-xs font-semibold rounded-md border transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                isHighVis
                  ? 'bg-[#090D16] border-slate-700 text-slate-200 hover:border-sky-500'
                  : 'bg-[#1E1E1E] border-[#454545] text-zinc-200 hover:border-sky-500'
              }`}
            >
              <Archive className="w-4 h-4 text-amber-400" />
              Download Extension Source (.zip)
            </a>
          </div>

          <div
            className={`p-3 rounded-md border flex items-center justify-between gap-3 font-mono text-xs ${
              isHighVis ? 'bg-[#090D16] border-slate-800 text-slate-300' : 'bg-[#1E1E1E] border-[#3C3C3C] text-zinc-300'
            }`}
          >
            <span className="truncate">{installCli}</span>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(installCli);
                setCopiedCmd(true);
                window.setTimeout(() => setCopiedCmd(false), 1800);
              }}
              className="px-2.5 py-1 text-xs rounded border border-slate-700 hover:bg-slate-800 cursor-pointer flex items-center gap-1 shrink-0"
            >
              {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCmd ? 'Copied' : 'Copy CLI'}
            </button>
          </div>
        </div>
      </div>

      {/* Bundled VSIX Source & Theme Inspector */}
      <div className={`rounded-lg border overflow-hidden grid grid-cols-1 lg:grid-cols-12 ${surfaceCls}`}>
        <div
          className={`lg:col-span-3 border-b lg:border-b-0 lg:border-r p-3 space-y-1 ${
            isHighVis ? 'bg-[#090D16] border-[#1E293B]' : 'bg-[#1E1E1E] border-[#3C3C3C]'
          }`}
        >
          <div className="text-xs font-semibold px-2 py-1.5 text-slate-400">
            Bundled VSIX Files ({files.length})
          </div>
          {files.map((f) => (
            <button
              key={f.path}
              onClick={() => setSelectedFile(f.path)}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded text-xs font-mono text-left cursor-pointer ${
                currentFileObj?.path === f.path
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-1.5 truncate">
                <FileCode className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{f.path}</span>
              </span>
              <span className="text-[10px] opacity-75 tabular-nums shrink-0">
                {(f.sizeBytes / 1024).toFixed(1)}K
              </span>
            </button>
          ))}
        </div>

        <div className="lg:col-span-9 flex flex-col max-h-[500px]">
          <div
            className={`px-4 py-2.5 border-b text-xs font-mono flex items-center justify-between ${
              isHighVis ? 'bg-[#070B14] border-[#1E293B] text-slate-300' : 'bg-[#252526] border-[#3C3C3C] text-zinc-300'
            }`}
          >
            <span>vscode-extension/{currentFileObj?.path}</span>
            <span className="tabular-nums">{currentFileObj?.sizeBytes.toLocaleString()} bytes</span>
          </div>
          <pre
            className={`p-4 text-xs font-mono overflow-auto flex-1 leading-relaxed ${
              isHighVis ? 'bg-[#090D16] text-slate-200' : 'bg-[#1E1E1E] text-zinc-200'
            }`}
          >
            {currentFileObj?.content || 'Loading extension source...'}
          </pre>
        </div>
      </div>
    </div>
  );
};
