import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import * as url from 'url';

export type RoutingStrategy =
  | 'priority'
  | 'balanced'
  | 'smartest'
  | 'fastest'
  | 'reliable'
  | 'custom'
  | 'decision';

export type KeySelectionStrategy = 'auto' | 'least-remaining';

export interface ProviderKeyRecord {
  id: string;
  platform: string;
  label: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
  baseUrl?: string;
  proxyUrl?: string;
  enabled: boolean;
  monthlyBudgetTokens?: number;
  monthlyUsedTokens: number;
  rpmLimit: number;
  rpdLimit: number;
  rpmCurrent: number;
  rpdCurrent: number;
  cooldownUntil: number;
  lastHealthyAt: number | null;
  healthError: string | null;
}

export interface CatalogModel {
  id: string;
  name: string;
  platform: string;
  modality: 'chat' | 'fusion' | 'embeddings' | 'image' | 'video' | 'audio' | 'search' | 'decision';
  priority: number;
  intelligenceRank: number;
  speedRank: number;
  reliabilityScore: number;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  enabled: boolean;
  ttftMs: number;
}

export interface NamedChainProfile {
  name: string;
  description: string;
  models: string[];
  strategy: RoutingStrategy;
}

export interface RequestLogEntry {
  id: string;
  timestamp: number;
  surface: string;
  requestedModel: string;
  servedModel: string;
  platform: string;
  latencyMs: number;
  ttftMs: number;
  promptTokens: number;
  completionTokens: number;
  compressedSavedTokens: number;
  status: number;
  cached: boolean;
}

