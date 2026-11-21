import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import LlmSettings from '@/components/LlmSettings';

export default async function LlmPage() {
  const user = await requirePageUser();
  if (user.role !== 'admin') notFound();
  return (
    <>
      <div className="page-head">
        <h1>LLM provider</h1>
        <p className="muted">
          Choose where document extraction runs. The change applies to the next ingested document. Jobs that are already processing finish on
          the provider they started with.
        </p>
      </div>
      <LlmSettings />
    </>
  );
}
