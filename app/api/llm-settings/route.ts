import { apiError, authorOf, requireApiUser } from '@/lib/auth';
import { config } from '@/lib/config';
import { getLlmSettings, listModels, saveLlmSettings } from '@/lib/llm-settings';

export async function GET() {
  try {
    await requireApiUser('admin');
    const [settings, local, cloud] = await Promise.all([getLlmSettings(), listModels('local'), listModels('cloud')]);
    return Response.json({
      settings,
      local: { url: config.ollamaUrl, ...local },
      cloud: { url: config.ollamaCloudUrl, apiKeyConfigured: !!config.ollamaApiKey, ...cloud },
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const u = await requireApiUser('admin');
    const { provider, local_model, cloud_model } = await req.json();
    const settings = await saveLlmSettings({ provider, local_model, cloud_model }, authorOf(u));
    return Response.json({ settings });
  } catch (e) {
    return apiError(e);
  }
}