export const SUPPORTED_PLATFORMS: Array<{
  id: string;
  name: string;
  baseUrl: string;
  format: 'openai' | 'gemini' | 'search';
  keyless?: boolean;
}> = [
  { id: 'kilo', name: 'Kilo Gateway', baseUrl: 'https://api.kilo.ai/api/gateway/v1', format: 'openai', keyless: true },
  { id: 'ovh', name: 'OVHcloud AI Endpoints', baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', format: 'openai', keyless: true },
  { id: 'llm7', name: 'LLM7 Aggregator', baseUrl: 'https://api.llm7.io/v1', format: 'openai', keyless: true },
  { id: 'google', name: 'Google AI Studio (Gemini)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', format: 'gemini' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', format: 'openai' },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', format: 'openai' },
  { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', format: 'openai' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', format: 'openai' },
  { id: 'opencode', name: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', format: 'openai' },
  { id: 'cohere', name: 'Cohere', baseUrl: 'https://api.cohere.ai/compatibility/v1', format: 'openai' },
  { id: 'nvidia', name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', format: 'openai' },
  { id: 'zhipu', name: 'Z.ai (Zhipu)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', format: 'openai' },
  { id: 'huggingface', name: 'HuggingFace Router', baseUrl: 'https://router.huggingface.co/v1', format: 'openai' },
  { id: 'cloudflare', name: 'Cloudflare Workers AI', baseUrl: 'https://api.cloudflare.com/client/v4', format: 'openai' },
  { id: 'modelscope', name: 'ModelScope', baseUrl: 'https://api-inference.modelscope.cn/v1', format: 'openai' },
  { id: 'pollinations', name: 'Pollinations', baseUrl: 'https://gen.pollinations.ai/v1', format: 'openai' },
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:11434/v1', format: 'openai', keyless: true },
  { id: 'sail', name: 'Sail Research', baseUrl: 'https://api.sailresearch.ai/v1', format: 'openai' },
  { id: 'typhoon', name: 'Typhoon', baseUrl: 'https://api.opentyphoon.ai/v1', format: 'openai' },
  { id: 'radeon', name: 'AMD Radeon Cloud', baseUrl: 'https://developer.amd.com.cn/radeon/api/v1', format: 'openai' },
  { id: 'anyapi', name: 'AnyAPI', baseUrl: 'https://api.anyapi.ai/v1', format: 'openai' },
  { id: 'bai', name: 'B.AI', baseUrl: 'https://api.b.ai/v1', format: 'openai' },
  { id: 'tavily', name: 'Tavily Search', baseUrl: 'https://api.tavily.com', format: 'search' },
  { id: 'exa', name: 'Exa Search', baseUrl: 'https://api.exa.ai', format: 'search' },
  { id: 'brave', name: 'Brave Search', baseUrl: 'https://api.search.brave.com/res/v1', format: 'search' },
  { id: 'custom', name: 'Custom (OpenAI-compatible)', baseUrl: 'http://127.0.0.1:8080/v1', format: 'openai' }
];

export const DEFAULT_CATALOG: CatalogModel[] = [
  { id: 'Meta-Llama-3_3-70B-Instruct', name: 'Llama 3.3 70B Instruct (OVH Keyless)', platform: 'ovh', modality: 'chat', priority: 1, intelligenceRank: 92, speedRank: 95, reliabilityScore: 98, contextWindow: 128000, maxOutputTokens: 16384, supportsTools: true, supportsVision: false, enabled: true, ttftMs: 220 },
  { id: 'kilo-auto/free', name: 'Kilo Auto Free Router', platform: 'kilo', modality: 'chat', priority: 2, intelligenceRank: 91, speedRank: 92, reliabilityScore: 97, contextWindow: 128000, maxOutputTokens: 16384, supportsTools: true, supportsVision: false, enabled: true, ttftMs: 260 },
  { id: 'default', name: 'LLM7 Default Free', platform: 'llm7', modality: 'chat', priority: 3, intelligenceRank: 89, speedRank: 90, reliabilityScore: 95, contextWindow: 64000, maxOutputTokens: 8192, supportsTools: true, supportsVision: false, enabled: true, ttftMs: 310 },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', platform: 'google', modality: 'chat', priority: 4, intelligenceRank: 95, speedRank: 95, reliabilityScore: 98, contextWindow: 1048576, maxOutputTokens: 65536, supportsTools: true, supportsVision: true, enabled: true, ttftMs: 240 },
  { id: 'qwen-3-235b-a22b-instruct-2507', name: 'Qwen 3 235B A22B', platform: 'cerebras', modality: 'chat', priority: 5, intelligenceRank: 96, speedRank: 99, reliabilityScore: 96, contextWindow: 131072, maxOutputTokens: 32768, supportsTools: true, supportsVision: false, enabled: true, ttftMs: 125 },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', platform: 'groq', modality: 'chat', priority: 6, intelligenceRank: 91, speedRank: 99, reliabilityScore: 97, contextWindow: 128000, maxOutputTokens: 32768, supportsTools: true, supportsVision: false, enabled: true, ttftMs: 130 },
  { id: 'codestral-latest', name: 'Codestral Latest', platform: 'mistral', modality: 'chat', priority: 7, intelligenceRank: 94, speedRank: 95, reliabilityScore: 97, contextWindow: 256000, maxOutputTokens: 32768, supportsTools: true, supportsVision: false, enabled: true, ttftMs: 195 },
  { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash', platform: 'zhipu', modality: 'chat', priority: 8, intelligenceRank: 90, speedRank: 91, reliabilityScore: 95, contextWindow: 128000, maxOutputTokens: 16384, supportsTools: true, supportsVision: true, enabled: true, ttftMs: 290 },
  { id: 'fusion', name: 'Fusion Multi-Model Synthesis', platform: 'kilo', modality: 'fusion', priority: 1, intelligenceRank: 99, speedRank: 84, reliabilityScore: 99, contextWindow: 128000, maxOutputTokens: 16384, supportsTools: true, supportsVision: false, enabled: true, ttftMs: 540 }
];

export const CLI_AGENT_RECIPES = [
  { id: 'kilo', name: 'Kilo Code', command: 'npx freellmapi setup-kilo', protocol: 'OpenAI Chat (/v1)' },
  { id: 'claude', name: 'Claude Code', command: 'npx freellmapi setup-claude', protocol: 'Anthropic Messages (/v1/messages)' },
  { id: 'codex', name: 'Codex CLI', command: 'npx freellmapi setup-codex', protocol: 'OpenAI Responses (/v1/responses)' },
  { id: 'cline', name: 'Cline', command: 'npx freellmapi setup-cline', protocol: 'OpenAI Chat (/v1)' },
  { id: 'roo', name: 'Roo Code', command: 'npx freellmapi setup-roo', protocol: 'OpenAI Chat (/v1)' },
  { id: 'continue', name: 'Continue', command: 'npx freellmapi setup-continue', protocol: 'OpenAI Chat (/v1)' },
  { id: 'aider', name: 'Aider', command: 'npx freellmapi setup-aider', protocol: 'OpenAI Chat (/v1)' },
  { id: 'opencode', name: 'OpenCode', command: 'npx freellmapi setup-opencode', protocol: 'OpenAI Chat (/v1)' },
  { id: 'qwen', name: 'Qwen Code', command: 'npx freellmapi setup-qwen', protocol: 'OpenAI or Gemini (/v1beta)' },
  { id: 'goose', name: 'Goose', command: 'npx freellmapi setup-goose', protocol: 'OpenAI Chat (/v1)' },
  { id: 'cursor', name: 'Cursor', command: 'npx freellmapi setup-cursor', protocol: 'OpenAI Chat (/v1)' }
];

export function compressMessages(
  messages: Array<{ role: string; content: string }>,
  enabled: boolean
): { messages: Array<{ role: string; content: string }>; savedTokens: number } {
  if (!enabled || !Array.isArray(messages) || messages.length === 0) {
    return { messages, savedTokens: 0 };
  }
  try {
    let originalChars = 0;
    let compressedChars = 0;
    const seenBlocks = new Set<string>();

    const out = messages.map((msg, index) => {
      const raw = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
      originalChars += raw.length;
      if (index >= messages.length - 2) {
        compressedChars += raw.length;
        return { ...msg, content: raw };
      }
      let next = raw.replace(/```json\s*([\s\S]*?)```/g, (_m, body) => {
        try {
          return '```json\n' + JSON.stringify(JSON.parse(body)) + '\n```';
        } catch {
          return _m;
        }
      });
      next = next.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{4,}/g, '  ');
      const digest = crypto.createHash('sha1').update(next).digest('hex');
      if (next.length > 600 && seenBlocks.has(digest)) {
        next = `[Deduplicated context block ${digest.slice(0, 8)}]`;
      } else if (next.length > 600) {
        seenBlocks.add(digest);
      }
      compressedChars += next.length;
      return { ...msg, content: next };
    });

    const savedTokens = Math.max(0, Math.floor((originalChars - compressedChars) / 4));
    return { messages: out, savedTokens };
  } catch {
    return { messages, savedTokens: 0 };
  }
}

function postJsonNode16(
  targetUrl: string,
  headers: Record<string, string>,
  bodyObj: unknown,
  timeoutMs = 30000,
  redirectsLeft = 3
): Promise<{ status: number; data: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const payload = Buffer.from(JSON.stringify(bodyObj), 'utf8');
    const req = (isHttps ? https : http).request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(payload.length),
          'User-Agent': 'freellmapi-kilo-vscode/0.16.9',
          ...headers
        }
      },
      (res) => {
        const status = res.statusCode || 500;
        const loc = res.headers['location'];
        if ((status === 301 || status === 302 || status === 307 || status === 308) && typeof loc === 'string' && redirectsLeft > 0) {
          const nextUrl = new url.URL(loc, targetUrl).toString();
          postJsonNode16(nextUrl, headers, bodyObj, timeoutMs, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data: any = null;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status, data, raw });
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Upstream timeout after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function writeSseChatCompletion(res: http.ServerResponse, model: string, content: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  const id = 'chatcmpl-' + crypto.randomBytes(6).toString('hex');
  const chunk = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }]
  };
  const stopChunk = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
  };
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

