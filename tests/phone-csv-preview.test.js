import test from 'node:test'
import assert from 'node:assert/strict'
import { previewPhoneCsv } from '../src/lib/phone-csv-preview.js'

test('parses a simple phone CSV and retains supplied names and source reference', () => {
  const result = previewPhoneCsv('Phone,Full Name,Source\n08031234567,Ada,Referral')
  assert.equal(result.totalRows, 1)
  assert.equal(result.rows[0].rawPhone, '08031234567')
  assert.equal(result.rows[0].suppliedName, 'Ada')
  assert.equal(result.rows[0].sourceReference, 'Referral')
})

test('handles quoted commas, escaped quotes, and embedded newlines', () => {
  const result = previewPhoneCsv('phone,name\n08031234567,"Ada, ""A"" Smith\nSecond line"')
  assert.equal(result.rows[0].suppliedName, 'Ada, "A" Smith\nSecond line')
})

test('strips a UTF-8 BOM and normalizes header matching', () => {
  const result = previewPhoneCsv('\uFEFF MOBILE_NUMBER ,Name\n08031234567,Ada')
  assert.equal(result.rows[0].rawPhone, '08031234567')
})

test('does not import email values in phone-only preview', () => {
  const result = previewPhoneCsv('phone,email\n08031234567,ada@example.com')
  assert.equal(result.ignoredEmailColumn, true)
  assert.equal('email' in result.rows[0], false)
})

test('rejects a missing phone column', () => {
  assert.throws(() => previewPhoneCsv('name,email\nAda,a@example.com'), { code: 'phone_column_missing' })
})

test('rejects duplicate and blank headers', () => {
  assert.throws(() => previewPhoneCsv('phone,Phone\n1,2'), { code: 'duplicate_headers' })
  assert.throws(() => previewPhoneCsv('phone,\n1,2'), { code: 'blank_header' })
})

test('rejects malformed quoted CSV', () => {
  assert.throws(() => previewPhoneCsv('phone,name\n123,"Ada'), { code: 'malformed_csv' })
  assert.throws(() => previewPhoneCsv('phone,name\n123,"Ada"x'), { code: 'malformed_csv' })
})

test('enforces file, row, and column limits', () => {
  assert.throws(() => previewPhoneCsv('phone\n123', { maxBytes: 2 }), { code: 'file_too_large' })
  assert.throws(() => previewPhoneCsv('phone\n1\n2', { maxRows: 1 }), { code: 'too_many_rows' })
  assert.throws(() => previewPhoneCsv('phone,name,source\n1,A,B', { maxColumns: 2 }), { code: 'too_many_columns' })
})

test('rejects inconsistent row widths and empty data', () => {
  assert.throws(() => previewPhoneCsv('phone,name\n123'), { code: 'inconsistent_row' })
  assert.throws(() => previewPhoneCsv('phone\n'), { code: 'no_data_rows' })
})
