import { requirePageUser } from '@/lib/auth';
import { INCOMING_DIR } from '@/lib/config';
import { activeEndpoint } from '@/lib/llm-settings';
import { canEdit } from '@/lib/schema';
import { JobList, UploadBox } from '@/components/IngestPanel';
import { SkillsPanel } from '@/components/Skills';

export default async function IngestPage() {
  const user = await requirePageUser();
  const llm = await activeEndpoint().catch((e) => ({ label: `unavailable: ${e.message}` }));
  return (
    <>
      <div className="page-head">
        <h1>Ingest</h1>
        <p className="muted">
          Upload here, or drop files into <code>{INCOMING_DIR}/&lt;customer-name&gt;/</code>. The folder name is used as a hint for which
          account the file belongs to. Files are processed one at a time by <code>{llm.label}</code>{user.role === 'admin' && <> (<a href="/admin/llm">change</a>)</>}, then archived to <code>.archive/</code>.
        </p>
      </div>
      <div className="stack">
        <div className="card">
          <h2>Skills</h2>
          <p className="small muted">
            Reusable actions saved from successful runs. A <b>prompt</b> skill fills the prompt box below; a <b>cohort week sync</b> adds a week
            from the course&apos;s <code>data.json</code> to every participant — use it instead of uploading the week&apos;s transcript.
          </p>
          <SkillsPanel editable={canEdit(user)} />
        </div>
        <div className="card"><UploadBox editable={canEdit(user)} staged /></div>
        <div className="card"><h2>Jobs</h2><JobList editable={canEdit(user)} /></div>
      </div>
    </>
  );
}