export class FreeLLMAPIRouterEngine {
  private masterKey: Buffer;
  private unifiedToken: string;
  private keys: ProviderKeyRecord[] = [];
  private catalog: CatalogModel[] = [...DEFAULT_CATALOG];
  private profiles: NamedChainProfile[] = [
    {
      name: 'auto:coding',
      description: 'Low-latency tool-capable coding and FIM chain',
      models: ['Meta-Llama-3_3-70B-Instruct', 'kilo-auto/free', 'codestral-latest', 'gemini-2.5-flash', 'default'],
      strategy: 'balanced'
    },
    {
      name: 'auto:architect',
      description: 'High-reasoning architecture and multi-file planning chain',
      models: ['gemini-2.5-flash', 'qwen-3-235b-a22b-instruct-2507', 'Meta-Llama-3_3-70B-Instruct', 'kilo-auto/free'],
      strategy: 'smartest'
    },
    {
      name: 'auto:vision',
      description: 'Multimodal vision chain',
      models: ['gemini-2.5-flash', 'glm-4.5-flash'],
      strategy: 'balanced'
    },
    {
      name: 'auto:fast',
      description: 'Fast inline ghost-text completion chain',
      models: ['llama-3.3-70b-versatile', 'Meta-Llama-3_3-70B-Instruct', 'kilo-auto/free', 'default'],
      strategy: 'fastest'
    }
  ];
  private strategy: RoutingStrategy = 'balanced';
  private keySelection: KeySelectionStrategy = 'auto';
  private weights = { intelligence: 45, speed: 30, reliability: 25 };
  private compressionEnabled = true;
  private responseCacheEnabled = true;
  private stickySessions = new Map<string, { modelId: string; expiresAt: number }>();
  private responseCache = new Map<string, { content: string; model: string; expiresAt: number }>();
  private logs: RequestLogEntry[] = [];
  private server: http.Server | null = null;
  private activePort = 3001;

