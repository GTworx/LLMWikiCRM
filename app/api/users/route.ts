import { apiError, authorOf, HttpError, requireApiUser } from '@/lib/auth';
import { listUsers, upsertUser } from '@/lib/users';

export async function GET() {
  try {
    await requireApiUser('admin');
    return Response.json({ users: await listUsers() });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireApiUser('admin');
    const body = await req.json();
    if (String(body.email).toLowerCase() === u.email && (body.role !== 'admin' || body.status === 'disabled'))
      throw new HttpError(400, "You can't remove your own admin access");
    const user = await upsertUser(
      {
        email: String(body.email || ''),
        name: body.name,
        role: body.role,
        status: body.status,
        assigned_accounts: Array.isArray(body.assigned_accounts) ? body.assigned_accounts.map(String).filter(Boolean) : undefined,
      },
      authorOf(u),
    );
    return Response.json({ user });
  } catch (e) {
    return apiError(e);
  }
}
