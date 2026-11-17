import { requireUser } from '../../../_lib/auth.js';
import { getPool, withTenantContext } from '../../../_lib/db.js';
import { parseJsonBody, send, methodNotAllowed } from '../../../_lib/http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const optionalText = (value, max = 2000) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) return undefined;
  return value.trim();
};

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.DATABASE_URL) return send(res, 503, { ok: false, error: 'database_not_configured' });

  const workspaceId = req.query?.workspaceId;
  if (typeof workspaceId !== 'string' || !UUID.test(workspaceId)) {
    return send(res, 400, { ok: false, error: 'invalid_workspace_id' });
  }

  try {
    const identity = await getPool().query(
      'SELECT core.upsert_clerk_user($1, $2, $3) AS user_id',
      [auth.clerkSubject, auth.email, auth.fullName],
    );
    const userId = identity.rows[0]?.user_id;
    if (!userId) return send(res, 403, { ok: false, error: 'active_user_required' });

    const result = await withTenantContext({ userId, orgId: workspaceId }, async (client) => {
      const membership = await client.query(
        `SELECT 1 FROM core.memberships
          WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`,
        [workspaceId, userId],
      );
      if (!membership.rowCount) return { forbidden: true };

      if (req.method === 'GET') {
        const rows = await client.query(
          `SELECT id, business_name, industry, website_url, description,
                  country_code, business_email, phone, profile_status, created_at, updated_at
             FROM business.profiles
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [workspaceId],
        );
        return { profiles: rows.rows };
      }

      const body = parseJsonBody(req);
      const businessName = typeof body?.businessName === 'string' ? body.businessName.trim() : '';
      const countryCode = typeof body?.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : '';
      const industry = optionalText(body?.industry, 120);
      const websiteUrl = optionalText(body?.websiteUrl, 2048);
      const description = optionalText(body?.description, 2000);
      const businessEmail = optionalText(body?.businessEmail, 320);
      const phone = optionalText(body?.phone, 40);
      if (!businessName || businessName.length > 160 || !/^[A-Z]{2}$/.test(countryCode) ||
          [industry, websiteUrl, description, businessEmail, phone].includes(undefined)) {
        return { invalid: true };
      }
      if (websiteUrl) {
        try {
          const parsed = new URL(websiteUrl);
          if (!['http:', 'https:'].includes(parsed.protocol)) return { invalid: true };
        } catch { return { invalid: true }; }
      }
      if (businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) return { invalid: true };

      const created = await client.query(
        `INSERT INTO business.profiles
          (organization_id, business_name, industry, website_url, description, country_code, business_email, phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, business_name, industry, website_url, description, country_code,
                   business_email, phone, profile_status, created_at, updated_at`,
        [workspaceId, businessName, industry, websiteUrl, description, countryCode, businessEmail, phone],
      );
      return { profile: created.rows[0] };
    });

    if (result.forbidden) return send(res, 403, { ok: false, error: 'workspace_access_denied' });
    if (result.invalid) return send(res, 400, { ok: false, error: 'invalid_business_profile_input' });
    return send(res, req.method === 'POST' ? 201 : 200, { ok: true, ...result });
  } catch {
    return send(res, 503, { ok: false, error: 'business_profile_service_unavailable' });
  }
}
