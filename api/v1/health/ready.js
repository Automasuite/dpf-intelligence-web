import { getPool } from '../../../_lib/db.js';
import { send, methodNotAllowed } from '../../../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(res, ['GET', 'HEAD']);
  const missing = [];
  if (!process.env.CLERK_SECRET_KEY) missing.push('clerk');
  if (!process.env.DATABASE_URL) missing.push('database');
  if (missing.length) return send(res, 503, { ok: false, status: 'not_ready', missing });
  try {
    await getPool().query('SELECT 1');
    return send(res, 200, { ok: true, status: 'ready', dependencies: { clerkConfigured: true, database: 'reachable' } });
  } catch {
    return send(res, 503, { ok: false, status: 'not_ready', dependencies: { clerkConfigured: true, database: 'unreachable' } });
  }
}
