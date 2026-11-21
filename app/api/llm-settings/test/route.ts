import { apiError, HttpError, requireApiUser } from '@/lib/auth';
import { chatJson } from '@/lib/llm';
import { endpointFor, PROVIDERS, type Provider } from '@/lib/llm-settings';

const SCHEMA = {
  type: 'object',
  properties: { company: { type: 'string' }, seats: { type: 'number' } },
  required: ['company', 'seats'],
};

/** Runs a tiny structured extraction against the chosen provider/model, without saving anything. */
export async function POST(req: Request) {
  try {
    await requireApiUser('admin');
    const { provider, model } = await req.json();
    if (!PROVIDERS.includes(provider) || !String(model || '').trim()) throw new HttpError(400, 'Choose a provider and model');
    const ep = endpointFor(provider as Provider, String(model).trim());
    const t0 = Date.now();
    try {
      const out = await chatJson(ep, 'You extract structured data.', 'Extract from: "Acme Corp wants 250 seats."', SCHEMA, 120_000);
      const ok = typeof out?.company === 'string' && Number(out?.seats) === 250;
      return Response.json({ ok, ms: Date.now() - t0, label: ep.label, output: out });
    } catch (e) {
      return Response.json({ ok: false, ms: Date.now() - t0, label: ep.label, error: (e as Error).message });
    }
  } catch (e) {
    return apiError(e);
  }
}
