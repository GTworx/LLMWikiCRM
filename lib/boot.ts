import fs from 'node:fs/promises';
import { DATA_DIR, INCOMING_DIR, PROMPTS_DIR, USERS_DIR, config } from './config';
import { commitAll, ensureRepo } from './git';
import { DEFAULT_PROMPT, PROMPT_FILE } from './llm';
import { loadJobHistory, startWatchers } from './ingest';
import { findUser, upsertUser } from './users';
import { singleton, writeLock } from './util';

export async function boot() {
  const s = singleton('boot', () => ({ done: false }));
  if (s.done) return;
  s.done = true;
  await ensureRepo();
  await Promise.all([USERS_DIR, PROMPTS_DIR, INCOMING_DIR].map((d) => fs.mkdir(d, { recursive: true })));
  try {
    await fs.access(PROMPT_FILE);
  } catch {
    await fs.writeFile(PROMPT_FILE, DEFAULT_PROMPT);
    await writeLock().run(() => commitAll('Add default extraction prompt', { name: 'LLM Wiki CRM', email: 'system@crm.local' }));
  }
  if (config.adminEmail && !(await findUser(config.adminEmail))) {
    await upsertUser({ email: config.adminEmail, name: 'Admin', role: 'admin', status: 'active' }, { name: 'LLM Wiki CRM', email: 'system@crm.local' });
    console.log(`[crm] seeded admin ${config.adminEmail}`);
  } else if (!config.adminEmail) {
    console.warn('[crm] ADMIN_EMAIL is not set — no admin user will be seeded');
  }
  await loadJobHistory();
  await startWatchers();
  console.log(`[crm] wiki at ${DATA_DIR}, model ${config.ollamaModel}`);
}
