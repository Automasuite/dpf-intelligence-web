import { requireUser } from '../_lib/auth.js';
import { getPool, withTenantContext } from '../_lib/db.js';
import { parseJsonBody, send, methodNotAllowed } from '../_lib/http.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.DATABASE_URL) return send(res, 503, { ok: false, error: 'database_not_configured' });

  try {
    const identity = await getPool().query(
      'SELECT core.upsert_clerk_user($1, $2, $3) AS user_id',
      [auth.clerkSubject, auth.email, auth.fullName],
    );
    const userId = identity.rows[0]?.user_id;
    if (!userId) return send(res, 403, { ok: false, error: 'active_user_required' });

    if (req.method === 'GET') {
      const workspaces = await withTenantContext({ userId }, async (client) => {
        const result = await client.query(
          `SELECT o.id, o.name, o.country_code, o.currency_code, o.timezone,
                  m.role, m.status AS membership_status
             FROM core.memberships m
             JOIN core.organizations o ON o.id = m.organization_id
            WHERE m.user_id = $1 AND m.status = 'active' AND o.status = 'active'
            ORDER BY o.created_at ASC`,
          [userId],
        );
        return result.rows;
      });
      return send(res, 200, { ok: true, workspaces });
    }

    const body = parseJsonBody(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const countryCode = typeof body?.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : '';
    const currencyCode = typeof body?.currencyCode === 'string' ? body.currencyCode.trim().toUpperCase() : '';
    const timezone = typeof body?.timezone === 'string' ? body.timezone.trim() : '';
    if (!name || name.length > 120 || !/^[A-Z]{2}$/.test(countryCode) ||
        !/^[A-Z]{3}$/.test(currencyCode) || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(timezone)) {
      return send(res, 400, { ok: false, error: 'invalid_workspace_input' });
    }

    const created = await getPool().query(
      'SELECT core.create_workspace($1, $2, $3, $4, $5) AS workspace_id',
      [userId, name, countryCode, currencyCode, timezone],
    );
    const workspaceId = created.rows[0]?.workspace_id;
    if (!workspaceId) return send(res, 422, { ok: false, error: 'workspace_not_created' });
    return send(res, 201, {
      ok: true,
      workspace: { id: workspaceId, name, countryCode, currencyCode, timezone },
    });
  } catch {
    return send(res, 503, { ok: false, error: 'workspace_service_unavailable' });
  }
}
