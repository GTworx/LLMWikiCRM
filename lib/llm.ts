import fs from 'node:fs/promises';
import path from 'node:path';
import { PROMPTS_DIR, config } from './config';
import { activeEndpoint, type Endpoint } from './llm-settings';
import { ACCOUNT_TYPES, CONTACT_ROLES, INTERACTION_KINDS, SENTIMENTS, STAGES } from './schema';

export const PROMPT_FILE = path.join(PROMPTS_DIR, 'extraction.md');

export const DEFAULT_PROMPT = `You are the extraction engine of a CRM whose records are markdown wiki pages.
Our company is "{{company}}". Today is {{today}}.

Read the incoming document and extract structured CRM data about the CUSTOMER organisation
(never about {{company}} itself or its employees — they are the sales team).

Entity resolution rules:
- Existing accounts are listed below as "slug | name | domain | known contacts".
- If the document is about one of them, put its exact slug in account.match_slug. Otherwise use "".
- Prefer matching on email domain, then company name, then contact names.
- The folder hint (if any) is where the file was dropped and is usually the customer name.
- For deals, reuse an existing deal slug in match_slug when the document is about that deal.

Extraction rules:
- Only state facts present in the document. Use "" for unknown strings and 0 for unknown numbers.
- Dates as YYYY-MM-DD. Money as plain numbers (no symbols); currency as an ISO code.
- action_items: concrete follow-ups with an owner/due date when stated (resolve "Friday" etc. relative to the document date).
- account.type: "customer" only if they already pay us; someone evaluating us is a "prospect"; first contact is a "lead".
- account.arr: only recurring revenue they ALREADY pay us (signed/renewed). Potential deal value goes on the deal, not on arr.
- account.summary: 2-4 sentence executive summary of the relationship so far, incorporating the existing summary if given.
- account.next_best_action: the single most useful next step for the sales rep.
- interaction.summary: concise markdown summary; interaction.key_points: short bullet strings.

Existing accounts:
{{accounts}}

Folder hint: {{hint}}
File name: {{filename}}
`;

export async function loadPrompt(): Promise<string> {
  try {
    return await fs.readFile(PROMPT_FILE, 'utf8');
  } catch {
    return DEFAULT_PROMPT;
  }
}

const str = { type: 'string' };
const num = { type: 'number' };
const strs = { type: 'array', items: str };
const enumOf = (v: readonly string[]) => ({ type: 'string', enum: [...v, ''] });
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties) });

export const EXTRACTION_SCHEMA = obj({
  account: obj({
    match_slug: str,
    name: str,
    type: enumOf(ACCOUNT_TYPES),
    tier: str,
    industry: str,
    domain: str,
    arr: num,
    currency: str,
    pipeline_stage: enumOf(STAGES),
    tags: strs,
    summary: str,
    next_best_action: str,
  }),
  contacts: { type: 'array', items: obj({ name: str, email: str, phone: str, title: str, influence: enumOf(CONTACT_ROLES) }) },
  deals: {
    type: 'array',
    items: obj({ match_slug: str, name: str, stage: enumOf(STAGES), value: num, currency: str, probability: num, close_date: str }),
  },
  interaction: obj({
    kind: enumOf(INTERACTION_KINDS),
    title: str,
    date: str,
    participants: strs,
    sentiment: enumOf(SENTIMENTS),
    summary: str,
    key_points: strs,
  }),
  action_items: { type: 'array', items: obj({ text: str, due: str, assignee: str }) },
  purchases: { type: 'array', items: obj({ po_number: str, date: str, amount: num, currency: str, items: strs, terms: str }) },
});

export interface Extraction {
  account: {
    match_slug: string;
    name: string;
    type: string;
    tier: string;
    industry: string;
    domain: string;
    arr: number;
    currency: string;
    pipeline_stage: string;
    tags: string[];
    summary: string;
    next_best_action: string;
  };
  contacts: { name: string; email: string; phone: string; title: string; influence: string }[];
  deals: { match_slug: string; name: string; stage: string; value: number; currency: string; probability: number; close_date: string }[];
  interaction: { kind: string; title: string; date: string; participants: string[]; sentiment: string; summary: string; key_points: string[] };
  action_items: { text: string; due: string; assignee: string }[];
  purchases: { po_number: string; date: string; amount: number; currency: string; items: string[]; terms: string }[];
}

