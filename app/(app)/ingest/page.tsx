import { requirePageUser } from '@/lib/auth';
import { config, INCOMING_DIR } from '@/lib/config';
import { canEdit } from '@/lib/schema';
import { JobList, UploadBox } from '@/components/IngestPanel';

export default async function IngestPage() {
  const user = await requirePageUser();
  return (
    <>
      <div className="page-head">
        <h1>Ingest</h1>
        <p className="muted">
          Upload here, or drop files into <code>{INCOMING_DIR}/&lt;customer-name&gt;/</code>. The folder name is used as a hint for which
          account the file belongs to. Files are processed one at a time by <code>{config.ollamaModel}</code>, then archived to <code>crm-data/.archive/</code>.
        </p>
      </div>
      <div className="stack">
        <div className="card"><UploadBox editable={canEdit(user)} /></div>
        <div className="card"><h2>Jobs</h2><JobList editable={canEdit(user)} /></div>
      </div>
    </>
  );
}
