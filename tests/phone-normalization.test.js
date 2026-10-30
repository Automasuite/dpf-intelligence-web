import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone } from '../src/lib/phone-normalization.js'

test('normalizes Nigerian national format only with explicit NG context', () => {
  const item = normalizePhone('0803 123 4567', { countryHint: 'NG' })
  assert.equal(item.status, 'valid')
  assert.equal(item.normalized, '+2348031234567')
  assert.equal(item.raw, '0803 123 4567')
})

test('normalizes explicit international format without country hint', () => {
  const item = normalizePhone('+234-803-123-4567')
  assert.equal(item.status, 'valid')
  assert.equal(item.normalized, '+2348031234567')
})

test('does not guess a country for a national number', () => {
  const item = normalizePhone('08031234567')
  assert.equal(item.status, 'needs_review')
  assert.equal(item.normalized, null)
  assert.equal(item.reason, 'country_context_required')
})

test('flags a bare country-code-looking number for review', () => {
  const item = normalizePhone('2348031234567')
  assert.equal(item.status, 'needs_review')
  assert.equal(item.reason, 'missing_international_prefix')
})

test('preserves extension numbers for manual review', () => {
  const item = normalizePhone('+2348031234567 ext 12')
  assert.equal(item.status, 'needs_review')
  assert.equal(item.reason, 'extension_present')
})

test('classifies empty and malformed inputs', () => {
  assert.equal(normalizePhone(' ').status, 'incomplete')
  assert.equal(normalizePhone('letters only').status, 'invalid')
})

test('rejects numbers outside E.164 length limits', () => {
  const item = normalizePhone('+1234567')
  assert.equal(item.status, 'invalid')
})
