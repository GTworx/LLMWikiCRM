import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { DEFAULT_PROMPT, loadPrompt } from '@/lib/llm';
import { PromptEditor } from '@/components/AdminForms';

export default async function PromptPage() {
  const user = await requirePageUser();
  if (user.role !== 'admin') notFound();
  return (
    <>
      <div className="page-head">
        <h1>Extraction prompt</h1>
        <p className="muted">The system prompt used for every ingested document. Stored in <code>crm-data/.system/prompts/extraction.md</code>.</p>
      </div>
      <PromptEditor initial={await loadPrompt()} fallback={DEFAULT_PROMPT} />
    </>
  );
}
