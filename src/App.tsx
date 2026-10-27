import { useEffect, useState, useCallback } from 'react';
import { Download, Eye } from 'lucide-react';
import {
  INITIAL_WORKSPACE_FILES,
  NavSection,
  RouterStateResponse,
  ThemeMode,
  WorkspaceFile
} from './types';
import { WorkbenchView } from './components/WorkbenchView';
import { ModelsRoutingView } from './components/ModelsRoutingView';
import { ProviderPoolView } from './components/ProviderPoolView';
import { PlaygroundCliView } from './components/PlaygroundCliView';
import { VsixBuilderView } from './components/VsixBuilderView';

export default function App() {
  const [activeNav, setActiveNav] = useState<NavSection>('workbench');
  const [theme, setTheme] = useState<ThemeMode>('high-vis');
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>(INITIAL_WORKSPACE_FILES);
  const [routerState, setRouterState] = useState<RouterStateResponse | null>(null);

  const isHighVis = theme === 'high-vis';

  const fetchRouterState = useCallback(async () => {
    try {
      const res = await fetch('/api/router/state');
      if (!res.ok) return;
      const data = await res.json();
      setRouterState(data);
    } catch {
      // Retry on next router interaction
    }
  }, []);

  useEffect(() => {
    fetchRouterState();
  }, [fetchRouterState]);

  const handleUpdateSettings = async (payload: Record<string, any>) => {
    await fetch('/api/router/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await fetchRouterState();
  };

  const navItems: Array<{ id: NavSection; label: string }> = [
    { id: 'workbench', label: 'Workbench' },
    { id: 'models', label: 'Models & Routing' },
    { id: 'providers', label: 'Provider Pool' },
    { id: 'playground', label: 'Playground & CLI' },
    { id: 'vsix', label: 'VSIX Package' }
  ];

  return (
    <div
      className={`min-h-screen transition-colors ${
        isHighVis ? 'bg-[#070B14] text-[#F8FAFC]' : 'bg-[#1E1E1E] text-[#D4D4D4]'
      }`}
    >
      {/* 3-Zone Top Bar */}
      <header
        className={`flex items-center justify-between gap-8 px-6 py-3.5 border-b ${
          isHighVis ? 'bg-[#090D16] border-[#1E293B]' : 'bg-[#252526] border-[#3C3C3C]'
        }`}
      >
        <a
          href="#workbench"
          onClick={(e) => {
            e.preventDefault();
            setActiveNav('workbench');
          }}
          className="text-lg font-bold tracking-tight whitespace-nowrap shrink-0"
        >
          FreeLLMAPI Kilo
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navItems.map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                  active
                    ? isHighVis
                      ? 'border-sky-400 text-white font-semibold'
                      : 'border-[#007ACC] text-white font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <a
            href="/api/vsix/download"
            download="freellmapi-kilo-vscode-0.16.9.vsix"
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download VSIX v1.70.2
          </a>
        </div>
      </header>

      {/* Secondary Context & Custom High-Visibility UI Theme Toggle */}
      <div
        className={`px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 text-xs ${
          isHighVis ? 'bg-[#090D16]/80 border-[#1E293B] text-slate-400' : 'bg-[#2D2D2D] border-[#3C3C3C] text-zinc-400'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex md:hidden items-center gap-1.5 mr-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`px-2 py-1 rounded text-xs whitespace-nowrap cursor-pointer ${
                  activeNav === item.id ? 'bg-sky-600 text-white' : 'text-slate-400'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <span className="font-mono">VS Code ^1.70.2</span>
          <span aria-hidden="true">·</span>
          <span>
            Strategy: <strong className="text-slate-200">{routerState?.strategy || 'balanced'}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums font-mono">
            {routerState ? routerState.providers.filter((p) => p.enabled).length : 24} Active Pools
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums font-mono">
            {routerState ? routerState.analytics.totalRequests : 0} Requests
          </span>
        </div>

        <button
          onClick={() => setTheme((prev) => (prev === 'high-vis' ? 'vscode-default' : 'high-vis'))}
          className={`px-3 py-1 rounded border font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            isHighVis
              ? 'bg-[#0F172A] border-sky-500/60 text-sky-300 hover:border-sky-400'
              : 'bg-[#1E1E1E] border-[#454545] text-zinc-200 hover:border-sky-500'
          }`}
        >
          <Eye className="w-3.5 h-3.5 text-amber-400" />
          {isHighVis ? 'Custom Theme: Kilo High-Visibility (Active)' : 'Previewing: Standard VS Code Dark'}
        </button>
      </div>

      {/* Main Content Canvas */}
      <main className="max-w-[1440px] mx-auto px-6 py-6">
        {activeNav === 'workbench' && (
          <WorkbenchView
            theme={theme}
            files={workspaceFiles}
            setFiles={setWorkspaceFiles}
            onRouterActivity={fetchRouterState}
          />
        )}

        {activeNav === 'models' && routerState && (
          <ModelsRoutingView
            theme={theme}
            routerState={routerState}
            onUpdateSettings={handleUpdateSettings}
          />
        )}

        {activeNav === 'providers' && routerState && (
          <ProviderPoolView
            theme={theme}
            routerState={routerState}
            onUpdateSettings={handleUpdateSettings}
          />
        )}

        {activeNav === 'playground' && routerState && (
          <PlaygroundCliView
            theme={theme}
            routerState={routerState}
            onRouterActivity={fetchRouterState}
          />
        )}

        {activeNav === 'vsix' && <VsixBuilderView theme={theme} />}
      </main>
    </div>
  );
}
