import { createClerkClient, verifyToken } from '@clerk/backend';
import { readBearerToken, send } from './http.js';

let clerk;
function getClerkClient() {
  if (!process.env.CLERK_SECRET_KEY) throw new Error('clerk_not_configured');
  if (!clerk) clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return clerk;
}

export async function requireUser(req, res) {
  const token = readBearerToken(req);
  if (!token) {
    send(res, 401, { ok: false, error: 'authentication_required' });
    return null;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    send(res, 503, { ok: false, error: 'authentication_not_configured' });
    return null;
  }

  const authorizedParties = (process.env.CLERK_AUTHORIZED_PARTIES || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (authorizedParties.length === 0) {
    send(res, 503, { ok: false, error: 'authorized_parties_not_configured' });
    return null;
  }

  let claims;
  try {
    claims = await verifyToken(token, { secretKey, authorizedParties });
  } catch {
    send(res, 401, { ok: false, error: 'invalid_session' });
    return null;
  }
  if (!claims?.sub) {
    send(res, 401, { ok: false, error: 'invalid_session' });
    return null;
  }

  let clerkUser;
  try {
    clerkUser = await getClerkClient().users.getUser(claims.sub);
  } catch {
    // A valid session must not be misreported as invalid when Clerk's
    // Backend API is temporarily unavailable.
    send(res, 503, { ok: false, error: 'identity_provider_unavailable' });
    return null;
  }

  const email = clerkUser.emailAddresses?.find(
    (item) => item.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress;
  if (!email) {
    send(res, 422, { ok: false, error: 'verified_email_required' });
    return null;
  }

  return {
    clerkSubject: claims.sub,
    email,
    fullName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null,
  };
}
