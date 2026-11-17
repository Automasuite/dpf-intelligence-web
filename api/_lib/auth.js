import { verifyToken } from '@clerk/backend';
import { readBearerToken, send } from './http.js';

export async function requireUser(req, res) {
  const token = readBearerToken(req);
  if (!token) {
    send(res, 401, { ok: false, error: 'authentication_required' });
    return null;
  }

  if (!process.env.CLERK_SECRET_KEY) {
    send(res, 503, { ok: false, error: 'authentication_not_configured' });
    return null;
  }

  try {
    const claims = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      authorizedParties: (process.env.CLERK_AUTHORIZED_PARTIES || '')
        .split(',').map((value) => value.trim()).filter(Boolean),
    });
    if (!claims?.sub) {
      send(res, 401, { ok: false, error: 'invalid_session' });
      return null;
    }
    return { clerkSubject: claims.sub };
  } catch {
    send(res, 401, { ok: false, error: 'invalid_session' });
    return null;
  }
}
