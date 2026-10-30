import test from 'node:test'
import assert from 'node:assert/strict'
import { readBearerToken } from '../api/_lib/bearer-token.js'

test('reads a standard bearer token', () => {
  assert.equal(readBearerToken({ headers: { authorization: 'Bearer abc123' } }), 'abc123')
})

test('accepts case-insensitive bearer scheme', () => {
  assert.equal(readBearerToken({ headers: { authorization: 'bearer abc123' } }), 'abc123')
})

test('rejects missing, empty, or malformed authorization headers', () => {
  assert.equal(readBearerToken({ headers: {} }), null)
  assert.equal(readBearerToken({ headers: { authorization: '' } }), null)
  assert.equal(readBearerToken({ headers: { authorization: 'Basic abc123' } }), null)
  assert.equal(readBearerToken({ headers: { authorization: 'Bearer one two' } }), null)
})
