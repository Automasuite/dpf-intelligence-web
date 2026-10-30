import { createClient } from '@supabase/supabase-js'

export { readBearerToken } from './bearer-token.js'
import { readBearerToken } from './bearer-token.js'


export async function getAuthenticatedUser(req) {
  const token = readBearerToken(req)
  if (!token) return { error: 'unauthorized', status: 401 }

  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) return { error: 'auth_service_not_configured', status: 503 }

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return { error: 'unauthorized', status: 401 }
  return { user: data.user }
}
