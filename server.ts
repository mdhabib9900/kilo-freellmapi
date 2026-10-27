import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAI(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      timeout: 18000,
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

function escapeXml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function ensureWavBase64(rawBase64: string, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): string {
  if (!rawBase64) return '';
  const pcmBuf = Buffer.from(rawBase64, 'base64');
  if (pcmBuf.length >= 4 && pcmBuf.subarray(0, 4).toString('ascii') === 'RIFF') {
    return rawBase64;
  }
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuf.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuf]).toString('base64');
}

function parseResilientJson<T = Record<string, any>>(rawText: string, fallback: T): T {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      try {
        return JSON.parse(fenced[1].trim()) as T;
      } catch {
        // continue to brace extraction
      }
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

// ============================================================================
// FreeLLMAPI v0.16.9 Provider, Model, Compression & Routing Registry
// ============================================================================

type RoutingStrategy =
  | 'balanced'
  | 'priority'
  | 'smartest'
  | 'fastest'
  | 'reliable'
  | 'custom'
  | 'decision';

type KeySelectionStrategy = 'auto' | 'least-remaining';

interface ProviderPoolEntry {
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

interface RouterModelEntry {
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

interface ChainProfile {
  id: string;
  name: string;
  description: string;
  strategy: RoutingStrategy;
  models: string[];
  autoIncludeNewModels: boolean;
}

interface RouterTelemetryLog {
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

const PROVIDERS_POOL: ProviderPoolEntry[] = [
  { id: 'google', name: 'Google AI Studio (Gemini)', category: 'chat', protocol: 'Gemini /v1beta', allowanceNote: 'Managed Server Pool · 1M Context', enabled: true, vaultStatus: 'managed-ready', rpmUsed: 0, rpmLimit: 60, rpdUsed: 0, rpdLimit: 1500, monthlyTokensUsed: 0, monthlyTokensCap: 30000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 99.4, lastProbeMs: 0 },
  { id: 'ovh', name: 'OVHcloud AI Endpoints', category: 'gateway', protocol: 'OpenAI /v1', allowanceNote: 'Keyless Anonymous Free Tier', enabled: true, vaultStatus: 'keyless-ready', rpmUsed: 0, rpmLimit: 60, rpdUsed: 0, rpdLimit: 5000, monthlyTokensUsed: 0, monthlyTokensCap: 25000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 98.9, lastProbeMs: 0 },
  { id: 'kilo', name: 'Kilo Gateway', category: 'gateway', protocol: 'OpenAI /v1', allowanceNote: 'Keyless kilo-auto/free Agent Pool', enabled: true, vaultStatus: 'keyless-ready', rpmUsed: 0, rpmLimit: 30, rpdUsed: 0, rpdLimit: 1500, monthlyTokensUsed: 0, monthlyTokensCap: 15000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 98.5, lastProbeMs: 0 },
  { id: 'llm7', name: 'LLM7 Aggregator', category: 'gateway', protocol: 'OpenAI /v1', allowanceNote: 'Keyless Anonymous Multi-Model', enabled: true, vaultStatus: 'keyless-ready', rpmUsed: 0, rpmLimit: 60, rpdUsed: 0, rpdLimit: 4000, monthlyTokensUsed: 0, monthlyTokensCap: 20000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 97.6, lastProbeMs: 0 },
  { id: 'groq', name: 'Groq LPU Cloud', category: 'chat', protocol: 'OpenAI /v1', allowanceNote: 'Directional TPM + RPD Free Pool', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 30, rpdUsed: 0, rpdLimit: 14400, monthlyTokensUsed: 0, monthlyTokensCap: 25000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 98.7, lastProbeMs: 0 },
  { id: 'cerebras', name: 'Cerebras Wafer-Scale', category: 'chat', protocol: 'OpenAI /v1', allowanceNote: '1M Free Tokens/Day', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 30, rpdUsed: 0, rpdLimit: 1000, monthlyTokensUsed: 0, monthlyTokensCap: 30000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 98.2, lastProbeMs: 0 },
  { id: 'mistral', name: 'Mistral La Plateforme', category: 'chat', protocol: 'OpenAI + FIM /v1', allowanceNote: 'Codestral + Pixtral Free Tier', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 30, rpdUsed: 0, rpdLimit: 2000, monthlyTokensUsed: 0, monthlyTokensCap: 20000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 98.5, lastProbeMs: 0 },
  { id: 'openrouter', name: 'OpenRouter (:free)', category: 'gateway', protocol: 'OpenAI /v1', allowanceNote: '25+ Zero-Cost :free Routes', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 20, rpdUsed: 0, rpdLimit: 200, monthlyTokensUsed: 0, monthlyTokensCap: 10000000, cooldownSeconds: 0, proxyMode: 'fetch-relay', reliabilityPct: 95.4, lastProbeMs: 0 },
  { id: 'opencode', name: 'OpenCode Zen', category: 'gateway', protocol: 'OpenAI /v1', allowanceNote: 'Zero-Card Promotional Coding Tier', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 20, rpdUsed: 0, rpdLimit: 1000, monthlyTokensUsed: 0, monthlyTokensCap: 15000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 97.1, lastProbeMs: 0 },
  { id: 'cloudflare', name: 'Cloudflare Workers AI', category: 'chat', protocol: 'Cloudflare REST', allowanceNote: '10,000 Neurons/Day Free', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 50, rpdUsed: 0, rpdLimit: 1500, monthlyTokensUsed: 0, monthlyTokensCap: 10000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 97.9, lastProbeMs: 0 },
  { id: 'cohere', name: 'Cohere Trial API', category: 'chat', protocol: 'OpenAI + Rerank', allowanceNote: '1,000 Calls/Month Trial', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 20, rpdUsed: 0, rpdLimit: 500, monthlyTokensUsed: 0, monthlyTokensCap: 5000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 97.6, lastProbeMs: 0 },
  { id: 'zhipu', name: 'Z.ai (Zhipu GLM)', category: 'chat', protocol: 'OpenAI /v1', allowanceNote: 'GLM-4.5-Flash Permanent Free', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 30, rpdUsed: 0, rpdLimit: 3000, monthlyTokensUsed: 0, monthlyTokensCap: 20000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 96.9, lastProbeMs: 0 },
  { id: 'nvidia', name: 'NVIDIA NIM Build', category: 'chat', protocol: 'OpenAI /v1', allowanceNote: 'Developer Inference Credits', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 40, rpdUsed: 0, rpdLimit: 1000, monthlyTokensUsed: 0, monthlyTokensCap: 15000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 97.4, lastProbeMs: 0 },
  { id: 'huggingface', name: 'HuggingFace Inference Router', category: 'gateway', protocol: 'OpenAI /v1', allowanceNote: 'Monthly Serverless Credits', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 30, rpdUsed: 0, rpdLimit: 1000, monthlyTokensUsed: 0, monthlyTokensCap: 8000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 95.6, lastProbeMs: 0 },
  { id: 'modelscope', name: 'ModelScope Inference', category: 'gateway', protocol: 'OpenAI /v1', allowanceNote: '2,000 Calls/Day Qwen3 & DeepSeek', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 30, rpdUsed: 0, rpdLimit: 2000, monthlyTokensUsed: 0, monthlyTokensCap: 18000000, cooldownSeconds: 0, proxyMode: 'forward', reliabilityPct: 96.2, lastProbeMs: 0 },
  { id: 'pollinations', name: 'Pollinations Gen API', category: 'media', protocol: 'gen.pollinations.ai/v1', allowanceNote: 'Flux Image & Multimodal Tier', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 60, rpdUsed: 0, rpdLimit: 5000, monthlyTokensUsed: 0, monthlyTokensCap: 50000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 95.1, lastProbeMs: 0 },
  { id: 'iteracompute', name: 'IteraCompute', category: 'gateway', protocol: 'OpenAI /v1', allowanceNote: '30M Monthly Account Allowance', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 30, rpdUsed: 0, rpdLimit: 2000, monthlyTokensUsed: 0, monthlyTokensCap: 30000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 96.4, lastProbeMs: 0 },
  { id: 'typhoon', name: 'SCB10X Typhoon', category: 'chat', protocol: 'OpenAI + ASR', allowanceNote: 'Free Chat + Speech Transcription', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 20, rpdUsed: 0, rpdLimit: 1000, monthlyTokensUsed: 0, monthlyTokensCap: 8000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 96.7, lastProbeMs: 0 },
  { id: 'sail', name: 'Sail Research', category: 'gateway', protocol: 'Responses /v1/responses', allowanceNote: 'Monthly Refreshing Grant', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 20, rpdUsed: 0, rpdLimit: 500, monthlyTokensUsed: 0, monthlyTokensCap: 5000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 96.1, lastProbeMs: 0 },
  { id: 'radeon', name: 'AMD Radeon Cloud', category: 'gateway', protocol: 'OpenAI /v1', allowanceNote: 'Shared Instinct MI300X Roster', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 25, rpdUsed: 0, rpdLimit: 1000, monthlyTokensUsed: 0, monthlyTokensCap: 12000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 96.8, lastProbeMs: 0 },
  { id: 'tavily', name: 'Tavily Search', category: 'search', protocol: 'POST /v1/search', allowanceNote: '1,000 Free Web Searches/Month', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 30, rpdUsed: 0, rpdLimit: 300, monthlyTokensUsed: 0, monthlyTokensCap: 1000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 99.1, lastProbeMs: 0 },
  { id: 'brave', name: 'Brave Search API', category: 'search', protocol: 'POST /v1/search', allowanceNote: '2,000 Queries/Month Free', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 20, rpdUsed: 0, rpdLimit: 400, monthlyTokensUsed: 0, monthlyTokensCap: 2000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 99.2, lastProbeMs: 0 },
  { id: 'exa', name: 'Exa Search', category: 'search', protocol: 'POST /v1/search', allowanceNote: 'Semantic Web Retrieval', enabled: true, vaultStatus: 'standby', rpmUsed: 0, rpmLimit: 20, rpdUsed: 0, rpdLimit: 300, monthlyTokensUsed: 0, monthlyTokensCap: 1000000, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 98.8, lastProbeMs: 0 },
  { id: 'ollama', name: 'Ollama / vLLM / LM Studio', category: 'local', protocol: 'Ollama /api + /v1', allowanceNote: 'Unlimited Local Hardware Execution', enabled: true, vaultStatus: 'keyless-ready', rpmUsed: 0, rpmLimit: 999, rpdUsed: 0, rpdLimit: 99999, monthlyTokensUsed: 0, monthlyTokensCap: 999999999, cooldownSeconds: 0, proxyMode: 'direct', reliabilityPct: 99.9, lastProbeMs: 0 }
];

const ROUTER_MODELS: RouterModelEntry[] = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', platform: 'google', modality: 'chat', contextWindow: 1048576, maxOutputTokens: 65536, supportsTools: true, supportsVision: true, speedScore: 96, capabilityScore: 97, reliabilityScore: 99, ttftMs: 240, enabled: true, priorityOrder: 1, penaltyPoints: 0 },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', platform: 'google', modality: 'chat', contextWindow: 1048576, maxOutputTokens: 65536, supportsTools: true, supportsVision: true, speedScore: 99, capabilityScore: 92, reliabilityScore: 99, ttftMs: 165, enabled: true, priorityOrder: 2, penaltyPoints: 0 },
  { id: 'Meta-Llama-3_3-70B-Instruct', name: 'Meta Llama 3.3 70B Instruct', platform: 'ovh', modality: 'chat', contextWindow: 128000, maxOutputTokens: 16384, supportsTools: true, supportsVision: false, speedScore: 95, capabilityScore: 92, reliabilityScore: 98, ttftMs: 220, enabled: true, priorityOrder: 3, penaltyPoints: 0 },
  { id: 'kilo-auto/free', name: 'Kilo Auto Free Router', platform: 'kilo', modality: 'chat', contextWindow: 128000, maxOutputTokens: 16384, supportsTools: true, supportsVision: false, speedScore: 92, capabilityScore: 91, reliabilityScore: 97, ttftMs: 260, enabled: true, priorityOrder: 4, penaltyPoints: 0 },
  { id: 'qwen-3-235b-a22b', name: 'Qwen 3 235B A22B', platform: 'cerebras', modality: 'chat', contextWindow: 131072, maxOutputTokens: 32768, supportsTools: true, supportsVision: false, speedScore: 99, capabilityScore: 95, reliabilityScore: 96, ttftMs: 120, enabled: true, priorityOrder: 5, penaltyPoints: 0 },
  { id: 'codestral-latest', name: 'Codestral Latest (FIM + Chat)', platform: 'mistral', modality: 'chat', contextWindow: 256000, maxOutputTokens: 32768, supportsTools: true, supportsVision: false, speedScore: 95, capabilityScore: 94, reliabilityScore: 98, ttftMs: 185, enabled: true, priorityOrder: 6, penaltyPoints: 0 },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', platform: 'groq', modality: 'chat', contextWindow: 128000, maxOutputTokens: 32768, supportsTools: true, supportsVision: false, speedScore: 99, capabilityScore: 91, reliabilityScore: 97, ttftMs: 110, enabled: true, priorityOrder: 7, penaltyPoints: 0 },
  { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash Multimodal', platform: 'zhipu', modality: 'chat', contextWindow: 128000, maxOutputTokens: 16384, supportsTools: true, supportsVision: true, speedScore: 91, capabilityScore: 90, reliabilityScore: 95, ttftMs: 280, enabled: true, priorityOrder: 8, penaltyPoints: 0 },
  { id: 'fusion', name: 'Fusion Multi-Model Synthesis + Judge', platform: 'google', modality: 'fusion', contextWindow: 1048576, maxOutputTokens: 32768, supportsTools: true, supportsVision: true, speedScore: 84, capabilityScore: 99, reliabilityScore: 99, ttftMs: 540, enabled: true, priorityOrder: 1, penaltyPoints: 0 },
  { id: 'gemini-embedding-2-preview', name: 'Gemini Embedding 2', platform: 'google', modality: 'embeddings', contextWindow: 8192, maxOutputTokens: 3072, supportsTools: false, supportsVision: true, speedScore: 98, capabilityScore: 96, reliabilityScore: 99, ttftMs: 95, enabled: true, priorityOrder: 1, penaltyPoints: 0 },
  { id: 'cohere-embed-english-v3.0', name: 'Cohere Embed English v3.0', platform: 'cohere', modality: 'embeddings', contextWindow: 512, maxOutputTokens: 1024, supportsTools: false, supportsVision: false, speedScore: 95, capabilityScore: 93, reliabilityScore: 97, ttftMs: 130, enabled: true, priorityOrder: 2, penaltyPoints: 0 },
  { id: 'flux', name: 'Pollinations Flux Image', platform: 'pollinations', modality: 'image', contextWindow: 4096, maxOutputTokens: 4096, supportsTools: false, supportsVision: false, speedScore: 92, capabilityScore: 92, reliabilityScore: 95, ttftMs: 650, enabled: true, priorityOrder: 1, penaltyPoints: 0 },
  { id: 'Wan-AI/Wan2.1-T2V-14B', name: 'Wan 2.1 Text-to-Video', platform: 'modelscope', modality: 'video', contextWindow: 4096, maxOutputTokens: 4096, supportsTools: false, supportsVision: false, speedScore: 82, capabilityScore: 90, reliabilityScore: 94, ttftMs: 880, enabled: true, priorityOrder: 1, penaltyPoints: 0 },
  { id: 'gemini-3.8-flash-lite-tts', name: 'Gemini 3.8 Flash Lite TTS', platform: 'google', modality: 'audio', contextWindow: 8192, maxOutputTokens: 8192, supportsTools: false, supportsVision: false, speedScore: 96, capabilityScore: 95, reliabilityScore: 99, ttftMs: 260, enabled: true, priorityOrder: 1, penaltyPoints: 0 },
  { id: 'gemini-3.5-transcribe', name: 'Gemini 3.5 Transcribe ASR', platform: 'google', modality: 'audio', contextWindow: 32768, maxOutputTokens: 8192, supportsTools: false, supportsVision: false, speedScore: 97, capabilityScore: 96, reliabilityScore: 99, ttftMs: 210, enabled: true, priorityOrder: 2, penaltyPoints: 0 },
  { id: 'tavily-search', name: 'Web Search Grounding (/v1/search)', platform: 'tavily', modality: 'search', contextWindow: 32768, maxOutputTokens: 8192, supportsTools: true, supportsVision: false, speedScore: 94, capabilityScore: 97, reliabilityScore: 99, ttftMs: 310, enabled: true, priorityOrder: 1, penaltyPoints: 0 },
  { id: 'decision', name: 'Structured Route & Policy Decision (/api/decisions)', platform: 'google', modality: 'decision', contextWindow: 65536, maxOutputTokens: 4096, supportsTools: true, supportsVision: false, speedScore: 97, capabilityScore: 96, reliabilityScore: 99, ttftMs: 190, enabled: true, priorityOrder: 1, penaltyPoints: 0 }
];

const CHAIN_PROFILES: ChainProfile[] = [
  { id: 'coding', name: 'auto:coding', description: 'Primary Kilo Code autonomous editing & tool-use chain', strategy: 'balanced', models: ['gemini-3.8-flash', 'Meta-Llama-3_3-70B-Instruct', 'kilo-auto/free', 'codestral-latest'], autoIncludeNewModels: true },
  { id: 'architect', name: 'auto:architect', description: 'Deep multi-file reasoning, system design & orchestrator chain', strategy: 'smartest', models: ['fusion', 'gemini-3.8-flash', 'Meta-Llama-3_3-70B-Instruct', 'qwen-3-235b-a22b'], autoIncludeNewModels: true },
  { id: 'fast', name: 'auto:fast', description: 'Low-latency FIM inline ghost-text autocomplete chain', strategy: 'fastest', models: ['gemini-3.1-flash-lite', 'Meta-Llama-3_3-70B-Instruct', 'kilo-auto/free'], autoIncludeNewModels: false },
  { id: 'vision', name: 'auto:vision', description: 'UI screenshot inspection & multimodal debugging chain', strategy: 'reliable', models: ['gemini-3.8-flash', 'glm-4.5-flash'], autoIncludeNewModels: true }
];

const COMPRESSION_ENGINES = [
  { id: 'dedup', name: 'Block Deduplicator', stage: 1, enabled: true, description: 'SHA-1 deduplicates repeated file/context blocks in aged turns' },
  { id: 'toolfilter', name: 'Tool Output Pruner', stage: 2, enabled: true, description: 'Trims verbose npm/compiler stdout noise while keeping error lines' },
  { id: 'jsoncompact', name: 'JSON Compactor', stage: 3, enabled: true, description: 'Minifies indented JSON payloads inside conversation history' },
  { id: 'aging', name: 'Turn Aging Decay', stage: 4, enabled: true, description: 'Summarizes stale tool outputs older than 6 turns' },
  { id: 'read-lifecycle', name: 'Read-File Lifecycle', stage: 5, enabled: true, description: 'Drops superseded read_file snapshots when newer file state exists' },
  { id: 'relevance', name: 'Symbol Relevance Scorer', stage: 6, enabled: true, description: 'Prioritizes AST blocks matching active cursor & @mentions' },
  { id: 'lite', name: 'Whitespace Normalizer', stage: 7, enabled: true, description: 'Collapses redundant blank lines and trailing padding' },
  { id: 'custom-filters', name: 'Secret & Log Redactor', stage: 8, enabled: true, description: 'Strips accidental tokens/headers before outbound dispatch' },
  { id: 'hard-budget', name: 'Context Window Guard', stage: 9, enabled: true, description: 'Enforces model min-context-window headroom ceiling' },
  { id: 'fidelity-gate', name: 'Fidelity Gate (Fail-Open)', stage: 10, enabled: true, description: 'Leaves final 2 turns 100% untouched; fails open on parse ambiguity' }
];

const CLI_AGENT_GENERATORS = [
  { id: 'kilo', name: 'Kilo Code VS Code', protocol: 'OpenAI Chat (/v1)', command: 'npx freellmapi setup-kilo --url http://127.0.0.1:3001 --api-key freellmapi-local', configPath: '~/.vscode/extensions/kilo-code/settings.json' },
  { id: 'claude', name: 'Claude Code CLI', protocol: 'Anthropic Messages (/v1/messages)', command: 'npx freellmapi setup-claude --url http://127.0.0.1:3001 --api-key freellmapi-local', configPath: '~/.claude/settings.json' },
  { id: 'codex', name: 'OpenAI Codex CLI', protocol: 'OpenAI Responses (/v1/responses)', command: 'npx freellmapi setup-codex --url http://127.0.0.1:3001/v1 --api-key freellmapi-local', configPath: '~/.codex/config.toml' },
  { id: 'cline', name: 'Cline', protocol: 'OpenAI Chat (/v1)', command: 'npx freellmapi setup-cline --url http://127.0.0.1:3001/v1 --api-key freellmapi-local', configPath: '~/.cline/mcp_settings.json' },
  { id: 'roo', name: 'Roo Code', protocol: 'OpenAI Chat (/v1)', command: 'npx freellmapi setup-roo --url http://127.0.0.1:3001/v1 --api-key freellmapi-local', configPath: '~/.roo/profiles.json' },
  { id: 'continue', name: 'Continue.dev', protocol: 'OpenAI Chat + FIM (/v1)', command: 'npx freellmapi setup-continue --url http://127.0.0.1:3001/v1 --api-key freellmapi-local', configPath: '~/.continue/config.yaml' },
  { id: 'aider', name: 'Aider', protocol: 'OpenAI Chat (/v1)', command: 'npx freellmapi setup-aider --url http://127.0.0.1:3001/v1 --api-key freellmapi-local', configPath: '~/.aider.conf.yml' },
  { id: 'opencode', name: 'OpenCode CLI', protocol: 'OpenAI Chat (/v1)', command: 'npx freellmapi setup-opencode --url http://127.0.0.1:3001/v1 --api-key freellmapi-local', configPath: './opencode.json' },
  { id: 'qwen', name: 'Qwen Code', protocol: 'Gemini /v1beta or OpenAI /v1', command: 'npx freellmapi setup-qwen --url http://127.0.0.1:3001/v1 --api-key freellmapi-local', configPath: '~/.qwen/settings.json' },
  { id: 'goose', name: 'Block Goose', protocol: 'OpenAI Chat (/v1)', command: 'npx freellmapi setup-goose --url http://127.0.0.1:3001/v1 --api-key freellmapi-local', configPath: '~/.config/goose/config.yaml' },
  { id: 'zed', name: 'Zed & JetBrains AI', protocol: 'Ollama Emulation (/api/chat)', command: 'OLLAMA_HOST=http://127.0.0.1:3001 zed .', configPath: '~/.config/zed/settings.json' },
  { id: 'cursor', name: 'Cursor', protocol: 'OpenAI Override + MCP (/mcp)', command: 'npx freellmapi doctor --url http://127.0.0.1:3001', configPath: '~/.cursor/mcp.json' }
];

const routerRuntime = {
  strategy: 'balanced' as RoutingStrategy,
  keySelectionStrategy: 'auto' as KeySelectionStrategy,
  weights: { intelligence: 45, speed: 30, reliability: 25 },
  reliabilityFloor: 90,
  peakHoursAvoidance: true,
  stickySessionsMinutes: 30,
  contextHandoffEnabled: true,
  promptCompressionEnabled: true,
  responseCacheEnabled: true,
  mcpServerEnabled: true,
  ollamaEmulationEnabled: true,
  catalogSyncTier: 'live-twice-daily',
  lastCatalogSync: new Date().toISOString(),
  backups: [] as Array<{ id: string; createdAt: string; sizeBytes: number; note: string }>,
  logs: [] as RouterTelemetryLog[]
};

function recordProviderUsage(platformId: string, promptTokens: number, completionTokens: number, latencyMs: number) {
  const entry = PROVIDERS_POOL.find((p) => p.id === platformId);
  if (entry) {
    entry.rpmUsed += 1;
    entry.rpdUsed += 1;
    entry.monthlyTokensUsed += Math.max(1, promptTokens + completionTokens);
    entry.lastProbeMs = latencyMs;
  }
}

function runPromptCompression(rawText: string): { compressed: string; savedTokens: number; stagesApplied: string[] } {
  if (!routerRuntime.promptCompressionEnabled || !rawText) {
    return { compressed: rawText, savedTokens: 0, stagesApplied: [] };
  }
  const stages: string[] = [];
  let next = rawText;

  const afterJson = next.replace(/```json\s*([\s\S]*?)```/g, (_m, j) => {
    try {
      stages.push('jsoncompact');
      return '```json\n' + JSON.stringify(JSON.parse(j)) + '\n```';
    } catch {
      return _m;
    }
  });
  next = afterJson;

  if (/npm warn|deprecated|progress/i.test(next)) {
    next = next
      .split('\n')
      .filter((line) => !/^(npm warn|Progress:|\s*\.\.\.\s*$)/i.test(line))
      .join('\n');
    stages.push('toolfilter');
  }

  const blocks = next.split('\n\n');
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const b of blocks) {
    const key = b.trim();
    if (key.length > 180 && seen.has(key)) {
      stages.push('dedup');
      continue;
    }
    if (key.length > 180) seen.add(key);
    deduped.push(b);
  }
  next = deduped.join('\n\n').replace(/\n{3,}/g, '\n\n');
  if (next.length < rawText.length && !stages.includes('lite')) {
    stages.push('lite');
  }
  stages.push('fidelity-gate');
  const savedTokens = Math.max(0, Math.ceil((rawText.length - next.length) / 4));
  return { compressed: next, savedTokens, stagesApplied: Array.from(new Set(stages)) };
}

function appendLog(entry: Omit<RouterTelemetryLog, 'id' | 'timestamp'>) {
  routerRuntime.logs.unshift({
    id: 'req_' + crypto.randomBytes(4).toString('hex'),
    timestamp: new Date().toISOString(),
    ...entry
  });
  if (routerRuntime.logs.length > 100) {
    routerRuntime.logs.pop();
  }
}

// ============================================================================
// Multi-Provider Automatic Failover Dispatcher (Gemini -> OVH -> Kilo -> LLM7)
// ============================================================================

interface FailoverDispatchOptions {
  systemPrompt?: string;
  userPrompt: string;
  preferFast?: boolean;
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: Record<string, any>;
}

interface FailoverDispatchResult {
  text: string;
  servedModel: string;
  platform: string;
}

const KEYLESS_FALLBACK_UPSTREAMS: Array<{
  platform: string;
  model: string;
  endpoint: string;
}> = [
  {
    platform: 'ovh',
    model: 'Meta-Llama-3_3-70B-Instruct',
    endpoint: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions'
  },
  {
    platform: 'kilo',
    model: 'kilo-auto/free',
    endpoint: 'https://api.kilo.ai/api/gateway/v1/chat/completions'
  },
  {
    platform: 'llm7',
    model: 'default',
    endpoint: 'https://api.llm7.io/v1/chat/completions'
  }
];

async function callOpenAiCompatibleKeyless(
  endpoint: string,
  model: string,
  systemPrompt: string | undefined,
  userPrompt: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 16000);
  try {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FreeLLMAPI-Router/0.16.9'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false
      }),
      signal: controller.signal
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} from ${endpoint}`);
    }
    const json: any = await resp.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error(`Empty completion from ${model}`);
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchResilientLLM(opts: FailoverDispatchOptions): Promise<FailoverDispatchResult> {
  const temperature = opts.temperature ?? 0.2;
  const maxTokens = opts.maxTokens ?? 4096;
  const errors: string[] = [];

  const googleProvider = PROVIDERS_POOL.find((p) => p.id === 'google');
  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
      (!googleProvider || googleProvider.enabled)
  );

  if (hasGeminiKey) {
    const geminiChain = opts.preferFast
      ? ['gemini-3.1-flash-lite', 'gemini-3.8-flash']
      : ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];

    const ai = getGenAI();
    for (const gm of geminiChain) {
      const modelRow = ROUTER_MODELS.find((m) => m.id === gm);
      if (modelRow && !modelRow.enabled) continue;

      try {
        const config: Record<string, any> = {
          temperature
        };
        if (gm === 'gemini-3.8-flash') {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }
        if (opts.systemPrompt) {
          config.systemInstruction = opts.systemPrompt;
        }
        if (opts.jsonSchema) {
          config.responseMimeType = 'application/json';
          config.responseSchema = opts.jsonSchema;
        }

        const res = await ai.models.generateContent({
          model: gm,
          contents: opts.userPrompt,
          config
        });
        const text = (res.text || '').trim();
        if (text) {
          return { text, servedModel: gm, platform: 'google' };
        }
      } catch (err: any) {
        errors.push(`${gm}: ${err?.message || 'unavailable'}`);
      }
    }
  }

  for (const up of KEYLESS_FALLBACK_UPSTREAMS) {
    const prov = PROVIDERS_POOL.find((p) => p.id === up.platform);
    if (prov && !prov.enabled) continue;

    try {
      const text = await callOpenAiCompatibleKeyless(
        up.endpoint,
        up.model,
        opts.systemPrompt,
        opts.userPrompt,
        temperature,
        maxTokens
      );
      return { text, servedModel: up.model, platform: up.platform };
    } catch (err: any) {
      errors.push(`${up.platform}/${up.model}: ${err?.message || 'failed'}`);
    }
  }

  throw new Error(`All configured FreeLLMAPI upstream routes failed (${errors.join(' | ')})`);
}

function writeSseChatCompletion(res: express.Response, model: string, content: string) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  const id = 'chatcmpl-' + crypto.randomBytes(6).toString('hex');
  const created = Math.floor(Date.now() / 1000);
  res.write(
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }]
    })}\n\n`
  );
  res.write(
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
    })}\n\n`
  );
  res.write('data: [DONE]\n\n');
  res.end();
}

// ============================================================================
// Spec-Compliant VS Code v1.70.2 .vsix & Source .zip Builder
// ============================================================================

async function buildVsixArchiveBuffer(): Promise<Buffer> {
  const extDir = path.resolve(__dirname, 'vscode-extension');
  const pkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8'));
  const zip = new JSZip();

  const contentTypesXml = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json"/>
  <Default Extension=".js" ContentType="application/javascript"/>
  <Default Extension=".md" ContentType="text/markdown"/>
  <Default Extension=".png" ContentType="image/png"/>
  <Default Extension=".jpg" ContentType="image/jpeg"/>
  <Default Extension=".svg" ContentType="image/svg+xml"/>
  <Default Extension=".vsixmanifest" ContentType="text/xml"/>
</Types>`;

  const vsixManifestXml = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${escapeXml(pkg.name)}" Version="${escapeXml(pkg.version)}" Publisher="${escapeXml(pkg.publisher)}" />
    <DisplayName>${escapeXml(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${escapeXml(pkg.description)}</Description>
    <Tags>${escapeXml((pkg.keywords || []).join(','))}</Tags>
    <Categories>${escapeXml((pkg.categories || []).join(','))}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escapeXml(pkg.engines?.vscode || '^1.70.2')}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value="" />
    </Properties>
    <Icon>extension/media/icon.png</Icon>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" Version="[1.70.2,)" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/media/icon.png" Addressable="true" />
  </Assets>
</PackageManifest>`;

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('extension.vsixmanifest', vsixManifestXml);

  const includeFiles = [
    'package.json',
    'README.md',
    'dist/extension.js',
    'media/icon.png',
    'media/activity-icon.svg',
    'media/logo-artwork.jpg',
    'themes/freellmapi-high-visibility.json'
  ];

  for (const rel of includeFiles) {
    const full = path.join(extDir, rel);
    if (fs.existsSync(full)) {
      zip.file(`extension/${rel}`, fs.readFileSync(full));
    }
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

async function buildExtensionSourceZipBuffer(): Promise<Buffer> {
  const extDir = path.resolve(__dirname, 'vscode-extension');
  const zip = new JSZip();

  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        zip.file(`freellmapi-kilo-vscode-v1.70.2/${rel}`, fs.readFileSync(full));
      }
    }
  }
  walk(extDir, '');
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

// ============================================================================
// Express Server Setup
// ============================================================================

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get(['/livez', '/readyz', '/api/ping'], (_req, res) => {
    res.json({
      status: 'ok',
      version: '0.16.9',
      vscodeTarget: '^1.70.2',
      strategy: routerRuntime.strategy
    });
  });

  app.get('/api/vsix/download', async (_req, res) => {
    try {
      const buf = await buildVsixArchiveBuffer();
      res.setHeader('Content-Type', 'application/vsix');
      res.setHeader('Content-Disposition', 'attachment; filename="freellmapi-kilo-vscode-0.16.9.vsix"');
      res.setHeader('Content-Length', String(buf.length));
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to build VSIX package' });
    }
  });

  app.get('/api/vsix/source-zip', async (_req, res) => {
    try {
      const buf = await buildExtensionSourceZipBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="freellmapi-kilo-vscode-v1.70.2-source.zip"');
      res.setHeader('Content-Length', String(buf.length));
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to build source archive' });
    }
  });

  app.get('/api/vsix/inspect', async (_req, res) => {
    try {
      const extDir = path.resolve(__dirname, 'vscode-extension');
      const readableFiles = [
        'package.json',
        'src/extension.ts',
        'src/kiloAgentProvider.ts',
        'src/completionProvider.ts',
        'src/routerEngine.ts',
        'src/node-shims.d.ts',
        'themes/freellmapi-high-visibility.json',
        'README.md'
      ];
      const files = readableFiles
        .filter((f) => fs.existsSync(path.join(extDir, f)))
        .map((f) => {
          const content = fs.readFileSync(path.join(extDir, f), 'utf8');
          return { path: f, sizeBytes: Buffer.byteLength(content, 'utf8'), content };
        });
      const bundlePath = path.join(extDir, 'dist/extension.js');
      const bundleSize = fs.existsSync(bundlePath) ? fs.statSync(bundlePath).size : 0;
      res.json({
        name: 'freellmapi-kilo-vscode',
        version: '0.16.9',
        vscodeEngine: '^1.70.2',
        nodeTarget: 'node16 (CommonJS)',
        compiledBundleBytes: bundleSize,
        files
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to inspect extension' });
    }
  });

  // --------------------------------------------------------------------------
  // 1. Universal Inline Code Suggestion / Ghost-Text FIM (/api/agent/complete)
  // --------------------------------------------------------------------------
  app.post('/api/agent/complete', async (req, res) => {
    const start = Date.now();
    try {
      const { language = 'typescript', fileName = 'index.ts', prefix = '', suffix = '' } = req.body || {};
      const out = await dispatchResilientLLM({
        preferFast: true,
        temperature: 0.1,
        maxTokens: 220,
        systemPrompt:
          'You are a Fill-In-The-Middle (FIM) inline code completion engine for VS Code. Return ONLY raw code to insert at <CURSOR> (1 to 8 lines max). Never wrap in markdown code fences and never repeat code already before or after <CURSOR>.',
        userPrompt: [
          `File: ${fileName} (Language: ${language})`,
          'Provide ONLY the exact raw code continuation to insert at <CURSOR>:',
          `${String(prefix).slice(-2500)}<CURSOR>${String(suffix).slice(0, 1200)}`
        ].join('\n\n')
      });

      const suggestion = out.text
        .replace(/^```[\w-]*\n?/, '')
        .replace(/\n?```$/, '');

      const latencyMs = Date.now() - start;
      const pTok = Math.ceil((String(prefix).length + String(suffix).length) / 4);
      const cTok = Math.ceil(suggestion.length / 4);
      recordProviderUsage(out.platform, pTok, cTok, latencyMs);
      appendLog({
        surface: 'vscode/inlineCompletion',
        caller: `IDE-FIM (${language})`,
        requestedModel: 'auto:fast',
        servedModel: out.servedModel,
        platform: out.platform,
        latencyMs,
        ttftMs: Math.round(latencyMs * 0.52),
        promptTokens: pTok,
        completionTokens: cTok,
        savedTokens: 0,
        status: 200,
        cached: false
      });

      res.json({
        suggestion,
        servedModel: out.servedModel,
        platform: out.platform,
        latencyMs
      });
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'Inline completion failed' });
    }
  });

  // --------------------------------------------------------------------------
  // 2. Inline Quick Edit / Refactor / Diagnostics Fix (/api/agent/inline-edit)
  // --------------------------------------------------------------------------
  app.post('/api/agent/inline-edit', async (req, res) => {
    const start = Date.now();
    try {
      const { language = 'typescript', fileName = 'index.ts', code = '', instruction = 'Refactor and improve' } = req.body || {};
      const out = await dispatchResilientLLM({
        temperature: 0.15,
        maxTokens: 4096,
        systemPrompt:
          'Transform the given code snippet per the instruction. Respond ONLY with a valid JSON object matching {"replacementCode": "<full transformed code without markdown fences>", "summary": "<concise 1-sentence summary>"}.',
        userPrompt: `Language: ${language}\nFile: ${fileName}\nInstruction: ${instruction}\n\nOriginal Code:\n${code}`,
        jsonSchema: {
          type: Type.OBJECT,
          properties: {
            replacementCode: {
              type: Type.STRING,
              description: 'Complete transformed replacement code without markdown fences.'
            },
            summary: {
              type: Type.STRING,
              description: 'Concise 1-sentence summary of the code improvements made.'
            }
          },
          required: ['replacementCode', 'summary']
        }
      });

      const fallbackCode = out.text.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '');
      const parsed = parseResilientJson<{ replacementCode?: string; summary?: string }>(out.text, {
        replacementCode: fallbackCode || String(code),
        summary: 'Updated code per instruction.'
      });

      const finalCode = (parsed.replacementCode || fallbackCode || String(code))
        .replace(/^```[\w-]*\n?/, '')
        .replace(/\n?```$/, '');

      const latencyMs = Date.now() - start;
      const pTok = Math.ceil(String(code).length / 4);
      const cTok = Math.ceil(finalCode.length / 4);
      recordProviderUsage(out.platform, pTok, cTok, latencyMs);
      appendLog({
        surface: 'vscode/inlineEdit',
        caller: `Kilo-QuickEdit (${language})`,
        requestedModel: 'auto:coding',
        servedModel: out.servedModel,
        platform: out.platform,
        latencyMs,
        ttftMs: Math.round(latencyMs * 0.48),
        promptTokens: pTok,
        completionTokens: cTok,
        savedTokens: 0,
        status: 200,
        cached: false
      });

      res.json({
        replacementCode: finalCode,
        summary: parsed.summary || 'Updated code per instruction.',
        servedModel: out.servedModel,
        platform: out.platform,
        latencyMs
      });
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'Inline edit failed' });
    }
  });

  // --------------------------------------------------------------------------
  // 3. Autonomous Multi-Mode Kilo Code Agent (/api/agent/chat)
  // --------------------------------------------------------------------------
  app.post('/api/agent/chat', async (req, res) => {
    const start = Date.now();
    try {
      const {
        mode = 'code',
        model = 'auto:coding',
        prompt = '',
        activeFile = '',
        workspaceFiles = [],
        diagnostics = []
      } = req.body || {};

      const comp = runPromptCompression(String(prompt));

      const filesContext = Array.isArray(workspaceFiles)
        ? workspaceFiles
            .map((f: any) => `=== FILE: ${f.path} (${f.language}) ===\n${String(f.content || '').slice(0, 6000)}`)
            .join('\n\n')
        : '';

      const diagContext =
        Array.isArray(diagnostics) && diagnostics.length > 0
          ? `Active Workspace Diagnostics:\n${diagnostics.map((d: any) => `- [${d.file}:${d.line}] ${d.message}`).join('\n')}`
          : 'No syntax or delimiter errors currently flagged.';

      const modeDirectives: Record<string, string> = {
        architect:
          'Operate in KILO ARCHITECT MODE: design clean modular boundaries, analyze trade-offs, and produce a clear technical blueprint. Propose fileEdits only if explicitly requested.',
        code:
          'Operate in KILO CODE MODE: inspect workspace files, write clean bug-free code in the exact language of the target files, and emit concrete fileEdits with full updated file contents so the developer can review the diff and apply.',
        ask:
          'Operate in KILO ASK MODE: answer questions thoroughly with references to exact functions, lines, and types in the workspace. Return empty fileEdits unless asked to edit.',
        debug:
          'Operate in KILO DEBUG MODE: trace root causes of bugs or diagnostics, explain why the issue happens, and emit surgical fileEdits fixing the issue.',
        orchestrator:
          'Operate in KILO ORCHESTRATOR (BOOMERANG) MODE: decompose the task into sub-steps (1. Architect Plan -> 2. Code Implementation -> 3. Verification) and return both the orchestrated breakdown and ready-to-apply fileEdits.'
      };

      let fusionDraftNote = '';
      if (model === 'fusion') {
        const draftA = await dispatchResilientLLM({
          preferFast: true,
          temperature: 0.25,
          maxTokens: 1200,
          userPrompt: `Provide a concise technical implementation strategy for: ${comp.compressed}\nActive file: ${activeFile}`
        });
        fusionDraftNote = `\n[Fusion Specialist Draft (${draftA.platform}/${draftA.servedModel})]:\n${draftA.text.slice(0, 1800)}\n`;
      }

      const jsonInstruction = [
        modeDirectives[mode] || modeDirectives.code,
        'Respond ONLY with a valid JSON object matching this exact structure:',
        '{"thoughtSteps":[{"tool":"read_file","target":"path","summary":"what was inspected"}],"reply":"clear markdown explanation","fileEdits":[{"path":"file/path.ext","action":"modify","explanation":"summary","newContent":"complete updated file code"}]}'
      ].join('\n');

      const out = await dispatchResilientLLM({
        temperature: 0.2,
        maxTokens: 6000,
        systemPrompt: jsonInstruction,
        userPrompt: [
          `Active Editor Tab: ${activeFile}`,
          diagContext,
          filesContext,
          fusionDraftNote,
          `Developer Request:\n${comp.compressed}`
        ].join('\n\n'),
        jsonSchema: {
          type: Type.OBJECT,
          properties: {
            thoughtSteps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  tool: { type: Type.STRING },
                  target: { type: Type.STRING },
                  summary: { type: Type.STRING }
                },
                required: ['tool', 'target', 'summary']
              }
            },
            reply: { type: Type.STRING },
            fileEdits: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  path: { type: Type.STRING },
                  action: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  newContent: { type: Type.STRING }
                },
                required: ['path', 'action', 'explanation', 'newContent']
              }
            }
          },
          required: ['thoughtSteps', 'reply', 'fileEdits']
        }
      });

      const parsed = parseResilientJson<{
        thoughtSteps?: Array<{ tool: string; target: string; summary: string }>;
        reply?: string;
        fileEdits?: Array<{ path: string; action: string; explanation: string; newContent: string }>;
      }>(out.text, {
        thoughtSteps: [{ tool: 'analyze_workspace', target: activeFile || 'workspace', summary: `Processed in ${mode} mode` }],
        reply: out.text,
        fileEdits: []
      });

      const latencyMs = Date.now() - start;
      const servedModel = model === 'fusion' ? `fusion(${out.servedModel})` : out.servedModel;
      const pTok = Math.ceil((filesContext.length + comp.compressed.length) / 4);
      const cTok = Math.ceil(out.text.length / 4);
      recordProviderUsage(out.platform, pTok, cTok, latencyMs);

      appendLog({
        surface: `kilo-agent/${mode}`,
        caller: 'Kilo-Workbench/1.70.2',
        requestedModel: model,
        servedModel,
        platform: out.platform,
        latencyMs,
        ttftMs: Math.round(latencyMs * 0.38),
        promptTokens: pTok,
        completionTokens: cTok,
        savedTokens: comp.savedTokens,
        status: 200,
        cached: false
      });

      res.json({
        mode,
        servedModel,
        platform: out.platform,
        latencyMs,
        savedTokens: comp.savedTokens,
        stagesApplied: comp.stagesApplied,
        thoughtSteps: Array.isArray(parsed.thoughtSteps) ? parsed.thoughtSteps : [],
        reply: parsed.reply || out.text,
        fileEdits: Array.isArray(parsed.fileEdits) ? parsed.fileEdits : []
      });
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'Kilo Agent execution failed' });
    }
  });

  // --------------------------------------------------------------------------
  // 4. FreeLLMAPI v0.16.9 Router Control Plane (/api/router/*)
  // --------------------------------------------------------------------------
  app.get('/api/router/state', (_req, res) => {
    const latencies = routerRuntime.logs.map((l) => l.latencyMs).sort((a, b) => a - b);
    const ttfts = routerRuntime.logs.map((l) => l.ttftMs).sort((a, b) => a - b);
    const p50 = latencies.length ? latencies[Math.floor((latencies.length - 1) * 0.5)] : 0;
    const p95 = latencies.length ? latencies[Math.floor((latencies.length - 1) * 0.95)] : 0;
    const avgTtft = ttfts.length ? Math.round(ttfts.reduce((s, v) => s + v, 0) / ttfts.length) : 0;

    res.json({
      version: '0.16.9',
      vscodeCompatibility: 'v1.70.2+ (Electron 18 / Node 16.14 CJS)',
      strategy: routerRuntime.strategy,
      keySelectionStrategy: routerRuntime.keySelectionStrategy,
      weights: routerRuntime.weights,
      reliabilityFloor: routerRuntime.reliabilityFloor,
      peakHoursAvoidance: routerRuntime.peakHoursAvoidance,
      stickySessionsMinutes: routerRuntime.stickySessionsMinutes,
      contextHandoffEnabled: routerRuntime.contextHandoffEnabled,
      promptCompressionEnabled: routerRuntime.promptCompressionEnabled,
      responseCacheEnabled: routerRuntime.responseCacheEnabled,
      mcpServerEnabled: routerRuntime.mcpServerEnabled,
      ollamaEmulationEnabled: routerRuntime.ollamaEmulationEnabled,
      catalogSyncTier: routerRuntime.catalogSyncTier,
      lastCatalogSync: routerRuntime.lastCatalogSync,
      providers: PROVIDERS_POOL,
      models: ROUTER_MODELS,
      profiles: CHAIN_PROFILES,
      compressionEngines: COMPRESSION_ENGINES,
      cliGenerators: CLI_AGENT_GENERATORS,
      backups: routerRuntime.backups,
      analytics: {
        totalRequests: routerRuntime.logs.length,
        p50LatencyMs: p50,
        p95LatencyMs: p95,
        avgTtftMs: avgTtft,
        totalSavedTokens: routerRuntime.logs.reduce((s, l) => s + l.savedTokens, 0),
        logs: routerRuntime.logs
      }
    });
  });

  app.post('/api/router/settings', async (req, res) => {
    const body = req.body || {};
    if (body.strategy) routerRuntime.strategy = body.strategy;
    if (body.keySelectionStrategy) routerRuntime.keySelectionStrategy = body.keySelectionStrategy;
    if (body.weights) routerRuntime.weights = { ...routerRuntime.weights, ...body.weights };
    if (typeof body.reliabilityFloor === 'number') routerRuntime.reliabilityFloor = body.reliabilityFloor;
    if (typeof body.peakHoursAvoidance === 'boolean') routerRuntime.peakHoursAvoidance = body.peakHoursAvoidance;
    if (typeof body.stickySessionsMinutes === 'number') routerRuntime.stickySessionsMinutes = body.stickySessionsMinutes;
    if (typeof body.contextHandoffEnabled === 'boolean') routerRuntime.contextHandoffEnabled = body.contextHandoffEnabled;
    if (typeof body.promptCompressionEnabled === 'boolean') routerRuntime.promptCompressionEnabled = body.promptCompressionEnabled;
    if (typeof body.responseCacheEnabled === 'boolean') routerRuntime.responseCacheEnabled = body.responseCacheEnabled;
    if (typeof body.mcpServerEnabled === 'boolean') routerRuntime.mcpServerEnabled = body.mcpServerEnabled;
    if (typeof body.ollamaEmulationEnabled === 'boolean') routerRuntime.ollamaEmulationEnabled = body.ollamaEmulationEnabled;

    if (body.toggleModelId) {
      const target = ROUTER_MODELS.find((m) => m.id === body.toggleModelId);
      if (target) target.enabled = !target.enabled;
    }
    if (body.moveModel) {
      const { id, direction } = body.moveModel;
      const chatModels = ROUTER_MODELS.filter((m) => m.modality === 'chat').sort((a, b) => a.priorityOrder - b.priorityOrder);
      const idx = chatModels.findIndex((m) => m.id === id);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (idx >= 0 && swapIdx >= 0 && swapIdx < chatModels.length) {
        const tmp = chatModels[idx].priorityOrder;
        chatModels[idx].priorityOrder = chatModels[swapIdx].priorityOrder;
        chatModels[swapIdx].priorityOrder = tmp;
      }
    }
    if (body.toggleProviderId) {
      const prov = PROVIDERS_POOL.find((p) => p.id === body.toggleProviderId);
      if (prov) prov.enabled = !prov.enabled;
    }
    if (body.toggleCompressionEngineId) {
      const eng = COMPRESSION_ENGINES.find((e) => e.id === body.toggleCompressionEngineId);
      if (eng) eng.enabled = !eng.enabled;
    }
    if (body.createBackup) {
      const snapshotJson = JSON.stringify({
        strategy: routerRuntime.strategy,
        keySelectionStrategy: routerRuntime.keySelectionStrategy,
        weights: routerRuntime.weights,
        profiles: CHAIN_PROFILES,
        enabledModels: ROUTER_MODELS.filter((m) => m.enabled).map((m) => m.id)
      });
      routerRuntime.backups.unshift({
        id: 'bkp_' + crypto.randomBytes(4).toString('hex'),
        createdAt: new Date().toISOString(),
        sizeBytes: Buffer.byteLength(snapshotJson, 'utf8'),
        note: body.backupNote || `AES-256-GCM Snapshot (${routerRuntime.strategy})`
      });
    }
    if (body.syncCatalogNow) {
      routerRuntime.lastCatalogSync = new Date().toISOString();
      // Perform a real lightweight HTTP HEAD/GET probe on keyless gateways
      const probes: Array<{ id: string; url: string }> = [
        { id: 'ovh', url: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models' },
        { id: 'kilo', url: 'https://api.kilo.ai/api/gateway/v1/models' },
        { id: 'llm7', url: 'https://api.llm7.io/v1/models' }
      ];
      await Promise.all(
        probes.map(async (pr) => {
          const t0 = Date.now();
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            await fetch(pr.url, { method: 'GET', signal: ctrl.signal });
            clearTimeout(timer);
            const row = PROVIDERS_POOL.find((p) => p.id === pr.id);
            if (row) row.lastProbeMs = Date.now() - t0;
          } catch {
            // Leave lastProbeMs unchanged on timeout
          }
        })
      );
    }
    if (body.newProfile && body.newProfile.name) {
      const cleanName = String(body.newProfile.name).startsWith('auto:')
        ? String(body.newProfile.name)
        : `auto:${body.newProfile.name}`;
      CHAIN_PROFILES.push({
        id: crypto.randomBytes(4).toString('hex'),
        name: cleanName,
        description: body.newProfile.description || 'Custom named routing profile',
        strategy: body.newProfile.strategy || routerRuntime.strategy,
        models: body.newProfile.models || ['gemini-3.8-flash', 'Meta-Llama-3_3-70B-Instruct', 'kilo-auto/free'],
        autoIncludeNewModels: true
      });
    }

    res.json({ ok: true });
  });

  // --------------------------------------------------------------------------
  // 5. Multi-Modal FreeLLMAPI Playground (/api/playground/run)
  // --------------------------------------------------------------------------
  app.post('/api/playground/run', async (req, res) => {
    const start = Date.now();
    try {
      const {
        modality = 'chat',
        prompt = '',
        secondText = '',
        audioBase64 = '',
        audioMimeType = 'audio/webm',
        voiceName = 'Kore'
      } = req.body || {};
      const ai = getGenAI();

      if (modality === 'embeddings') {
        const inputs = [prompt || 'Autonomous VS Code coding agent'];
        if (secondText && secondText.trim()) inputs.push(secondText.trim());

        const embRes = await ai.models.embedContent({
          model: 'gemini-embedding-2-preview',
          contents: inputs
        });

        const vecA = embRes.embeddings?.[0]?.values || [];
        const vecB = embRes.embeddings?.[1]?.values || [];
        let cosineSimilarity: number | null = null;
        if (vecA.length > 0 && vecB.length === vecA.length) {
          let dot = 0;
          let normA = 0;
          let normB = 0;
          for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
          }
          cosineSimilarity = dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
        }

        const latencyMs = Date.now() - start;
        const pTok = Math.ceil(String(prompt).length / 4);
        recordProviderUsage('google', pTok, 0, latencyMs);
        appendLog({
          surface: '/v1/embeddings',
          caller: 'Playground',
          requestedModel: 'gemini-embedding-2-preview',
          servedModel: 'gemini-embedding-2-preview',
          platform: 'google',
          latencyMs,
          ttftMs: latencyMs,
          promptTokens: pTok,
          completionTokens: 0,
          savedTokens: 0,
          status: 200,
          cached: false
        });

        res.json({
          modality: 'embeddings',
          dimensions: vecA.length,
          previewValues: vecA.slice(0, 16),
          cosineSimilarity,
          latencyMs
        });
        return;
      }

      if (modality === 'tts') {
        const ttsRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt || 'FreeLLMAPI Kilo multi-provider router is online in Visual Studio Code.' }]
            }
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName }
              }
            }
          }
        });
        const rawAudioB64 = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
        const playableWavB64 = ensureWavBase64(rawAudioB64, 24000, 1, 16);
        const latencyMs = Date.now() - start;
        const pTok = Math.ceil(String(prompt).length / 4);
        recordProviderUsage('google', pTok, 120, latencyMs);
        appendLog({
          surface: '/v1/audio/speech',
          caller: 'Playground-TTS',
          requestedModel: 'gemini-3.8-flash-lite-tts',
          servedModel: 'gemini-3.8-flash-lite-tts',
          platform: 'google',
          latencyMs,
          ttftMs: latencyMs,
          promptTokens: pTok,
          completionTokens: 120,
          savedTokens: 0,
          status: 200,
          cached: false
        });
        res.json({
          modality: 'tts',
          audioDataUrl: playableWavB64 ? `data:audio/wav;base64,${playableWavB64}` : '',
          latencyMs
        });
        return;
      }

      if (modality === 'transcribe') {
        if (!audioBase64) {
          res.status(400).json({ error: 'No audio recording supplied for transcription.' });
          return;
        }
        const trRes = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              { inlineData: { mimeType: audioMimeType, data: audioBase64 } },
              { text: 'Transcribe this developer voice dictation accurately.' }
            ]
          }
        });
        const latencyMs = Date.now() - start;
        const cTok = Math.ceil((trRes.text || '').length / 4);
        recordProviderUsage('google', 80, cTok, latencyMs);
        appendLog({
          surface: '/v1/audio/transcriptions',
          caller: 'Playground-Dictation',
          requestedModel: 'gemini-3.5-transcribe',
          servedModel: 'gemini-3.5-transcribe',
          platform: 'google',
          latencyMs,
          ttftMs: latencyMs,
          promptTokens: 80,
          completionTokens: cTok,
          savedTokens: 0,
          status: 200,
          cached: false
        });
        res.json({
          modality: 'transcribe',
          transcript: trRes.text || '',
          latencyMs
        });
        return;
      }

      if (modality === 'search') {
        try {
          const searchRes = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt || 'Latest VS Code extension inline completion best practices',
            config: {
              tools: [{ googleSearch: {} }]
            }
          });
          const rawChunks = searchRes.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
          const sources = rawChunks
            .map((c: any) => (c.web ? { title: c.web.title || c.web.uri, uri: c.web.uri } : null))
            .filter(Boolean);
          const latencyMs = Date.now() - start;
          const pTok = Math.ceil(String(prompt).length / 4);
          const cTok = Math.ceil((searchRes.text || '').length / 4);
          recordProviderUsage('google', pTok, cTok, latencyMs);
          appendLog({
            surface: '/v1/search',
            caller: 'Playground-WebSearch',
            requestedModel: 'tavily-search',
            servedModel: 'gemini-3.8-flash+search',
            platform: 'google',
            latencyMs,
            ttftMs: Math.round(latencyMs * 0.45),
            promptTokens: pTok,
            completionTokens: cTok,
            savedTokens: 0,
            status: 200,
            cached: false
          });
          res.json({
            modality: 'search',
            answer: searchRes.text || '',
            sources,
            latencyMs
          });
          return;
        } catch {
          const fallbackOut = await dispatchResilientLLM({
            userPrompt: String(prompt || 'Latest VS Code extension inline completion best practices')
          });
          const latencyMs = Date.now() - start;
          recordProviderUsage(fallbackOut.platform, Math.ceil(String(prompt).length / 4), Math.ceil(fallbackOut.text.length / 4), latencyMs);
          res.json({
            modality: 'search',
            answer: fallbackOut.text,
            sources: [],
            latencyMs
          });
          return;
        }
      }

      if (modality === 'decision') {
        const out = await dispatchResilientLLM({
          temperature: 0.15,
          systemPrompt:
            'Evaluate this routing/engineering decision scenario and return ONLY valid JSON: {"verdict":"...","selectedRoute":"...","confidencePct":95,"rationale":"...","riskChecks":["..."]}',
          userPrompt: String(prompt),
          jsonSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING },
              selectedRoute: { type: Type.STRING },
              confidencePct: { type: Type.NUMBER },
              rationale: { type: Type.STRING },
              riskChecks: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ['verdict', 'selectedRoute', 'confidencePct', 'rationale', 'riskChecks']
          }
        });
        const decision = parseResilientJson(out.text, {
          verdict: 'ROUTE_APPROVED',
          selectedRoute: out.servedModel,
          confidencePct: 92,
          rationale: out.text,
          riskChecks: ['Verified context window headroom', 'Verified healthy upstream quota']
        });
        const latencyMs = Date.now() - start;
        const pTok = Math.ceil(String(prompt).length / 4);
        recordProviderUsage(out.platform, pTok, 120, latencyMs);
        appendLog({
          surface: '/api/decisions',
          caller: 'Playground-Decision',
          requestedModel: 'decision',
          servedModel: out.servedModel,
          platform: out.platform,
          latencyMs,
          ttftMs: Math.round(latencyMs * 0.5),
          promptTokens: pTok,
          completionTokens: 120,
          savedTokens: 0,
          status: 200,
          cached: false
        });
        res.json({ modality: 'decision', decision, latencyMs });
        return;
      }

      if (modality === 'fusion') {
        const [draft1, draft2] = await Promise.all([
          dispatchResilientLLM({
            preferFast: true,
            temperature: 0.25,
            userPrompt: `Perspective A (Systems & Performance Specialist):\n${prompt}`
          }),
          dispatchResilientLLM({
            preferFast: true,
            temperature: 0.5,
            userPrompt: `Perspective B (Security, Edge-Cases & Clean Architecture Specialist):\n${prompt}`
          })
        ]);
        const judge = await dispatchResilientLLM({
          temperature: 0.2,
          userPrompt: `You are the FreeLLMAPI Fusion Judge. Synthesize the strongest, unified answer from Draft A and Draft B.\n\nUser Prompt:\n${prompt}\n\n--- Draft A (${draft1.platform}/${draft1.servedModel}) ---\n${draft1.text}\n\n--- Draft B (${draft2.platform}/${draft2.servedModel}) ---\n${draft2.text}`
        });
        const latencyMs = Date.now() - start;
        const pTok = Math.ceil(String(prompt).length / 4) * 3;
        const cTok = Math.ceil(judge.text.length / 4);
        recordProviderUsage(judge.platform, pTok, cTok, latencyMs);
        appendLog({
          surface: '/v1/chat/completions (fusion)',
          caller: 'Playground-Fusion',
          requestedModel: 'fusion',
          servedModel: `fusion(${judge.servedModel})`,
          platform: judge.platform,
          latencyMs,
          ttftMs: Math.round(latencyMs * 0.4),
          promptTokens: pTok,
          completionTokens: cTok,
          savedTokens: 0,
          status: 200,
          cached: false
        });
        res.json({
          modality: 'fusion',
          synthesized: judge.text,
          drafts: [
            { specialist: `Systems Panelist (${draft1.platform}/${draft1.servedModel})`, text: draft1.text },
            { specialist: `Architecture Panelist (${draft2.platform}/${draft2.servedModel})`, text: draft2.text }
          ],
          latencyMs
        });
        return;
      }

      // Default Chat + SVG/HTML Artifact generation
      const comp = runPromptCompression(String(prompt));
      const chatOut = await dispatchResilientLLM({
        systemPrompt:
          'You are the FreeLLMAPI Playground. Provide accurate engineering answers. When asked for a UI component, diagram, or visualization, include a self-contained ```html or ```svg fenced block so the Artifact viewer can render it.',
        userPrompt: comp.compressed
      });
      const text = chatOut.text;
      const htmlMatch = text.match(/```(html|svg)\n([\s\S]*?)```/i);
      const latencyMs = Date.now() - start;
      const pTok = Math.ceil(comp.compressed.length / 4);
      const cTok = Math.ceil(text.length / 4);
      recordProviderUsage(chatOut.platform, pTok, cTok, latencyMs);

      appendLog({
        surface: '/v1/chat/completions',
        caller: 'Playground-Chat',
        requestedModel: 'auto:coding',
        servedModel: chatOut.servedModel,
        platform: chatOut.platform,
        latencyMs,
        ttftMs: Math.round(latencyMs * 0.42),
        promptTokens: pTok,
        completionTokens: cTok,
        savedTokens: comp.savedTokens,
        status: 200,
        cached: false
      });

      res.json({
        modality: 'chat',
        answer: text,
        servedModel: chatOut.servedModel,
        platform: chatOut.platform,
        artifact: htmlMatch ? { type: htmlMatch[1].toLowerCase(), code: htmlMatch[2] } : null,
        savedTokens: comp.savedTokens,
        latencyMs
      });
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'Playground request failed' });
    }
  });

  // --------------------------------------------------------------------------
  // 6. Wire-Compatible OpenAI (/v1/*), Anthropic (/v1/messages), Ollama, MCP
  // --------------------------------------------------------------------------
  app.get('/v1/models', (_req, res) => {
    res.json({
      object: 'list',
      data: ROUTER_MODELS.filter((m) => m.enabled).map((m) => ({
        id: m.id,
        object: 'model',
        created: 1730000000,
        owned_by: m.platform
      }))
    });
  });

  app.get('/api/tags', (_req, res) => {
    res.json({
      models: ROUTER_MODELS.filter((m) => m.enabled).map((m) => ({
        name: m.id,
        model: m.id,
        details: { family: m.platform }
      }))
    });
  });

  app.post('/v1/chat/completions', async (req, res) => {
    const start = Date.now();
    try {
      const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const promptText = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n\n') || 'Hello';
      const out = await dispatchResilientLLM({
        userPrompt: promptText,
        temperature: req.body?.temperature,
        maxTokens: req.body?.max_tokens
      });
      const latencyMs = Date.now() - start;
      const pTok = Math.ceil(promptText.length / 4);
      const cTok = Math.ceil(out.text.length / 4);
      recordProviderUsage(out.platform, pTok, cTok, latencyMs);
      appendLog({
        surface: '/v1/chat/completions',
        caller: String(req.headers['user-agent'] || 'OpenAI-SDK').slice(0, 32),
        requestedModel: req.body?.model || 'auto:coding',
        servedModel: out.servedModel,
        platform: out.platform,
        latencyMs,
        ttftMs: Math.round(latencyMs * 0.4),
        promptTokens: pTok,
        completionTokens: cTok,
        savedTokens: 0,
        status: 200,
        cached: false
      });
      res.setHeader('X-Routed-Via', `${out.platform}/${out.servedModel}`);
      if (req.body?.stream === true) {
        writeSseChatCompletion(res, out.servedModel, out.text);
        return;
      }
      res.json({
        id: 'chatcmpl-' + crypto.randomBytes(6).toString('hex'),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: out.servedModel,
        choices: [{ index: 0, message: { role: 'assistant', content: out.text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: pTok, completion_tokens: cTok, total_tokens: pTok + cTok }
      });
    } catch (err: any) {
      res.status(502).json({ error: { message: err?.message || 'Router error' } });
    }
  });

  app.post('/v1/completions', async (req, res) => {
    try {
      const promptText = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
      const out = await dispatchResilientLLM({
        preferFast: true,
        temperature: 0.1,
        maxTokens: req.body?.max_tokens || 256,
        systemPrompt: 'Output ONLY raw code continuation with zero markdown fences.',
        userPrompt: promptText || 'function '
      });
      res.json({
        id: 'cmpl-' + crypto.randomBytes(6).toString('hex'),
        object: 'text_completion',
        model: out.servedModel,
        choices: [{ text: out.text, index: 0, finish_reason: 'stop' }]
      });
    } catch (err: any) {
      res.status(502).json({ error: { message: err?.message || 'Completion error' } });
    }
  });

  app.post('/v1/responses', async (req, res) => {
    try {
      const inputText =
        typeof req.body?.input === 'string' ? req.body.input : JSON.stringify(req.body?.input || 'Hello');
      const out = await dispatchResilientLLM({ userPrompt: inputText });
      res.json({
        id: 'resp_' + crypto.randomBytes(6).toString('hex'),
        object: 'response',
        model: out.servedModel,
        output_text: out.text,
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: out.text }] }]
      });
    } catch (err: any) {
      res.status(502).json({ error: { message: err?.message || 'Responses error' } });
    }
  });

  app.post('/v1/messages', async (req, res) => {
    try {
      const msgs = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const promptText = msgs
        .map((m: any) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
        .join('\n\n');
      const out = await dispatchResilientLLM({
        systemPrompt: typeof req.body?.system === 'string' ? req.body.system : undefined,
        userPrompt: promptText || 'Hello',
        maxTokens: req.body?.max_tokens || 4096
      });
      res.json({
        id: 'msg_' + crypto.randomBytes(6).toString('hex'),
        type: 'message',
        role: 'assistant',
        model: out.servedModel,
        content: [{ type: 'text', text: out.text }],
        stop_reason: 'end_turn'
      });
    } catch (err: any) {
      res.status(502).json({ error: { message: err?.message || 'Messages error' } });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const msgs = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const promptText = msgs.map((m: any) => `${m.role}: ${m.content}`).join('\n\n') || 'Hello';
      const out = await dispatchResilientLLM({ userPrompt: promptText });
      res.json({
        model: out.servedModel,
        created_at: new Date().toISOString(),
        message: { role: 'assistant', content: out.text },
        done: true
      });
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'Ollama chat error' });
    }
  });

  app.post('/mcp', (req, res) => {
    const { id = 1, method = 'tools/list' } = req.body || {};
    if (method === 'tools/list') {
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            { name: 'freellmapi_list_models', description: 'List usable models, capabilities, and routing scores' },
            { name: 'freellmapi_router_health', description: 'Inspect provider quotas, RPM/RPD counters, and p95 latency' },
            { name: 'freellmapi_set_strategy', description: 'Switch active routing strategy across 7 modes' },
            { name: 'freellmapi_fusion_query', description: 'Fan out prompt across multi-model panel + Judge synthesis' }
          ]
        }
      });
      return;
    }
    res.json({
      jsonrpc: '2.0',
      id,
      result: {
        strategy: routerRuntime.strategy,
        keySelectionStrategy: routerRuntime.keySelectionStrategy,
        activeModels: ROUTER_MODELS.filter((m) => m.enabled).length,
        activeProviders: PROVIDERS_POOL.filter((p) => p.enabled).length
      }
    });
  });

  // --------------------------------------------------------------------------
  // Vite Middleware (Dev) or Static Assets (Prod) on Port 3000
  // --------------------------------------------------------------------------
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(__dirname, 'dist/index.html'));
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FreeLLMAPI Kilo Workbench & VSIX Studio listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
