export type ThemeMode = 'high-vis' | 'vscode-default';
export type NavSection = 'workbench' | 'models' | 'providers' | 'playground' | 'vsix';
export type KiloMode = 'architect' | 'code' | 'ask' | 'debug' | 'orchestrator';

export type RoutingStrategy =
  | 'balanced'
  | 'priority'
  | 'smartest'
  | 'fastest'
  | 'reliable'
  | 'custom'
  | 'decision';

export type KeySelectionStrategy = 'auto' | 'least-remaining';

export interface FileDiagnostic {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface WorkspaceFile {
  path: string;
  language: string;
  content: string;
}

export interface AgentThoughtStep {
  tool: string;
  target: string;
  summary: string;
}

export interface ProposedFileEdit {
  path: string;
  action: 'modify' | 'create' | string;
  explanation: string;
  newContent: string;
  applied?: boolean;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  mode: KiloMode;
  text: string;
  servedModel?: string;
  platform?: string;
  latencyMs?: number;
  savedTokens?: number;
  thoughtSteps?: AgentThoughtStep[];
  fileEdits?: ProposedFileEdit[];
}

export interface ProviderPoolEntry {
  id: string;
  name: string;
  category: 'chat' | 'gateway' | 'search' | 'media' | 'local';
  protocol: string;
  allowanceNote: string;
  enabled: boolean;
  vaultStatus: 'managed-ready' | 'keyless-ready' | 'standby';
  rpmUsed: number;
  rpmLimit: number;
  rpdUsed: number;
  rpdLimit: number;
  monthlyTokensUsed: number;
  monthlyTokensCap: number;
  cooldownSeconds: number;
  proxyMode: 'direct' | 'forward' | 'fetch-relay';
  reliabilityPct: number;
  lastProbeMs: number;
}

export interface RouterModelEntry {
  id: string;
  name: string;
  platform: string;
  modality: 'chat' | 'fusion' | 'embeddings' | 'image' | 'video' | 'audio' | 'search' | 'decision';
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  speedScore: number;
  capabilityScore: number;
  reliabilityScore: number;
  ttftMs: number;
  enabled: boolean;
  priorityOrder: number;
  penaltyPoints: number;
}

export interface ChainProfile {
  id: string;
  name: string;
  description: string;
  strategy: RoutingStrategy;
  models: string[];
  autoIncludeNewModels: boolean;
}

export interface CompressionEngineEntry {
  id: string;
  name: string;
  stage: number;
  enabled: boolean;
  description: string;
}

export interface CliGeneratorEntry {
  id: string;
  name: string;
  protocol: string;
  command: string;
  configPath: string;
}

export interface RouterTelemetryLog {
  id: string;
  timestamp: string;
  surface: string;
  caller: string;
  requestedModel: string;
  servedModel: string;
  platform: string;
  latencyMs: number;
  ttftMs: number;
  promptTokens: number;
  completionTokens: number;
  savedTokens: number;
  status: number;
  cached: boolean;
}

export interface RouterStateResponse {
  version: string;
  vscodeCompatibility: string;
  strategy: RoutingStrategy;
  keySelectionStrategy: KeySelectionStrategy;
  weights: { intelligence: number; speed: number; reliability: number };
  reliabilityFloor: number;
  peakHoursAvoidance: boolean;
  stickySessionsMinutes: number;
  contextHandoffEnabled: boolean;
  promptCompressionEnabled: boolean;
  responseCacheEnabled: boolean;
  mcpServerEnabled: boolean;
  ollamaEmulationEnabled: boolean;
  catalogSyncTier: string;
  lastCatalogSync: string;
  providers: ProviderPoolEntry[];
  models: RouterModelEntry[];
  profiles: ChainProfile[];
  compressionEngines: CompressionEngineEntry[];
  cliGenerators: CliGeneratorEntry[];
  backups: Array<{ id: string; createdAt: string; sizeBytes: number; note: string }>;
  analytics: {
    totalRequests: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    avgTtftMs: number;
    totalSavedTokens: number;
    logs: RouterTelemetryLog[];
  };
}

/**
 * Real-time client-side delimiter & syntax sanity analyzer across code files.
 * Zero pre-seeded fake warnings: returns diagnostics only when real structural issues exist.
 */
export function computeLiveDiagnostics(content: string, language: string): FileDiagnostic[] {
  if (language === 'plaintext' || language === 'markdown' || language === 'html' || language === 'sql') {
    return [];
  }
  const diagnostics: FileDiagnostic[] = [];
  const stack: Array<{ ch: string; expected: string; line: number }> = [];
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
  const closers = new Set(['}', ')', ']']);

  const lines = content.split('\n');
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (/^(<{7}|={7}|>{7})/.test(rawLine)) {
      diagnostics.push({
        line: i + 1,
        message: 'Unresolved merge conflict marker detected.',
        severity: 'error'
      });
    }

    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;

    for (let j = 0; j < rawLine.length; j++) {
      const ch = rawLine[j];
      const next = rawLine[j + 1] || '';

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          j++;
        }
        continue;
      }

      if (!inSingle && !inDouble && !inTemplate) {
        if (ch === '/' && next === '/') break;
        if (ch === '#' && language === 'python') break;
        if (ch === '/' && next === '*') {
          inBlockComment = true;
          j++;
          continue;
        }
      }

