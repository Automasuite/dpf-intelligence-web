import test from 'node:test'
import assert from 'node:assert/strict'
import approveHandler from '../api/lead-vault/batches/[id]/approve.js'
import commitHandler from '../api/lead-vault/batches/[id]/commit.js'

process.env.LEAD_VAULT_WRITES_ENABLED = 'true'

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

for (const [name, handler] of [['approve', approveHandler], ['commit', commitHandler]]) {
  test(name + ' route rejects non-POST requests', async () => {
    const res = responseRecorder()
    await handler({ method: 'GET', query: {}, headers: {} }, res)
    assert.equal(res.statusCode, 405)
    assert.equal(res.headers['Cache-Control'], 'no-store')
    assert.equal(res.body.error, 'method_not_allowed')
  })

  test(name + ' route fails closed when the write kill switch is off', async () => {
    process.env.LEAD_VAULT_WRITES_ENABLED = 'false'
    const res = responseRecorder()
    await handler({ method: 'POST', query: { id: '20000000-0000-4000-8000-000000000001' }, headers: {} }, res)
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.error, 'lead_vault_writes_disabled')
    process.env.LEAD_VAULT_WRITES_ENABLED = 'true'
  })

  test(name + ' route rejects malformed batch IDs before authentication', async () => {
    const res = responseRecorder()
    await handler({ method: 'POST', query: { id: 'not-a-uuid' }, headers: {} }, res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.error, 'invalid_batch_id')
  })

  test(name + ' route requires an idempotency key', async () => {
    const res = responseRecorder()
    await handler({
      method: 'POST',
      query: { id: '20000000-0000-4000-8000-000000000001' },
      headers: {},
    }, res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.error, 'idempotency_key_required')
  })
}
