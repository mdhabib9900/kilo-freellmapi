import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Plus, Sliders, Layers } from 'lucide-react';
import { RouterStateResponse, RoutingStrategy, ThemeMode } from '../types';

interface ModelsRoutingViewProps {
  theme: ThemeMode;
  routerState: RouterStateResponse;
  onUpdateSettings: (payload: Record<string, any>) => Promise<void>;
}

const MODALITIES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All Modalities' },
  { id: 'chat', label: 'Chat' },
  { id: 'fusion', label: 'Fusion' },
  { id: 'embeddings', label: 'Embeddings' },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'search', label: 'Search' },
  { id: 'decision', label: 'Decision' }
];

const STRATEGIES: Array<{ id: RoutingStrategy; name: string; desc: string }> = [
  { id: 'balanced', name: 'Balanced', desc: 'Blends intelligence, TTFT speed, and live reliability with bandit exploration' },
  { id: 'priority', name: 'Priority Order', desc: 'Follows your manual fallback chain top-to-bottom on failover' },
  { id: 'smartest', name: 'Smartest', desc: 'Prioritizes highest reasoning & coding benchmark rank' },
  { id: 'fastest', name: 'Fastest', desc: 'Routes to lowest-latency models for instant ghost-text & chat' },
  { id: 'reliable', name: 'Reliable', desc: 'Prefers highest uptime pools with zero recent 429 cooldowns' },
  { id: 'custom', name: 'Custom Weights', desc: 'Scores models strictly using your custom slider weights' },
  { id: 'decision', name: 'Decision Judge', desc: 'Evaluates task complexity to select optimal cost/capability route' }
];