      if (ch === '\\') {
        j++;
        continue;
      }
      if (!inDouble && !inTemplate && ch === "'") {
        // Ignore Rust lifetime annotations like &'a str
        if (language === 'rust' && /[a-zA-Z_]/.test(next) && rawLine[j + 2] !== "'") {
          continue;
        }
        inSingle = !inSingle;
        continue;
      }
      if (!inSingle && !inTemplate && ch === '"') {
        inDouble = !inDouble;
        continue;
      }
      if (!inSingle && !inDouble && ch === '`') {
        inTemplate = !inTemplate;
        continue;
      }

      if (inSingle || inDouble || inTemplate) continue;

      if (pairs[ch]) {
        stack.push({ ch, expected: pairs[ch], line: i + 1 });
      } else if (closers.has(ch)) {
        const top = stack.pop();
        if (!top || top.expected !== ch) {
          diagnostics.push({
            line: i + 1,
            message: `Unmatched closing '${ch}'${top ? ` (expected '${top.expected}' from line ${top.line})` : ''}.`,
            severity: 'error'
          });
          return diagnostics;
        }
      }
    }
  }

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1];
    diagnostics.push({
      line: unclosed.line,
      message: `Unclosed '${unclosed.ch}' — expected matching '${unclosed.expected}'.`,
      severity: 'error'
    });
  }

  return diagnostics;
}

export const INITIAL_WORKSPACE_FILES: WorkspaceFile[] = [
  {
    path: 'src/router/banditScorer.ts',
    language: 'typescript',
    content: `export interface ModelCandidate {
  id: string;
  platform: string;
  speedScore: number;
  capabilityScore: number;
  reliabilityScore: number;
  pulls: number;
  successes: number;
}

/**
 * UCB1 Bandit + Weighted Multi-Objective Scorer for FreeLLMAPI
 */
export function rankModelsForTask(
  candidates: ModelCandidate[],
  weights = { intelligence: 0.45, speed: 0.3, reliability: 0.25 }
): ModelCandidate[] {
  const totalPulls = candidates.reduce((acc, c) => acc + c.pulls, 0);
  return [...candidates].sort((a, b) => {
    const scoreA = computeCompositeScore(a, totalPulls, weights);
    const scoreB = computeCompositeScore(b, totalPulls, weights);
    return scoreB - scoreA;
  });
}

function computeCompositeScore(
  m: ModelCandidate,
  totalPulls: number,
  w: { intelligence: number; speed: number; reliability: number }
): number {
  const base = m.capabilityScore * w.intelligence + m.speedScore * w.speed + m.reliabilityScore * w.reliability;
  const exploration = Math.sqrt((2 * Math.log(totalPulls + 1)) / Math.max(1, m.pulls));
  return base + exploration * 4.5;
}
`
  },
  {
    path: 'agent/pipeline.py',
    language: 'python',
    content: `from dataclasses import dataclass
from typing import List, Dict

@dataclass
class PromptTurn:
    role: str
    content: str

def compact_context_window(turns: List[PromptTurn], budget_tokens: int = 8192) -> List[PromptTurn]:
    """Fail-open prompt compression stage preserving final two turns verbatim."""
    if len(turns) <= 2:
        return turns

    head, protected_tail = turns[:-2], turns[-2:]
    seen_hashes: Dict[int, bool] = {}
    compacted: List[PromptTurn] = []

    for turn in head:
        digest = hash(turn.content.strip())
        if len(turn.content) > 400 and digest in seen_hashes:
            continue
        seen_hashes[digest] = True
        compacted.append(turn)

    return compacted + protected_tail
`
  },
  {
    path: 'engine/rate_limiter.rs',
    language: 'rust',
    content: `use std::collections::HashMap;
use std::time::Instant;

pub struct KeyQuotaBucket {
    pub rpm_limit: u32,
    pub rpm_used: u32,
    pub window_reset: Instant,
    pub cooldown_until: Option<Instant>,
}

pub struct RateTracker {
    buckets: HashMap<String, KeyQuotaBucket>,
}

impl RateTracker {
    pub fn new() -> Self {
        Self { buckets: HashMap::new() }
    }

    pub fn is_key_usable(&self, key_id: &str, now: Instant) -> bool {
        match self.buckets.get(key_id) {
            None => true,
            Some(bucket) => {
                if let Some(until) = bucket.cooldown_until {
                    if now < until {
                        return false;
                    }
                }
                now >= bucket.window_reset || bucket.rpm_used < bucket.rpm_limit
            }
        }
    }
}
`
  },
  {
    path: 'gateway/proxy_relay.go',
    language: 'go',
    content: `package gateway

import (
	"context"
	"net/http"
	"time"
)

type RelayConfig struct {
	UpstreamURL string
	Mode        string // "direct" | "forward" | "fetch-relay"
	Timeout     time.Duration
}

func NewRelayClient(cfg RelayConfig) *http.Client {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	return &http.Client{
		Timeout: timeout,
	}
}

func ProbeReady(ctx context.Context, client *http.Client, endpoint string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"/livez", nil)
	if err != nil {
		return false
	}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}
`
  },
  {
    path: 'sql/analytics_rollup.sql',
    language: 'sql',
    content: `-- FreeLLMAPI p50 / p95 / TTFT Request Rollup Query
SELECT
  platform,
  served_model,
  COUNT(*) AS total_requests,
  ROUND(AVG(ttft_ms), 1) AS avg_ttft_ms,
  SUM(prompt_tokens + completion_tokens) AS total_tokens,
  SUM(compressed_saved_tokens) AS tokens_saved
FROM request_aggregates
WHERE created_at >= datetime('now', '-7 days')
GROUP BY platform, served_model
ORDER BY total_requests DESC;
`
  }
];