/**
 * Calls Ollama (local or cloud, per the admin's LLM settings) and returns parsed JSON.
 * Local Ollama enforces `format`; Ollama Cloud accepts but doesn't enforce it, so the schema is also
 * spelled out in the system prompt and the JSON object is extracted from the reply.
 */
export async function chatJson(ep: Endpoint, system: string, user: string, schema: object, timeoutMs = 15 * 60_000): Promise<any> {
  const res = await fetch(`${ep.url}/api/chat`, {
    method: 'POST',
    headers: ep.headers,
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: ep.model,
      stream: false,
      format: schema,
      ...(ep.provider === 'local' ? { think: false } : {}),
      options: ep.provider === 'local' ? { temperature: 0.1, num_ctx: config.ollamaNumCtx } : { temperature: 0.1 },
      messages: [
        {
          role: 'system',
          content: `${system}\n\nRespond with ONLY one JSON object matching this JSON Schema. No prose, no markdown fences.\n${JSON.stringify(schema)}`,
        },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${ep.label}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return parseJsonReply(String(json.message?.content || ''));
}

export function parseJsonReply(text: string): any {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const i = t.indexOf('{');
    const j = t.lastIndexOf('}');
    if (i >= 0 && j > i) return JSON.parse(t.slice(i, j + 1));
    throw new Error(`Model did not return JSON: ${t.slice(0, 120)}`);
  }
}

export async function runExtraction(system: string, content: string): Promise<Extraction & { _model: string }> {
  const ep = await activeEndpoint();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await chatJson(ep, system, `Document content:\n\n${content}\n\nReturn the JSON extraction.`, EXTRACTION_SCHEMA);
      return { ...normalise(raw), _model: ep.label };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const a = (v: unknown) => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(s(v)) ? s(v).slice(0, 10) : '');

function normalise(x: any): Extraction {
  const acc = x?.account || {};
  const it = x?.interaction || {};
  return {
    account: {
      match_slug: s(acc.match_slug),
      name: s(acc.name),
      type: s(acc.type),
      tier: s(acc.tier),
      industry: s(acc.industry),
      domain: s(acc.domain).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''),
      arr: n(acc.arr),
      currency: s(acc.currency).toUpperCase(),
      pipeline_stage: s(acc.pipeline_stage),
      tags: a(acc.tags).map((t) => t.toLowerCase()),
      summary: s(acc.summary),
      next_best_action: s(acc.next_best_action),
    },
    contacts: arr(x?.contacts)
      .map((c: any) => ({ name: s(c.name), email: s(c.email).toLowerCase(), phone: s(c.phone), title: s(c.title), influence: s(c.influence) }))
      .filter((c) => c.name || c.email),
    deals: arr(x?.deals)
      .map((d: any) => ({
        match_slug: s(d.match_slug),
        name: s(d.name),
        stage: s(d.stage),
        value: n(d.value),
        currency: s(d.currency).toUpperCase(),
        probability: n(d.probability),
        close_date: date(d.close_date),
      }))
      .filter((d) => d.name || d.match_slug),
    interaction: {
      kind: s(it.kind),
      title: s(it.title),
      date: date(it.date),
      participants: a(it.participants),
      sentiment: s(it.sentiment),
      summary: s(it.summary),
      key_points: a(it.key_points),
    },
    action_items: arr(x?.action_items)
      .map((t: any) => ({ text: s(t.text), due: date(t.due), assignee: s(t.assignee) }))
      .filter((t) => t.text),
    purchases: arr(x?.purchases)
      .map((p: any) => ({ po_number: s(p.po_number), date: date(p.date), amount: n(p.amount), currency: s(p.currency).toUpperCase(), items: a(p.items), terms: s(p.terms) }))
      .filter((p) => p.po_number || p.amount),
  };
}
