import { getPool } from '../../../_lib/db.js';
import { send, methodNotAllowed } from '../../../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(res, ['GET', 'HEAD']);
  const missing = [];
  if (!process.env.CLERK_SECRET_KEY) missing.push('clerk_secret_key');
  if (!(process.env.CLERK_AUTHORIZED_PARTIES || '').split(',').some((value) => value.trim())) {
    missing.push('clerk_authorized_parties');
  }
  if (!process.env.DATABASE_URL) missing.push('database');
  if (missing.length) return send(res, 503, { ok: false, status: 'not_ready', missing });

  try {
    await getPool().query('SELECT 1');
    return send(res, 200, {
      ok: true,
      status: 'ready',
      dependencies: {
        clerkConfiguration: 'present',
        database: 'reachable',
      },
    });
  } catch {
    return send(res, 503, {
      ok: false,
      status: 'not_ready',
      dependencies: {
        clerkConfiguration: 'present',
        database: 'unreachable',
      },
    });
  }
}
