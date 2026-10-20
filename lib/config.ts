import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.CRM_DATA_DIR || path.join(process.cwd(), 'crm-data'));
export const ACCOUNTS_DIR = path.join(DATA_DIR, 'accounts');
export const INCOMING_DIR = path.join(DATA_DIR, 'incoming');
export const ARCHIVE_DIR = path.join(DATA_DIR, '.archive');
export const SYSTEM_DIR = path.join(DATA_DIR, '.system');
export const USERS_DIR = path.join(SYSTEM_DIR, 'users');
export const PROMPTS_DIR = path.join(SYSTEM_DIR, 'prompts');
export const JOBS_LOG = path.join(SYSTEM_DIR, 'jobs.jsonl');

const list = (v?: string) =>
  (v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const config = {
  appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  authSecret: process.env.AUTH_SECRET || '',
  brevoApiKey: process.env.BREVO_API_KEY || '',
  senderEmail: process.env.BREVO_SENDER_EMAIL || '',
  senderName: process.env.BREVO_SENDER_NAME || 'LLM Wiki CRM',
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  companyName: process.env.COMPANY_NAME || 'Our Company',
  ownDomains: list(process.env.OWN_COMPANY_DOMAINS),
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',
  ollamaUrl: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen3.8:latest',
  ollamaNumCtx: Number(process.env.OLLAMA_NUM_CTX || 32768),
  isProd: process.env.NODE_ENV === 'production',
};
