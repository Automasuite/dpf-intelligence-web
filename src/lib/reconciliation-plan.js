/**
 * Deterministic, side-effect-free Lead Vault reconciliation planner.
 *
 * This module never writes to a database. A trusted server route may use its
 * output inside one transaction after authenticating the actor and checking
 * that the batch is approved. Do not accept owner_id from the request body.
 */

const E164 = /^\+[1-9][0-9]{7,14}$/

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(label + ' must be an array.')
}

function countBy(rows, predicate) {
  return rows.filter(predicate).length
}

/**
 * @param {{
 *   batchId:string,
 *   batchStatus:string,
 *   rows:Array<{sourceRowKey:string,rowNumber:number,rawPhone:string,status:string,normalized:string|null,suppliedName?:string|null,sourceReference?:string|null}>,
 *   existingContacts?:Array<{id:string,phone_e164:string}>,
 *   importedRowKeys?:string[]
 * }} input
 */
export function buildReconciliationPlan(input) {
  if (!input || typeof input !== 'object') throw new TypeError('A reconciliation input is required.')
  if (!input.batchId || typeof input.batchId !== 'string') throw new TypeError('A batch ID is required.')
  if (input.batchStatus !== 'approved') {
    const error = new Error('Import batch must be approved before reconciliation.')
    error.code = 'batch_not_approved'
    throw error
  }

  const rows = input.rows ?? []
  const existingContacts = input.existingContacts ?? []
  const importedRowKeys = new Set(input.importedRowKeys ?? [])
  assertArray(rows, 'rows')
  assertArray(existingContacts, 'existingContacts')
  if (input.importedRowKeys !== undefined) assertArray(input.importedRowKeys, 'importedRowKeys')

  const existingByPhone = new Map()
  for (const contact of existingContacts) {
    if (!contact || typeof contact.id !== 'string' || !E164.test(contact.phone_e164 || '')) continue
    const matches = existingByPhone.get(contact.phone_e164) ?? []
    matches.push(contact.id)
    existingByPhone.set(contact.phone_e164, matches)
  }

  const batchCandidateByPhone = new Map()
  const seenRowKeys = new Set()
  const seenRowNumbers = new Set()
  const plannedRows = []

  for (const row of rows) {
    if (!row || typeof row.sourceRowKey !== 'string' || !row.sourceRowKey) {
      throw new TypeError('Every import row requires a stable sourceRowKey.')
    }
    if (!Number.isInteger(row.rowNumber) || row.rowNumber < 1) {
      throw new TypeError('Every import row requires a positive rowNumber.')
    }
    if (seenRowKeys.has(row.sourceRowKey) || seenRowNumbers.has(row.rowNumber)) {
      throw new Error('Duplicate source row key or row number in reconciliation input.')
    }
    seenRowKeys.add(row.sourceRowKey)
    seenRowNumbers.add(row.rowNumber)

    const idempotencyKey = input.batchId + ':' + row.sourceRowKey
    if (importedRowKeys.has(row.sourceRowKey)) {
      plannedRows.push({ sourceRowKey: row.sourceRowKey, rowNumber: row.rowNumber, action: 'already_imported', idempotencyKey })
      continue
    }

    if (row.status !== 'valid' || !E164.test(row.normalized || '')) {
      plannedRows.push({
        sourceRowKey: row.sourceRowKey,
        rowNumber: row.rowNumber,
        action: 'skip_review',
        reason: row.reason || (row.status === 'valid' ? 'normalized_phone_not_e164' : row.reason || row.status || 'invalid_status'),
        idempotencyKey,
      })
      continue
    }

    const existing = existingByPhone.get(row.normalized) ?? []
    if (existing.length > 1) {
      plannedRows.push({
        sourceRowKey: row.sourceRowKey,
        rowNumber: row.rowNumber,
        phoneE164: row.normalized,
        action: 'needs_manual_review',
        reason: 'multiple_existing_canonical_contacts',
        candidateContactIds: existing,
        idempotencyKey,
      })
      continue
    }
    if (existing.length === 1) {
      plannedRows.push({
        sourceRowKey: row.sourceRowKey,
        rowNumber: row.rowNumber,
        phoneE164: row.normalized,
        action: 'link_existing_contact',
        contactId: existing[0],
        preserveSuppliedNameForReview: row.suppliedName || null,
        sourceReference: row.sourceReference || null,
        idempotencyKey,
      })
      continue
    }

    const batchCandidate = batchCandidateByPhone.get(row.normalized)
    if (batchCandidate) {
      plannedRows.push({
        sourceRowKey: row.sourceRowKey,
        rowNumber: row.rowNumber,
        phoneE164: row.normalized,
        action: 'link_batch_candidate',
        candidateSourceRowKey: batchCandidate,
        preserveSuppliedNameForReview: row.suppliedName || null,
        sourceReference: row.sourceReference || null,
        idempotencyKey,
      })
      continue
    }

    batchCandidateByPhone.set(row.normalized, row.sourceRowKey)
    plannedRows.push({
      sourceRowKey: row.sourceRowKey,
      rowNumber: row.rowNumber,
      phoneE164: row.normalized,
      action: 'create_contact',
      suppliedNameForReview: row.suppliedName || null,
      sourceReference: row.sourceReference || null,
      idempotencyKey,
    })
  }

  return {
    batchId: input.batchId,
    batchStatus: input.batchStatus,
    dryRun: true,
    writesPerformed: false,
    rows: plannedRows,
    summary: {
      total: plannedRows.length,
      createContacts: countBy(plannedRows, (row) => row.action === 'create_contact'),
      linkExisting: countBy(plannedRows, (row) => row.action === 'link_existing_contact'),
      linkBatchDuplicates: countBy(plannedRows, (row) => row.action === 'link_batch_candidate'),
      needsManualReview: countBy(plannedRows, (row) => row.action === 'needs_manual_review'),
      skippedForReview: countBy(plannedRows, (row) => row.action === 'skip_review'),
      alreadyImported: countBy(plannedRows, (row) => row.action === 'already_imported'),
      provenanceRowsToRecord: countBy(plannedRows, (row) => ['create_contact','link_existing_contact','link_batch_candidate'].includes(row.action)),
    },
  }
}
