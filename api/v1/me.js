import { requireUser } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { send, methodNotAllowed } from '../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.DATABASE_URL) return send(res, 503, { ok: false, error: 'database_not_configured' });

  try {
    const result = await getPool().query(
      'SELECT core.upsert_clerk_user($1, NULL, NULL) AS user_id',
      [auth.clerkSubject],
    );
    const userId = result.rows[0]?.user_id;
    if (!userId) return send(res, 500, { ok: false, error: 'user_provisioning_failed' });
    return send(res, 200, { ok: true, user: { id: userId } });
  } catch {
    return send(res, 503, { ok: false, error: 'identity_service_unavailable' });
  }
}
