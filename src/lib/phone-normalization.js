/**
 * Conservative phone-number normalization for DPF Lead Vault.
 *
 * Never guesses a country for an unqualified national number.
 * Original input is returned unchanged for provenance.
 */

const digitsOnly = (value) => value.replace(/\D/g, '')

function result(raw, status, normalized = null, reason = null) {
  return { raw, status, normalized, reason }
}

/**
 * @param {string|number|null|undefined} input Original phone input.
 * @param {{ countryHint?: string }} options Explicit country context, e.g. "NG".
 * @returns {{raw: unknown, status: string, normalized: string|null, reason: string|null}}
 */
export function normalizePhone(input, options = {}) {
  if (input === null || input === undefined || String(input).trim() === '') {
    return result(input, 'incomplete', null, 'empty_input')
  }

  const raw = input
  const value = String(input).trim()

  // Extensions require a dedicated extension field; do not merge them into E.164.
  if (/(?:ext\.?|extension|x)\s*\d+$/i.test(value)) {
    return result(raw, 'needs_review', null, 'extension_present')
  }

  const hasPlus = value.startsWith('+')
  const digits = digitsOnly(value)

  if (!digits) return result(raw, 'invalid', null, 'no_digits')

  let candidate = null
  const countryHint = String(options.countryHint || '').trim().toUpperCase()

  if (hasPlus) {
    candidate = digits
  } else if (countryHint === 'NG' && /^0\d{10}$/.test(digits)) {
    candidate = '234' + digits.slice(1)
  } else if (countryHint === 'NG' && /^234\d{10}$/.test(digits)) {
    candidate = digits
  } else if (!hasPlus && digits.length >= 8 && digits.length <= 15 && digits[0] !== '0') {
    // A bare international country code is not accepted as certain.
    return result(raw, 'needs_review', null, 'missing_international_prefix')
  } else {
    return result(raw, 'needs_review', null, countryHint === 'NG'
      ? 'unrecognized_nigerian_number'
      : 'country_context_required')
  }

  if (candidate.length < 8 || candidate.length > 15 || candidate[0] === '0') {
    return result(raw, 'invalid', null, 'outside_e164_length_or_prefix')
  }

  return result(raw, 'valid', '+' + candidate)
}
