import { getAuthenticatedUser } from '../_lib/auth.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  const result = await getAuthenticatedUser(req)
  if (result.error) {
    return res.status(result.status).json({ ok: false, error: result.error })
  }

  // The owner identity is derived only from the verified Supabase user.
  // This endpoint does not read or mutate contact records.
  return res.status(200).json({
    ok: true,
    user: { id: result.user.id },
    workspaces: result.memberships.map(({ owner_id, role }) => ({ ownerId: owner_id, role })),
  })
}
