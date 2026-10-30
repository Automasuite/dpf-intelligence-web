import { createClient } from '@supabase/supabase-js'
import { readBearerToken } from './bearer-token.js'

export { readBearerToken } from './bearer-token.js'

export async function getAuthenticatedUser(req) {
  const token = readBearerToken(req)
  if (!token) return { error: 'unauthorized', status: 401 }

  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) return { error: 'auth_service_not_configured', status: 503 }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return { error: 'unauthorized', status: 401 }

  const { data: memberships, error: membershipError } = await supabase
    .from('dpf_workspace_members')
    .select('owner_id, role, membership_status')
    .eq('user_id', data.user.id)
    .eq('membership_status', 'active')

  if (membershipError) {
    // Missing migration or inaccessible membership table must fail closed.
    return { error: 'workspace_access_not_configured', status: 503 }
  }

  if (!memberships?.length) {
    return { error: 'workspace_membership_required', status: 403 }
  }

  return { user: data.user, memberships }
}

export async function requireWorkspaceRole(req, allowedRoles = []) {
  const result = await getAuthenticatedUser(req)
  if (result.error) return result

  const permitted = result.memberships.filter(member => allowedRoles.includes(member.role))
  if (!permitted.length) return { error: 'forbidden', status: 403 }

  return { user: result.user, memberships: permitted }
}
