import test from 'node:test'
import assert from 'node:assert/strict'
import previewHandler from '../api/lead-vault/batches/preview.js'

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value },
    status(code) { this.statusCode = code; return this },
    json(value) { this.body = value; return this },
  }
}

test('preview route rejects non-POST requests', async () => {
  const res = responseRecorder()
  await previewHandler({ method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.body.error, 'method_not_allowed')
})

test('preview route fails closed while writes are disabled', async () => {
  process.env.LEAD_VAULT_WRITES_ENABLED = 'false'
  const res = responseRecorder()
  await previewHandler({ method: 'POST', headers: {} }, res)
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.error, 'lead_vault_writes_disabled')
})

test('preview route requires an idempotency key before authentication', async () => {
  process.env.LEAD_VAULT_WRITES_ENABLED = 'true'
  const res = responseRecorder()
  await previewHandler({ method: 'POST', headers: {}, body: {} }, res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error, 'idempotency_key_required')
})

test('preview route requires a verified bearer session', async () => {
  const res = responseRecorder()
  await previewHandler({
    method: 'POST',
    headers: { 'idempotency-key': 'preview-request-123' },
    body: { csvText: 'phone\n08012345678', sourceLabel: 'test.csv' },
  }, res)
  assert.equal(res.statusCode, 401)
  assert.equal(res.body.error, 'unauthorized')
})
