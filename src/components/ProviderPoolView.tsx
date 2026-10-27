import React, { useState } from 'react';
import { RefreshCw, Archive, ShieldCheck, Search } from 'lucide-react';
import { RouterStateResponse, ThemeMode } from '../types';

interface ProviderPoolViewProps {
  theme: ThemeMode;
  routerState: RouterStateResponse;
  onUpdateSettings: (payload: Record<string, any>) => Promise<void>;
}

export const ProviderPoolView: React.FC<ProviderPoolViewProps> = ({
  theme,
  routerState,
  onUpdateSettings
}) => {
  const isHighVis = theme === 'high-vis';
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [syncing, setSyncing] = useState<boolean>(false);

  const surfaceCls = isHighVis
    ? 'bg-[#0B111E] border-[#1E293B] text-slate-100'
    : 'bg-[#252526] border-[#3C3C3C] text-zinc-100';

  const filteredProviders = routerState.providers.filter((p) => {
    const matchesCat = categoryFilter === 'all' || p.category === categoryFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.protocol.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleCatalogSync = async () => {
    setSyncing(true);
    try {
      await onUpdateSettings({ syncCatalogNow: true });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`p-4 rounded-lg border ${surfaceCls}`}>
          <div className="text-xs text-slate-400">Active Provider Pools</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1">
            {routerState.providers.filter((p) => p.enabled).length} / {routerState.providers.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Keyless + Managed + Local Gateways</div>
        </div>

        <div className={`p-4 rounded-lg border ${surfaceCls}`}>
          <div className="text-xs text-slate-400">Encrypted Vault &amp; Auth</div>
          <div className="text-lg font-bold font-mono mt-1 text-sky-400">AES-256-GCM</div>
          <div className="text-[11px] text-slate-400 mt-1">VS Code SecretStorage + Server Pool</div>
        </div>

        <div className={`p-4 rounded-lg border ${surfaceCls}`}>
          <div className="text-xs text-slate-400">Prompt Compression Pipeline</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1">
            {routerState.compressionEngines.filter((e) => e.enabled).length} / 10 Stages
          </div>
          <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
            {routerState.analytics.totalSavedTokens.toLocaleString()} tokens saved in session
          </div>
        </div>

        <div className={`p-4 rounded-lg border ${surfaceCls}`}>
          <div className="text-xs text-slate-400">Catalog Sync &amp; Health Probe</div>
          <div className="text-sm font-semibold font-mono mt-1.5 truncate">
            {new Date(routerState.lastCatalogSync).toLocaleTimeString()}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={handleCatalogSync}
              disabled={syncing}
              className="px-2.5 py-1 text-xs font-medium rounded bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Probing...' : 'Sync & Probe Live'}
            </button>
          </div>
        </div>
      </div>

      {/* Provider Pool Table */}
      <div className={`p-5 rounded-lg border ${surfaceCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold">
              Provider Pool, Live RPM/RPD Counters &amp; Outbound Relay
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tracks live session requests, token budgets, health probe latency, and outbound proxy modes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search providers..."
                className={`pl-8 pr-3 py-1.5 text-xs rounded border ${
                  isHighVis ? 'bg-[#090D16] border-slate-700 text-slate-100' : 'bg-[#1E1E1E] border-[#454545] text-zinc-100'
                }`}
              />
            </div>

            <div
              className={`flex items-center gap-1 p-1 rounded-lg border ${
                isHighVis ? 'bg-[#090D16] border-[#1E293B]' : 'bg-[#1E1E1E] border-[#3C3C3C]'
              }`}
            >
              {['all', 'chat', 'gateway', 'search', 'media', 'local'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded capitalize cursor-pointer whitespace-nowrap shrink-0 ${
                    categoryFilter === cat
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3 font-medium">Provider</th>
                <th className="py-2.5 px-3 font-medium">Wire Surface · Allowance</th>
                <th className="py-2.5 px-3 font-medium text-right">RPM (Used/Cap)</th>
                <th className="py-2.5 px-3 font-medium text-right">RPD (Used/Cap)</th>
                <th className="py-2.5 px-3 font-medium text-right">Session Tokens</th>
                <th className="py-2.5 px-3 font-medium text-right">Relay · Probe</th>
                <th className="py-2.5 px-3 font-medium text-right">Pool Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredProviders.map((prov) => (
                <tr
                  key={prov.id}
                  className="border-b border-slate-800/70 hover:bg-slate-800/30"
                >
                  <td className="py-2.5 px-3 max-w-xs">
                    <div className="font-semibold">{prov.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {prov.id} · {prov.vaultStatus}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">
                    <div className="text-slate-300 font-mono text-[11px]">{prov.protocol}</div>
                    <div className="text-[11px]">{prov.allowanceNote}</div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {prov.rpmUsed} / {prov.rpmLimit}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {prov.rpdUsed.toLocaleString()} / {prov.rpdLimit.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {prov.monthlyTokensUsed.toLocaleString()} / {(prov.monthlyTokensCap / 1000000).toFixed(0)}M
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400">
                    {prov.proxyMode} · {prov.lastProbeMs > 0 ? `${prov.lastProbeMs}ms` : 'idle'}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => onUpdateSettings({ toggleProviderId: prov.id })}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer whitespace-nowrap ${
                        prov.enabled
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {prov.enabled ? 'Active' : 'Paused'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 10-Stage Prompt Compression Pipeline + Encrypted DB Backups */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-8 p-5 rounded-lg border ${surfaceCls}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">10-Stage Fail-Open Prompt Compression Pipeline</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Deduplicates context blocks, compacts JSON, prunes noisy tool stdout, and leaves the final 2 turns untouched.
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={routerState.promptCompressionEnabled}
                onChange={(e) => onUpdateSettings({ promptCompressionEnabled: e.target.checked })}
                className="accent-sky-500"
              />
              <span>Master Pipeline Active</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {routerState.compressionEngines.map((eng) => (
              <div
                key={eng.id}
                className={`p-3 rounded-md border flex items-start justify-between gap-3 ${
                  isHighVis ? 'bg-[#090D16] border-slate-800' : 'bg-[#1E1E1E] border-[#3C3C3C]'
                }`}
              >
                <div>
                  <div className="text-xs font-semibold">
                    {String(eng.stage).padStart(2, '0')}. {eng.name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{eng.description}</div>
                </div>
                <input
                  type="checkbox"
                  checked={eng.enabled}
                  onChange={() => onUpdateSettings({ toggleCompressionEngineId: eng.id })}
                  className="mt-1 accent-sky-500 cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Encrypted Vault Snapshots & Ollama Emulation */}
        <div className={`lg:col-span-4 p-5 rounded-lg border flex flex-col justify-between ${surfaceCls}`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <h2 className="text-base font-semibold">Encrypted Snapshots</h2>
              </div>
              <button
                onClick={() => onUpdateSettings({ createBackup: true })}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-sky-600 text-white hover:bg-sky-500 cursor-pointer flex items-center gap-1"
              >
                <Archive className="w-3.5 h-3.5" />
                Snapshot Now
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Exports AES-256-GCM encrypted routing profiles, model toggles, and quota ceilings.
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {routerState.backups.length === 0 ? (
                <div className="p-3 rounded border border-slate-800 text-xs text-slate-400">
                  No snapshots created yet — click Snapshot Now to export current router state.
                </div>
              ) : (
                routerState.backups.map((bkp) => (
                  <div
                    key={bkp.id}
                    className={`p-2.5 rounded border text-xs ${
                      isHighVis ? 'bg-[#090D16] border-slate-800' : 'bg-[#1E1E1E] border-[#3C3C3C]'
                    }`}
                  >
                    <div className="font-mono font-semibold text-sky-400">{bkp.id}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{bkp.note}</div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
                      {(bkp.sizeBytes / 1024).toFixed(2)} KB · {new Date(bkp.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 mt-4 border-t border-inherit text-[11px] text-slate-400">
            Ollama Emulation (/api/chat, /api/tags):{' '}
            <button
              onClick={() =>
                onUpdateSettings({ ollamaEmulationEnabled: !routerState.ollamaEmulationEnabled })
              }
              className="text-sky-400 font-semibold hover:underline cursor-pointer"
            >
              {routerState.ollamaEmulationEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