  constructor(seedSecret: string) {
    this.masterKey = crypto.createHash('sha256').update(seedSecret || 'freellmapi-vscode-seed').digest();
    this.unifiedToken = 'freellmapi-' + crypto.createHash('sha256').update(this.masterKey).digest('hex').slice(0, 28);
  }

  public getUnifiedToken(): string {
    return this.unifiedToken;
  }

  public getPort(): number {
    return this.activePort;
  }

  public setStrategy(strategy: RoutingStrategy): void {
    this.strategy = strategy;
  }

  public setKeySelectionStrategy(keySelection: KeySelectionStrategy): void {
    this.keySelection = keySelection;
  }

  public setCompression(enabled: boolean): void {
    this.compressionEnabled = enabled;
  }

  public encryptSecret(plainText: string): { encryptedValue: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    return {
      encryptedValue: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64')
    };
  }

  public decryptSecret(record: Pick<ProviderKeyRecord, 'encryptedValue' | 'iv' | 'authTag'>): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(record.encryptedValue, 'base64')), decipher.final()]);
    return decrypted.toString('utf8');
  }

  public addProviderKey(platform: string, label: string, rawKey: string, baseUrl?: string): ProviderKeyRecord {
    const enc = this.encryptSecret(rawKey.trim());
    const rec: ProviderKeyRecord = {
      id: 'key_' + crypto.randomBytes(6).toString('hex'),
      platform,
      label: label || `${platform}-key`,
      ...enc,
      baseUrl,
      enabled: true,
      monthlyUsedTokens: 0,
      rpmLimit: 30,
      rpdLimit: 1500,
      rpmCurrent: 0,
      rpdCurrent: 0,
      cooldownUntil: 0,
      lastHealthyAt: Date.now(),
      healthError: null
    };
    this.keys.push(rec);
    return rec;
  }

  public exportEncryptedBackup(): string {
    return JSON.stringify(
      {
        version: '0.16.9',
        exportedAt: new Date().toISOString(),
        strategy: this.strategy,
        keySelection: this.keySelection,
        compressionEnabled: this.compressionEnabled,
        keys: this.keys,
        profiles: this.profiles
      },
      null,
      2
    );
  }

  public importEncryptedBackup(jsonRaw: string): number {
    const parsed = JSON.parse(jsonRaw);
    if (Array.isArray(parsed.keys)) this.keys = parsed.keys;
    if (Array.isArray(parsed.profiles)) this.profiles = parsed.profiles;
    if (parsed.strategy) this.strategy = parsed.strategy;
    return this.keys.length;
  }

  public getStateSnapshot() {
    const latencies = this.logs.map((l) => l.latencyMs).sort((a, b) => a - b);
    const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    return {
      unifiedToken: this.unifiedToken,
      port: this.activePort,
      running: Boolean(this.server),
      strategy: this.strategy,
      keySelection: this.keySelection,
      compressionEnabled: this.compressionEnabled,
      responseCacheEnabled: this.responseCacheEnabled,
      keys: this.keys.map((k) => ({
        id: k.id,
        platform: k.platform,
        label: k.label,
        baseUrl: k.baseUrl,
        enabled: k.enabled,
        rpmCurrent: k.rpmCurrent,
        rpmLimit: k.rpmLimit,
        rpdCurrent: k.rpdCurrent,
        rpdLimit: k.rpdLimit,
        monthlyUsedTokens: k.monthlyUsedTokens,
        cooldownUntil: k.cooldownUntil,
        healthError: k.healthError
      })),
      catalog: this.catalog,
      profiles: this.profiles,
      platforms: SUPPORTED_PLATFORMS,
      cliRecipes: CLI_AGENT_RECIPES,
      analytics: {
        totalRequests: this.logs.length,
        p50LatencyMs: p50,
        p95LatencyMs: p95,
        totalSavedTokens: this.logs.reduce((s, l) => s + l.compressedSavedTokens, 0),
        recentLogs: this.logs.slice(-30).reverse()
      }
    };
  }

  private pickKeyForPlatform(platform: string): ProviderKeyRecord | undefined {
    const now = Date.now();
    const usable = this.keys.filter((k) => k.enabled && k.platform === platform && k.cooldownUntil < now);
    if (usable.length === 0) return undefined;
    if (this.keySelection === 'least-remaining') {
      return usable.sort((a, b) => a.rpdCurrent / Math.max(1, a.rpdLimit) - b.rpdCurrent / Math.max(1, b.rpdLimit))[0];
    }
    return usable[0];
  }

  private rankCandidates(requestedModel: string): CatalogModel[] {
    const profile = this.profiles.find((p) => p.name === requestedModel);
    const activeStrategy = profile ? profile.strategy : this.strategy;

    let pool = this.catalog.filter((m) => m.enabled && m.modality === 'chat');
    if (profile) {
      const ordered = profile.models
        .map((id) => pool.find((m) => m.id === id))
        .filter((m): m is CatalogModel => Boolean(m));
      if (ordered.length > 0) pool = ordered;
    } else if (requestedModel && requestedModel !== 'auto' && requestedModel !== 'fusion') {
      const exact = pool.find((m) => m.id === requestedModel);
      if (exact) {
        pool = [exact, ...pool.filter((m) => m.id !== requestedModel)];
      }
    }

    const hasUsableRoute = (m: CatalogModel) => {
      const meta = SUPPORTED_PLATFORMS.find((p) => p.id === m.platform);
      if (meta?.keyless) return true;
      return Boolean(this.pickKeyForPlatform(m.platform));
    };

    const usable = pool.filter(hasUsableRoute);
    const candidates = usable.length > 0 ? usable : pool;

    if (activeStrategy === 'priority') {
      return [...candidates].sort((a, b) => a.priority - b.priority);
    }

    return [...candidates].sort((a, b) => {
      const score = (m: CatalogModel) => {
        if (activeStrategy === 'fastest') return m.speedRank * 0.75 + m.reliabilityScore * 0.25;
        if (activeStrategy === 'smartest') return m.intelligenceRank * 0.75 + m.reliabilityScore * 0.25;
        if (activeStrategy === 'reliable') return m.reliabilityScore * 0.8 + m.speedRank * 0.2;
        if (activeStrategy === 'custom') {
          return (
            (m.intelligenceRank * this.weights.intelligence +
              m.speedRank * this.weights.speed +
              m.reliabilityScore * this.weights.reliability) /
            100
          );
        }
        return m.intelligenceRank * 0.4 + m.speedRank * 0.3 + m.reliabilityScore * 0.3;
      };
      return score(b) - score(a);
    });
  }

  private async dispatchSingleModel(
    model: CatalogModel,
    messages: Array<{ role: string; content: string }>,
    temperature = 0.2,
    maxTokens = 4096
  ): Promise<string> {
    const keyRec = this.pickKeyForPlatform(model.platform);
    const platformMeta = SUPPORTED_PLATFORMS.find((p) => p.id === model.platform);

    if (model.platform === 'google' && keyRec) {
      const apiKey = this.decryptSecret(keyRec);
      const systemMsg = messages.find((m) => m.role === 'system');
      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await postJsonNode16(endpoint, {}, {
        ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
        contents: contents.length ? contents : [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      });
      if (res.status === 429 || res.status >= 500) {
        keyRec.cooldownUntil = Date.now() + 60_000;
        keyRec.healthError = `HTTP ${res.status}`;
        throw new Error(`Google HTTP ${res.status}`);
      }
      keyRec.rpmCurrent += 1;
      keyRec.rpdCurrent += 1;
      keyRec.lastHealthyAt = Date.now();
      const text = res.data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
      if (!text) throw new Error('Empty response from Gemini');
      return text;
    }

    if (platformMeta?.keyless || keyRec) {
      const baseUrl = (keyRec?.baseUrl || platformMeta?.baseUrl || 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1').replace(/\/$/, '');
      const headers: Record<string, string> = {};
      if (keyRec) {
        const rawCred = this.decryptSecret(keyRec).trim();
        if (rawCred && rawCred !== 'no-key') {
          headers['Authorization'] = `Bearer ${rawCred}`;
        }
      }
      const res = await postJsonNode16(`${baseUrl}/chat/completions`, headers, {
        model: model.id,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false
      });
      if (res.status === 429 || res.status >= 500) {
        if (keyRec) {
          keyRec.cooldownUntil = Date.now() + 60_000;
          keyRec.healthError = `HTTP ${res.status}`;
        }
        throw new Error(`${model.platform} HTTP ${res.status}`);
      }
      if (keyRec) {
        keyRec.rpmCurrent += 1;
        keyRec.rpdCurrent += 1;
        keyRec.lastHealthyAt = Date.now();
      }
      const content = res.data?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) {
        return content;
      }
      throw new Error(`Empty completion payload from ${model.platform}`);
    }

    throw new Error(`No configured credential for ${model.platform}`);
  }

  public async completeChat(params: {
    model?: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
    sessionId?: string;
    surface?: string;
  }): Promise<{ content: string; servedModel: string; platform: string; savedTokens: number; latencyMs: number }> {
    const start = Date.now();
    const requestedModel = params.model || 'auto:coding';
    const { messages: compressed, savedTokens } = compressMessages(params.messages, this.compressionEnabled);

    const cacheKey = crypto
      .createHash('sha256')
      .update(JSON.stringify({ requestedModel, compressed, t: params.temperature ?? 0.2 }))
      .digest('hex');

    if (this.responseCacheEnabled && (params.temperature ?? 0.2) === 0) {
      const hit = this.responseCache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        const latencyMs = Date.now() - start;
        this.recordLog({
          surface: params.surface || '/v1/chat/completions',
          requestedModel,
          servedModel: hit.model,
          platform: 'cache',
          latencyMs,
          ttftMs: latencyMs,
          promptTokens: 0,
          completionTokens: Math.ceil(hit.content.length / 4),
          compressedSavedTokens: savedTokens,
          status: 200,
          cached: true
        });
        return { content: hit.content, servedModel: hit.model, platform: 'cache', savedTokens, latencyMs };
      }
    }

    if (requestedModel === 'fusion') {
      const candidates = this.rankCandidates('auto:architect').slice(0, 2);
      const drafts = await Promise.allSettled(
        candidates.map((c) => this.dispatchSingleModel(c, compressed, params.temperature ?? 0.3, params.maxTokens ?? 3072))
      );
      const fulfilled = drafts
        .map((d, i) => (d.status === 'fulfilled' ? `### Draft ${i + 1} (${candidates[i].id}):\n${d.value}` : null))
        .filter((x): x is string => Boolean(x));

      if (fulfilled.length > 0) {
        const judge = candidates[0];
        const synthMessages = [
          {
            role: 'system',
            content: 'You are the FreeLLMAPI Fusion Judge. Synthesize one accurate answer from the drafts below without mentioning the drafts.'
          },
          {
            role: 'user',
            content: `Original request:\n${compressed[compressed.length - 1]?.content || ''}\n\n${fulfilled.join('\n\n')}`
          }
        ];
        const finalAnswer =
          fulfilled.length === 1
            ? fulfilled[0].replace(/^### Draft.*?\n/, '')
            : await this.dispatchSingleModel(judge, synthMessages, 0.2, params.maxTokens ?? 4096);
        const latencyMs = Date.now() - start;
        this.recordLog({
          surface: params.surface || '/v1/chat/completions (fusion)',
          requestedModel: 'fusion',
          servedModel: `fusion(${judge.id})`,
          platform: judge.platform,
          latencyMs,
          ttftMs: Math.round(latencyMs * 0.45),
          promptTokens: Math.ceil(JSON.stringify(compressed).length / 4),
          completionTokens: Math.ceil(finalAnswer.length / 4),
          compressedSavedTokens: savedTokens,
          status: 200,
          cached: false
        });
        return { content: finalAnswer, servedModel: `fusion(${judge.id})`, platform: judge.platform, savedTokens, latencyMs };
      }
    }

    const candidates = this.rankCandidates(requestedModel);
    let previousStickyModel: string | null = null;
    if (params.sessionId) {
      const sticky = this.stickySessions.get(params.sessionId);
      if (sticky && sticky.expiresAt > Date.now()) {
        previousStickyModel = sticky.modelId;
        const idx = candidates.findIndex((c) => c.id === sticky.modelId);
        if (idx > 0) {
          const [pinned] = candidates.splice(idx, 1);
          candidates.unshift(pinned);
        }
      }
    }

    let lastError = 'All upstream candidates exhausted';
    for (const candidate of candidates) {
      try {
        const effectiveMessages =
          previousStickyModel && previousStickyModel !== candidate.id
            ? [
                {
                  role: 'system',
                  content: `[FreeLLMAPI Context Handoff: Thread switched from ${previousStickyModel} to ${candidate.id}. Maintain continuity.]`
                },
                ...compressed
              ]
            : compressed;

        const content = await this.dispatchSingleModel(
          candidate,
          effectiveMessages,
          params.temperature ?? 0.2,
          params.maxTokens ?? 4096
        );
        const latencyMs = Date.now() - start;

        if (params.sessionId) {
          this.stickySessions.set(params.sessionId, {
            modelId: candidate.id,
            expiresAt: Date.now() + 30 * 60_000
          });
        }
        if (this.responseCacheEnabled && (params.temperature ?? 0.2) === 0) {
          this.responseCache.set(cacheKey, {
            content,
            model: candidate.id,
            expiresAt: Date.now() + 10 * 60_000
          });
        }
        this.recordLog({
          surface: params.surface || '/v1/chat/completions',
          requestedModel,
          servedModel: candidate.id,
          platform: candidate.platform,
          latencyMs,
          ttftMs: Math.min(latencyMs, candidate.ttftMs),
          promptTokens: Math.ceil(JSON.stringify(compressed).length / 4),
          completionTokens: Math.ceil(content.length / 4),
          compressedSavedTokens: savedTokens,
          status: 200,
          cached: false
        });
        return { content, servedModel: candidate.id, platform: candidate.platform, savedTokens, latencyMs };
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
    }

    throw new Error(`FreeLLMAPI Router Exhausted: ${lastError}`);
  }

  private recordLog(entry: Omit<RequestLogEntry, 'id' | 'timestamp'>): void {
    this.logs.push({
      id: 'req_' + crypto.randomBytes(5).toString('hex'),
      timestamp: Date.now(),
      ...entry
    });
    if (this.logs.length > 250) {
      this.logs.shift();
    }
  }

  public startServer(port = 3001): Promise<number> {
    if (this.server) {
      return Promise.resolve(this.activePort);
    }
    this.activePort = port;
    return new Promise((resolve) => {
      const srv = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const reqPath = (req.url || '/').split('?')[0];

        if (req.method === 'GET' && (reqPath === '/livez' || reqPath === '/readyz')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', version: '0.16.9', strategy: this.strategy }));
          return;
        }

        if (req.method === 'GET' && reqPath === '/v1/models') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              object: 'list',
              data: this.catalog.map((m) => ({
                id: m.id,
                object: 'model',
                created: 1730000000,
                owned_by: m.platform
              }))
            })
          );
          return;
        }

        if (req.method === 'GET' && reqPath === '/api/tags') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              models: this.catalog.map((m) => ({
                name: m.id,
                model: m.id,
                details: { family: m.platform }
              }))
            })
          );
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        req.on('end', async () => {
          try {
            const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};

            if (req.method === 'POST' && reqPath === '/v1/chat/completions') {
              const result = await this.completeChat({
                model: body.model,
                messages: body.messages || [],
                temperature: body.temperature,
                maxTokens: body.max_tokens,
                surface: '/v1/chat/completions'
              });
              res.setHeader('X-Routed-Via', `${result.platform}/${result.servedModel}`);
              if (body.stream === true) {
                writeSseChatCompletion(res, result.servedModel, result.content);
                return;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  id: 'chatcmpl-' + crypto.randomBytes(6).toString('hex'),
                  object: 'chat.completion',
                  created: Math.floor(Date.now() / 1000),
                  model: result.servedModel,
                  choices: [
                    {
                      index: 0,
                      message: { role: 'assistant', content: result.content },
                      finish_reason: 'stop'
                    }
                  ],
                  usage: {
                    prompt_tokens: 0,
                    completion_tokens: Math.ceil(result.content.length / 4),
                    total_tokens: Math.ceil(result.content.length / 4)
                  }
                })
              );
              return;
            }

            if (req.method === 'POST' && reqPath === '/v1/completions') {
              const promptText = typeof body.prompt === 'string' ? body.prompt : '';
              const result = await this.completeChat({
                model: body.model || 'auto:fast',
                messages: [
                  { role: 'system', content: 'Output ONLY raw code completion continuation with zero markdown fences.' },
                  { role: 'user', content: promptText }
                ],
                temperature: 0.1,
                maxTokens: body.max_tokens || 256,
                surface: '/v1/completions'
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  id: 'cmpl-' + crypto.randomBytes(6).toString('hex'),
                  object: 'text_completion',
                  model: result.servedModel,
                  choices: [{ text: result.content, index: 0, finish_reason: 'stop' }]
                })
              );
              return;
            }

            if (req.method === 'POST' && reqPath === '/v1/responses') {
              const inputText = typeof body.input === 'string' ? body.input : JSON.stringify(body.input || '');
              const result = await this.completeChat({
                model: body.model || 'auto:coding',
                messages: [{ role: 'user', content: inputText }],
                surface: '/v1/responses'
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  id: 'resp_' + crypto.randomBytes(6).toString('hex'),
                  object: 'response',
                  model: result.servedModel,
                  output_text: result.content,
                  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: result.content }] }]
                })
              );
              return;
            }

            if (req.method === 'POST' && reqPath === '/v1/messages') {
              const msgs: Array<{ role: string; content: string }> = [];
              if (typeof body.system === 'string') {
                msgs.push({ role: 'system', content: body.system });
              }
              for (const m of body.messages || []) {
                const text = typeof m.content === 'string' ? m.content : (m.content || []).map((p: any) => p.text || '').join('\n');
                msgs.push({ role: m.role, content: text });
              }
              const result = await this.completeChat({
                model: body.model || 'auto:coding',
                messages: msgs,
                maxTokens: body.max_tokens || 4096,
                surface: '/v1/messages'
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  id: 'msg_' + crypto.randomBytes(6).toString('hex'),
                  type: 'message',
                  role: 'assistant',
                  model: result.servedModel,
                  content: [{ type: 'text', text: result.content }],
                  stop_reason: 'end_turn'
                })
              );
              return;
            }

            if (req.method === 'POST' && reqPath === '/api/chat') {
              const result = await this.completeChat({
                model: body.model || 'auto:coding',
                messages: body.messages || [],
                surface: '/api/chat'
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  model: result.servedModel,
                  created_at: new Date().toISOString(),
                  message: { role: 'assistant', content: result.content },
                  done: true
                })
              );
              return;
            }

            if (req.method === 'POST' && reqPath === '/mcp') {
              if (body.method === 'tools/list') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: body.id,
                    result: {
                      tools: [
                        { name: 'list_usable_models', description: 'List healthy models and scores in FreeLLMAPI router' },
                        { name: 'set_routing_strategy', description: 'Switch active routing strategy' },
                        { name: 'run_fusion_inference', description: 'Run multi-model Fusion synthesis' }
                      ]
                    }
                  })
                );
                return;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: this.getStateSnapshot() }));
              return;
            }

            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: `Unknown FreeLLMAPI surface: ${reqPath}` } }));
          } catch (err: any) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: err?.message || 'Upstream failure' } }));
          }
        });
      });

      srv.on('error', () => {
        this.server = null;
        resolve(this.activePort);
      });

      srv.listen(port, '127.0.0.1', () => {
        this.server = srv;
        resolve(port);
      });
    });
  }

  public stopServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
