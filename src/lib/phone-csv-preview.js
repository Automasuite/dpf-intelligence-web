/**
 * Strict, dependency-free CSV preview parser for phone-only Lead Vault imports.
 * It does not write to a database, infer contact attributes, or send messages.
 */

const PHONE_HEADERS = new Set(['phone', 'phone_number', 'mobile', 'mobile_number', 'telephone', 'contact_number'])
const NAME_HEADERS = new Set(['name', 'full_name', 'contact_name'])
const SOURCE_HEADERS = new Set(['source', 'source_reference', 'source_url', 'reference'])

function csvError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function parseRows(text, maxColumns) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let closedQuote = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
          closedQuote = true
        }
      } else {
        field += char
      }
      continue
    }

    if (closedQuote && char !== ',' && char !== '\r' && char !== '\n') {
      throw csvError('malformed_csv', 'Unexpected character after a closing quote.')
    }
    if (char === '"' && field.length === 0 && !closedQuote) {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
      closedQuote = false
      if (row.length >= maxColumns) throw csvError('too_many_columns', 'CSV exceeds the maximum column count.')
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      if (row.length > maxColumns) throw csvError('too_many_columns', 'CSV exceeds the maximum column count.')
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      field = ''
      closedQuote = false
    } else {
      if (closedQuote) throw csvError('malformed_csv', 'Unexpected data after a closing quote.')
      field += char
    }
  }

  if (quoted) throw csvError('malformed_csv', 'CSV ends inside a quoted field.')
  if (field.length || row.length) {
    row.push(field)
    if (row.length > maxColumns) throw csvError('too_many_columns', 'CSV exceeds the maximum column count.')
    if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  }
  return rows
}

/**
 * @param {string} input CSV text.
 * @param {{maxBytes?:number,maxRows?:number,maxColumns?:number}} limits
 */
export function previewPhoneCsv(input, limits = {}) {
  if (typeof input !== 'string' || input.length === 0) {
    throw csvError('empty_file', 'The CSV file is empty.')
  }
  const maxBytes = limits.maxBytes ?? 5 * 1024 * 1024
  const maxRows = limits.maxRows ?? 10000
  const maxColumns = limits.maxColumns ?? 50
  if (new TextEncoder().encode(input).length > maxBytes) {
    throw csvError('file_too_large', 'CSV exceeds the configured file-size limit.')
  }

  const text = input.replace(/^\uFEFF/, '')
  const rows = parseRows(text, maxColumns)
  if (rows.length < 2) throw csvError('no_data_rows', 'CSV must contain a header and at least one data row.')

  const headers = rows[0].map((value) => value.trim().toLowerCase().replace(/[\s-]+/g, '_'))
  if (headers.some((header) => !header)) throw csvError('blank_header', 'CSV contains a blank column heading.')
  if (new Set(headers).size !== headers.length) throw csvError('duplicate_headers', 'CSV contains duplicate column headings.')

  const phoneIndex = headers.findIndex((header) => PHONE_HEADERS.has(header))
  if (phoneIndex < 0) throw csvError('phone_column_missing', 'No recognized phone-number column was found.')
  const nameIndex = headers.findIndex((header) => NAME_HEADERS.has(header))
  const sourceIndex = headers.findIndex((header) => SOURCE_HEADERS.has(header))
  const dataRows = rows.slice(1)
  if (dataRows.length > maxRows) throw csvError('too_many_rows', 'CSV exceeds the configured row limit.')

  const parsed = dataRows.map((cells, index) => {
    if (cells.length !== headers.length) {
      throw csvError('inconsistent_row', 'CSV row ' + (index + 2) + ' has a different number of columns than the header.')
    }
    return {
      rowNumber: index + 2,
      sourceRowKey: 'row-' + (index + 2),
      rawPhone: cells[phoneIndex],
      suppliedName: nameIndex >= 0 ? (cells[nameIndex].trim() || null) : null,
      sourceReference: sourceIndex >= 0 ? (cells[sourceIndex].trim() || null) : null,
    }
  })

  return {
    headers,
    totalRows: parsed.length,
    ignoredEmailColumn: headers.includes('email') || headers.includes('email_address'),
    rows: parsed,
  }
}
