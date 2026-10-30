import { createHash } from 'node:crypto'
import { previewPhoneCsv } from '../../../src/lib/phone-csv-preview.js'
import { normalizePhone } from '../../../src/lib/phone-normalization.js'
import { requireWorkspacePermission } from '../../_lib/auth.js'
import { getPrivilegedSupabaseClient } from '../../_lib/admin-client.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/
const MAX_CSV_BYTES = 4 * 1024 * 1024

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
}

function fail(res, status, error) {
  return res.status(status).json({ ok: false, error })
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return fail(res, 405, 'method_not_allowed')
  }

  if (process.env.LEAD_VAULT_WRITES_ENABLED !== 'true') {
    return fail(res, 503, 'lead_vault_writes_disabled')
  }

  const requestId = req.headers?.['idempotency-key'] || req.headers?.['x-request-id']
  if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) {
    return fail(res, 400, 'idempotency_key_required')
  }

  const access = await requireWorkspacePermission(req, 'batches.preview')
  if (access.error) return fail(res, access.status, access.error)

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const { csvText, sourceLabel, batchName = null, countryContext = null, workspaceOwnerId = null } = body

  if (typeof csvText !== 'string' || !csvText.length) return fail(res, 400, 'csv_text_required')
  if (new TextEncoder().encode(csvText).length > MAX_CSV_BYTES) return fail(res, 413, 'csv_too_large')
  if (typeof sourceLabel !== 'string' || !sourceLabel.trim() || sourceLabel.trim().length > 160) {
    return fail(res, 400, 'invalid_source_label')
  }
  if (batchName !== null && (typeof batchName !== 'string' || batchName.length > 120)) {
    return fail(res, 400, 'invalid_batch_name')
  }
  if (countryContext !== null && countryContext !== '' && countryContext !== 'NG') {
    return fail(res, 400, 'unsupported_country_context')
  }

  let membership
  if (workspaceOwnerId !== null) {
    if (typeof workspaceOwnerId !== 'string' || !UUID.test(workspaceOwnerId)) return fail(res, 400, 'invalid_workspace_id')
    membership = access.memberships.find(item => item.owner_id === workspaceOwnerId)
    if (!membership) return fail(res, 403, 'workspace_access_denied')
  } else if (access.memberships.length === 1) {
    membership = access.memberships[0]
  } else {
    return fail(res, 409, 'workspace_selection_required')
  }

  let parsed
  try {
    parsed = previewPhoneCsv(csvText, { maxBytes: MAX_CSV_BYTES, maxRows: 10000, maxColumns: 50 })
  } catch (error) {
    const known = new Set(['empty_file','file_too_large','no_data_rows','too_many_rows','too_many_columns','blank_header','duplicate_headers','phone_column_missing','inconsistent_row','malformed_csv'])
    return fail(res, 400, known.has(error.code) ? error.code : 'invalid_csv')
  }

  const seen = new Set()
  const rows = parsed.rows.map(row => {
    const normalized = normalizePhone(row.rawPhone, { countryHint: countryContext || undefined })
    const duplicateInBatch = normalized.status === 'valid' && seen.has(normalized.normalized)
    if (normalized.status === 'valid') seen.add(normalized.normalized)
    const rowStatus = duplicateInBatch ? 'duplicate_in_batch'
      : normalized.status === 'valid' ? 'valid'
      : 'needs_review'
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([
        row.sourceRowKey,row.rowNumber,row.rawPhone,normalized.normalized || null,
        normalized.status,normalized.reason || null,row.suppliedName || null,row.sourceReference || null,
      ]))
      .digest('hex')
    return {
      source_row_key: row.sourceRowKey,
      row_number: row.rowNumber,
      raw_phone: row.rawPhone,
      normalized_phone_e164: normalized.normalized || null,
      phone_validation_status: normalized.status,
      validation_reason: normalized.reason || null,
      row_status: rowStatus,
      row_fingerprint: fingerprint,
      supplied_name: row.suppliedName,
      source_reference: row.sourceReference,
    }
  })

  const supabase = getPrivilegedSupabaseClient()
  if (!supabase) return fail(res, 503, 'server_database_not_configured')

  const { data, error } = await supabase.rpc('dpf_create_contact_import_batch', {
    p_owner_id: membership.owner_id,
    p_actor_id: access.user.id,
    p_request_id: requestId,
    p_batch_name: batchName,
    p_source_label: sourceLabel.trim(),
    p_country_context: countryContext || null,
    p_rows: rows,
  })

  if (error) {
    const message = String(error.message || '')
    const status = /not authorized/i.test(message) ? 403
      : /unsupported|invalid|too long|outside the allowed range/i.test(message) ? 400
      : /duplicate key|unique constraint/i.test(message) ? 409
      : 500
    return fail(res, status, status === 403 ? 'forbidden' : status === 400 ? 'preview_rejected' : status === 409 ? 'duplicate_request' : 'preview_failed')
  }

  return res.status(data?.already_created ? 200 : 201).json({
    ok: true,
    requestId,
    batchId: data.batch_id,
    alreadyCreated: Boolean(data.already_created),
    counts: data.counts,
    preview: rows.slice(0, 12).map(({ source_row_key,row_number,raw_phone,normalized_phone_e164,phone_validation_status,row_status,validation_reason }) => ({
      sourceRowKey: source_row_key,
      rowNumber: row_number,
      rawPhone: raw_phone,
      normalizedPhone: normalized_phone_e164,
      validationStatus: phone_validation_status,
      rowStatus: row_status,
      reason: validation_reason,
    })),
    totalPreviewRows: rows.length,
  })
}
