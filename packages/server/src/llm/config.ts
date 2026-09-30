/**
 * Which language model the server talks to (TODO 3.3, ADR-0032):
 * `config/llm.json`, checked with zod, plus the API key from the server's
 * environment. Keys never live in the config file (it is committed) and
 * never reach the browser (ADR-0021 §4): the loader refuses a key-like
 * field in the file, and `describeLlm` never includes the key.
 *
 * A missing key doesn't stop the server; the LLM features report that they
 * aren't ready and why, so the rest (API, MCP) keeps working.
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import * as z from 'zod';
import { fromRoot } from '../paths';

export const LLM_PROVIDERS = [
  'ollama',
  'anthropic',
  'openai_compatible',
] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/** The config file, relative to the repository root (where
 *  `loadLlmConfig` reads it from, whatever the working directory). */
export const DEFAULT_LLM_CONFIG = 'config/llm.json';

/** Where each provider is by default, and the environment variable its key
 *  comes from (if it needs one). */
export const PROVIDER_DEFAULTS: Record<
  LlmProvider,
  { baseUrl: string; keyVar?: string; keyRequired: boolean }
> = {
  ollama: { baseUrl: 'http://localhost:11434', keyRequired: false },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    keyVar: 'ANTHROPIC_API_KEY',
    keyRequired: true,
  },
  // LM Studio, llama.cpp's server, vLLM, OpenRouter...: the key is optional,
  // since local servers usually don't check one.
  openai_compatible: {
    baseUrl: 'http://localhost:1234/v1',
    keyVar: 'OPENAI_API_KEY',
    keyRequired: false,
  },
};

const HttpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//.test(u), { message: 'an http(s) URL' });

export const LlmConfigFile = z
  .object({
    provider: z.enum(LLM_PROVIDERS),
    model: z.string().min(1).max(200),
    baseUrl: HttpUrl.optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(1).max(64_000).optional(),
    timeoutMs: z.number().int().min(1_000).max(600_000).optional(),
  })
  .strict();
export type LlmConfigFile = z.infer<typeof LlmConfigFile>;

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  baseUrl: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs: number;
  /** From the environment; never logged or returned. */
  apiKey?: string;
  /** The variable the key comes from, if the provider takes one. */
  keyVar?: string;
  /** Why the provider can't be used yet, if it can't. */
  notReady?: string;
}

export class LlmConfigError extends Error {}

const SECRET_FIELD = /key|token|secret|password/i;

/** Parse and resolve a config object against an environment. Pure. */
export function resolveLlmConfig(
  raw: unknown,
  env: Record<string, string | undefined>,
  where = DEFAULT_LLM_CONFIG,
): LlmConfig {
  if (raw && typeof raw === 'object') {
    const secret = Object.keys(raw).find((k) => SECRET_FIELD.test(k));
    if (secret)
      throw new LlmConfigError(
        `${where}: "${secret}" looks like a secret; API keys go in .env (server side), never in this committed file`,
      );
  }
  const parsed = LlmConfigFile.safeParse(raw);
  if (!parsed.success)
    throw new LlmConfigError(
      `${where}: ${parsed.error.issues
        .map((i) => `${i.path.join('.') || 'file'}: ${i.message}`)
        .join('; ')}`,
    );
  const c = parsed.data;
  const d = PROVIDER_DEFAULTS[c.provider];
  const apiKey = d.keyVar ? env[d.keyVar]?.trim() || undefined : undefined;
  return {
    provider: c.provider,
    model: c.model,
    baseUrl: (c.baseUrl ?? d.baseUrl).replace(/\/+$/, ''),
    ...(c.temperature !== undefined && { temperature: c.temperature }),
    ...(c.maxOutputTokens !== undefined && {
      maxOutputTokens: c.maxOutputTokens,
    }),
    timeoutMs: c.timeoutMs ?? 120_000,
    ...(apiKey && { apiKey }),
    ...(d.keyVar && { keyVar: d.keyVar }),
    ...(d.keyRequired &&
      !apiKey && {
        notReady: `${d.keyVar} is not set; add it to .env (server side)`,
      }),
  };
}

/** Read `config/llm.json` and resolve it against `process.env`. */
export function loadLlmConfig(path?: string): LlmConfig {
  // Named as written in messages; read from the repository root by default.
  const where = path ?? DEFAULT_LLM_CONFIG;
  let raw: unknown;
  try {
    raw = JSON.parse(
      readFileSync(path ?? fromRoot(DEFAULT_LLM_CONFIG), 'utf8'),
    );
  } catch (e) {
    throw new LlmConfigError(`${where}: ${(e as Error).message}`);
  }
  return resolveLlmConfig(raw, process.env, where);
}

/** The config as it may be shown or returned: no key, only whether one is
 *  set. */
export function describeLlm(c: LlmConfig) {
  return {
    provider: c.provider,
    model: c.model,
    baseUrl: c.baseUrl,
    apiKey: !c.keyVar ? 'not used' : c.apiKey ? 'set' : 'not set',
    ready: !c.notReady,
    ...(c.notReady && { notReady: c.notReady }),
  };
}
