import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, SETTINGS_DIR, config } from './config';
import { parseDoc, stringifyDoc } from './frontmatter';
import { commit, type Author } from './git';
import { nowIso, writeLock } from './util';

export type Provider = 'local' | 'cloud';
export const PROVIDERS: Provider[] = ['local', 'cloud'];

export interface LlmSettings {
  provider: Provider;
  local_model: string;
  cloud_model: string;
  updated?: string;
  updated_by?: string;
}

export const LLM_SETTINGS_FILE = path.join(SETTINGS_DIR, 'llm.md');

const defaults = (): LlmSettings => ({ provider: 'local', local_model: config.ollamaModel, cloud_model: config.ollamaCloudModel });

/** Read on every extraction, so a change in the admin panel applies to the next job without a restart. */
export async function getLlmSettings(): Promise<LlmSettings> {
  try {
    const { data } = parseDoc(await fs.readFile(LLM_SETTINGS_FILE, 'utf8'));
    const d = defaults();
    return {
      provider: PROVIDERS.includes(data.provider) ? data.provider : d.provider,
      local_model: String(data.local_model || d.local_model),
      cloud_model: String(data.cloud_model || d.cloud_model),
      updated: data.updated,
      updated_by: data.updated_by,
    };
  } catch {
    return defaults();
  }
}

export async function saveLlmSettings(input: Partial<LlmSettings>, author: Author): Promise<LlmSettings> {
  const current = await getLlmSettings();
  const next: LlmSettings = {
    provider: input.provider ?? current.provider,
    local_model: (input.local_model ?? current.local_model).trim(),
    cloud_model: (input.cloud_model ?? current.cloud_model).trim(),
    updated: nowIso(),
    updated_by: author.email,
  };
  if (!PROVIDERS.includes(next.provider)) throw new Error('Unknown provider');
  if (!next.local_model || !next.cloud_model) throw new Error('Model names cannot be empty');
  if (next.provider === 'cloud' && !config.ollamaApiKey) throw new Error('OLLAMA_API_KEY is not set in .env.local');
  return writeLock().run(async () => {
    await fs.mkdir(SETTINGS_DIR, { recursive: true });
    await fs.writeFile(
      LLM_SETTINGS_FILE,
      stringifyDoc(
        next,
        `# LLM provider\n\nUsed by document ingestion. Managed from **Admin → LLM provider**.\n\n- **local**: Ollama at \`${config.ollamaUrl}\`\n- **cloud**: Ollama Cloud at \`${config.ollamaCloudUrl}\` (documents are sent to Ollama's servers)\n`,
      ),
    );
    const changed = next.provider !== current.provider ? `switch to ${next.provider}` : 'update models';
    await commit([path.relative(DATA_DIR, LLM_SETTINGS_FILE)], `settings: LLM ${changed} (${next.provider === 'cloud' ? next.cloud_model : next.local_model})`, author);
    return next;
  });
}

export interface Endpoint {
  provider: Provider;
  url: string;
  model: string;
  headers: Record<string, string>;
  label: string;
}

export function endpointFor(provider: Provider, model: string): Endpoint {
  if (provider === 'cloud') {
    if (!config.ollamaApiKey) throw new Error('Ollama Cloud is selected but OLLAMA_API_KEY is not set');
    return {
      provider,
      url: config.ollamaCloudUrl,
      model,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.ollamaApiKey}` },
      label: `Ollama Cloud · ${model}`,
    };
  }
  return { provider, url: config.ollamaUrl, model, headers: { 'content-type': 'application/json' }, label: `Local Ollama · ${model}` };
}

export async function activeEndpoint(): Promise<Endpoint> {
  const s = await getLlmSettings();
  return endpointFor(s.provider, s.provider === 'cloud' ? s.cloud_model : s.local_model);
}

export async function listModels(provider: Provider): Promise<{ ok: boolean; models: string[]; error?: string }> {
  if (provider === 'cloud' && !config.ollamaApiKey) return { ok: false, models: [], error: 'OLLAMA_API_KEY is not set' };
  const ep = endpointFor(provider, '');
  try {
    const res = await fetch(`${ep.url}/api/tags`, { headers: ep.headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}` };
    const json = await res.json();
    const models = (json.models || []).map((m: any) => String(m.name || m.model)).filter(Boolean).sort();
    return { ok: true, models };
  } catch (e) {
    return { ok: false, models: [], error: provider === 'local' ? `Not reachable at ${ep.url}` : (e as Error).message };
  }
}