export const ModelsRoutingView: React.FC<ModelsRoutingViewProps> = ({
  theme,
  routerState,
  onUpdateSettings
}) => {
  const isHighVis = theme === 'high-vis';
  const [modalityFilter, setModalityFilter] = useState<string>('all');
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [newProfileDesc, setNewProfileDesc] = useState<string>('');

  const filteredModels = routerState.models
    .filter((m) => modalityFilter === 'all' || m.modality === modalityFilter)
    .sort((a, b) => a.priorityOrder - b.priorityOrder);

  const surfaceCls = isHighVis
    ? 'bg-[#0B111E] border-[#1E293B] text-slate-100'
    : 'bg-[#252526] border-[#3C3C3C] text-zinc-100';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Authentic 7 FreeLLMAPI v0.16.9 Routing Strategies */}
        <div className={`lg:col-span-7 p-5 rounded-lg border ${surfaceCls}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Routing Strategies &amp; Failover Engine</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatic 429/5xx failover with key selection strategy ({routerState.keySelectionStrategy}), directional TPM tracking, and sticky session handoff.
              </p>
            </div>
            <Sliders className="w-4 h-4 text-sky-400 shrink-0" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {STRATEGIES.map((st) => {
              const active = routerState.strategy === st.id;
              return (
                <button
                  key={st.id}
                  onClick={() => onUpdateSettings({ strategy: st.id })}
                  className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-sky-500/15 border-sky-500 text-white'
                      : isHighVis
                      ? 'bg-[#090D16] border-slate-800 text-slate-300 hover:border-slate-600'
                      : 'bg-[#1E1E1E] border-[#3C3C3C] text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  <div className="text-xs font-semibold">{st.name}</div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-snug">{st.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Weights, Key Selection Strategy & Continuity */}
        <div className={`lg:col-span-5 p-5 rounded-lg border space-y-4 ${surfaceCls}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Weights, Key Pool &amp; Continuity</h2>
            <select
              value={routerState.keySelectionStrategy}
              onChange={(e) => onUpdateSettings({ keySelectionStrategy: e.target.value })}
              title="Key Selection Strategy"
              className={`px-2 py-1 text-xs font-mono rounded border ${
                isHighVis ? 'bg-[#090D16] border-slate-700 text-sky-300' : 'bg-[#1E1E1E] border-[#454545] text-sky-300'
              }`}
            >
              <option value="auto">Key Pool: auto</option>
              <option value="least-remaining">Key Pool: least-remaining</option>
            </select>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span>Intelligence Weight</span>
                <span className="font-mono tabular-nums">{routerState.weights.intelligence}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={routerState.weights.intelligence}
                onChange={(e) =>
                  onUpdateSettings({ weights: { ...routerState.weights, intelligence: Number(e.target.value) } })
                }
                className="w-full accent-sky-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span>TTFT Speed Weight</span>
                <span className="font-mono tabular-nums">{routerState.weights.speed}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={routerState.weights.speed}
                onChange={(e) =>
                  onUpdateSettings({ weights: { ...routerState.weights, speed: Number(e.target.value) } })
                }
                className="w-full accent-sky-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span>Minimum Reliability Floor</span>
                <span className="font-mono tabular-nums">{routerState.reliabilityFloor}%</span>
              </div>
              <input
                type="range"
                min={70}
                max={99}
                value={routerState.reliabilityFloor}
                onChange={(e) => onUpdateSettings({ reliabilityFloor: Number(e.target.value) })}
                className="w-full accent-amber-500"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-inherit grid grid-cols-2 gap-3 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={routerState.peakHoursAvoidance}
                onChange={(e) => onUpdateSettings({ peakHoursAvoidance: e.target.checked })}
                className="accent-sky-500"
              />
              <span>Peak-Hours De-Weighting</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={routerState.contextHandoffEnabled}
                onChange={(e) => onUpdateSettings({ contextHandoffEnabled: e.target.checked })}
                className="accent-sky-500"
              />
              <span>30m Sticky + Context Handoff</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={routerState.responseCacheEnabled}
                onChange={(e) => onUpdateSettings({ responseCacheEnabled: e.target.checked })}
                className="accent-sky-500"
              />
              <span>Response Cache</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={routerState.mcpServerEnabled}
                onChange={(e) => onUpdateSettings({ mcpServerEnabled: e.target.checked })}
                className="accent-sky-500"
              />
              <span>MCP Server (/mcp)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Multi-Modal Catalog & Fallback Chain Reorder Table */}
      <div className={`p-5 rounded-lg border ${surfaceCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold">
              Multi-Modal Catalog &amp; Fallback Chain Order ({filteredModels.length} Models)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Chat, Fusion, Embeddings, Image, Video, Audio, Search, and Decision surfaces from FreeLLMAPI v0.16.9.
            </p>
          </div>

          <div
            className={`flex flex-wrap items-center gap-1 p-1 rounded-lg border ${
              isHighVis ? 'bg-[#090D16] border-[#1E293B]' : 'bg-[#1E1E1E] border-[#3C3C3C]'
            }`}
          >
            {MODALITIES.map((mod) => (
              <button
                key={mod.id}
                onClick={() => setModalityFilter(mod.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  modalityFilter === mod.id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {mod.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3 font-medium">Order</th>
                <th className="py-2.5 px-3 font-medium">Model &amp; Capabilities</th>
                <th className="py-2.5 px-3 font-medium">Platform · Modality</th>
                <th className="py-2.5 px-3 font-medium text-right">Context</th>
                <th className="py-2.5 px-3 font-medium text-right">TTFT</th>
                <th className="py-2.5 px-3 font-medium text-right">Speed / Intel / Rel</th>
                <th className="py-2.5 px-3 font-medium text-right">Active</th>
              </tr>
            </thead>
            <tbody>
              {filteredModels.map((model) => (
                <tr
                  key={model.id}
                  className="border-b border-slate-800/70 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-2.5 px-3 font-mono tabular-nums">
                    <div className="flex items-center gap-1">
                      <span className="w-5">#{model.priorityOrder}</span>
                      {model.modality === 'chat' && (
                        <>
                          <button
                            onClick={() => onUpdateSettings({ moveModel: { id: model.id, direction: 'up' } })}
                            title="Move Up in Chain"
                            className="p-0.5 rounded hover:bg-slate-700/50 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onUpdateSettings({ moveModel: { id: model.id, direction: 'down' } })}
                            title="Move Down in Chain"
                            className="p-0.5 rounded hover:bg-slate-700/50 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-mono font-semibold text-sky-400">{model.id}</div>
                    <div className="text-[11px] text-slate-400">
                      {model.name}
                      {model.supportsTools ? ' · Tools' : ''}
                      {model.supportsVision ? ' · Vision' : ''}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">
                    <span className="font-medium text-slate-300">{model.platform}</span> · {model.modality}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {model.contextWindow.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{model.ttftMs}ms</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {model.speedScore} / {model.capabilityScore} / {model.reliabilityScore}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => onUpdateSettings({ toggleModelId: model.id })}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer ${
                        model.enabled
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {model.enabled ? 'Enabled' : 'Paused'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Named Fallback Chain Profiles */}
      <div className={`p-5 rounded-lg border ${surfaceCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <h2 className="text-base font-semibold">Named Fallback-Chain Profiles (auto:&lt;profile&gt;)</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="Profile name (e.g. rust-audit)"
              className={`px-2.5 py-1.5 text-xs font-mono rounded border ${
                isHighVis ? 'bg-[#090D16] border-slate-700 text-slate-100' : 'bg-[#1E1E1E] border-[#454545] text-zinc-100'
              }`}
            />
            <input
              type="text"
              value={newProfileDesc}
              onChange={(e) => setNewProfileDesc(e.target.value)}
              placeholder="Purpose description"
              className={`px-2.5 py-1.5 text-xs rounded border ${
                isHighVis ? 'bg-[#090D16] border-slate-700 text-slate-100' : 'bg-[#1E1E1E] border-[#454545] text-zinc-100'
              }`}
            />
            <button
              onClick={() => {
                if (!newProfileName.trim()) return;
                onUpdateSettings({
                  newProfile: {
                    name: newProfileName.trim(),
                    description: newProfileDesc.trim() || 'Custom chain profile'
                  }
                });
                setNewProfileName('');
                setNewProfileDesc('');
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-sky-600 text-white hover:bg-sky-500 cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Profile
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {routerState.profiles.map((prof) => (
            <div
              key={prof.id}
              className={`p-3.5 rounded-md border ${
                isHighVis ? 'bg-[#090D16] border-slate-800' : 'bg-[#1E1E1E] border-[#3C3C3C]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-sky-400">{prof.name}</span>
                <span className="text-[11px] text-slate-400">{prof.strategy}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">{prof.description}</div>
              <div className="mt-2.5 text-[11px] font-mono text-slate-300 break-words">
                {prof.models.join(' → ')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
