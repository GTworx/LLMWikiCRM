import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { listUsers } from '@/lib/users';
import { UsersAdmin } from '@/components/AdminForms';

export default async function UsersPage() {
  const user = await requirePageUser();
  if (user.role !== 'admin') notFound();
  const users = await listUsers();
  return (
    <>
      <div className="page-head">
        <h1>Users</h1>
        <p className="muted">Stored as markdown in <code>crm-data/.system/users/</code>. Users sign in with an emailed code; there are no passwords.</p>
      </div>
      <UsersAdmin initial={users.map(({ file, created, ...u }) => u)} me={user.email} />
    </>
  );
}
