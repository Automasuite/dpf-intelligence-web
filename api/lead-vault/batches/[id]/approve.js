import { requireWorkspacePermission } from '../../../_lib/auth.js'
import { getPrivilegedSupabaseClient } from '../../../_lib/admin-client.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  if (process.env.LEAD_VAULT_WRITES_ENABLED !== 'true') {
    return res.status(503).json({ ok: false, error: 'lead_vault_writes_disabled' })
  }

  const batchId = req.query?.id
  if (typeof batchId !== 'string' || !UUID.test(batchId)) {
    return res.status(400).json({ ok: false, error: 'invalid_batch_id' })
  }

  const requestId = req.headers?.['idempotency-key'] || req.headers?.['x-request-id']
  if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) {
    return res.status(400).json({ ok: false, error: 'idempotency_key_required' })
  }

  const access = await requireWorkspacePermission(req, 'batches.approve')
  if (access.error) return res.status(access.status).json({ ok: false, error: access.error })

  const supabase = getPrivilegedSupabaseClient()
  if (!supabase) return res.status(503).json({ ok: false, error: 'server_database_not_configured' })

  const { data, error } = await supabase.rpc('dpf_approve_contact_import_batch', {
    p_batch_id: batchId,
    p_actor_id: access.user.id,
    p_request_id: requestId,
  })

  if (error) {
    const message = String(error.message || '')
    const status = /not authorized/i.test(message) ? 403
      : /not found/i.test(message) ? 404
      : /not awaiting approval|unresolved|no eligible|snapshot mismatch/i.test(message) ? 409
      : 500
    return res.status(status).json({
      ok: false,
      error: status === 403 ? 'forbidden' : status === 404 ? 'batch_not_found' : status === 409 ? 'batch_approval_rejected' : 'approval_failed',
      requestId,
    })
  }

  return res.status(200).json({ ok: true, requestId, result: data })
}
