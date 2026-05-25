/**
 * QRIS Dynamic Generator
 * Converts static QRIS payload to dynamic with custom amount.
 * Based on EMV QR Code Standard (EMV QRIS).
 */

// ── EMV TLV parser ──────────────────────────────────────────────

/** Split EMV payload into top-level {id, len, value} tags */
export function parseTopLevelTags(payload) {
  const tags = [];
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = parseInt(payload.slice(i + 2, i + 4), 10);
    const value = payload.slice(i + 4, i + 4 + len);
    tags.push({ id, len, value });
    i += 4 + len;
  }
  return tags;
}

/** Rebuild EMV payload from tags */
export function buildPayload(tags) {
  return tags.map(t => `${t.id}${String(t.len).padStart(2, '0')}${t.value}`).join('');
}

// ── CRC16 CCITT (EMV standard) ──────────────────────────────────

export function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

// ── Sub-tag parser (for nested tags like 51.xx) ─────────────────

export function parseSubTags(value) {
  const tags = [];
  let i = 0;
  while (i < value.length) {
    const id = value.slice(i, i + 2);
    const len = parseInt(value.slice(i + 2, i + 4), 10);
    const subValue = value.slice(i + 4, i + 4 + len);
    tags.push({ id, len, value: subValue });
    i += 4 + len;
  }
  return tags;
}

// ── Core: Static → Dynamic QRIS ─────────────────────────────────

/**
 * Convert static QRIS payload to dynamic with given amount.
 *
 * @param {string} staticPayload - Raw QRIS string (from QR decode)
 * @param {number} amount - Transaction amount in IDR (integer)
 * @param {object} opts
 * @param {string} [opts.merchantName] - Override merchant name (tag 59)
 * @param {string} [opts.merchantCity] - Override city (tag 60)
 * @param {string} [opts.countryCode] - Override country (tag 58)
 * @param {string} [opts.postalCode] - Override postal code (tag 61)
 * @param {number} [opts.feeFixed] - Fixed fee in IDR
 * @param {number} [opts.feePercent] - Percentage fee
 * @returns {string} Dynamic QRIS payload (with CRC)
 */
export function toDynamic(staticPayload, amount, opts = {}) {
  // Strip existing CRC (last 4 chars)
  const payload = staticPayload.slice(0, -4);
  let tags = parseTopLevelTags(payload);

  // Tag 01: force to "12" (dynamic)
  const tag01 = tags.find(t => t.id === '01');
  if (tag01) tag01.value = '12';

  // Tag 54: set amount
  const amountStr = String(Math.round(amount));
  const existing54 = tags.find(t => t.id === '54');
  if (existing54) {
    existing54.value = amountStr;
    existing54.len = amountStr.length;
  } else {
    // Insert after tag 01
    const idx = tags.findIndex(t => t.id === '01') + 1;
    tags.splice(idx, 0, { id: '54', len: amountStr.length, value: amountStr });
  }

  // Fee tags (55, 56, 57)
  // Remove existing fee tags
  tags = tags.filter(t => t.id !== '55' && t.id !== '56' && t.id !== '57');

  if (opts.feeFixed && opts.feeFixed > 0) {
    // Tag 55 = "02" (fixed), Tag 56 = amount
    tags.push({ id: '55', len: 2, value: '02' });
    const feeStr = String(Math.round(opts.feeFixed));
    tags.push({ id: '56', len: feeStr.length, value: feeStr });
  } else if (opts.feePercent && opts.feePercent > 0) {
    // Tag 55 = "03" (percent), Tag 57 = percent
    tags.push({ id: '55', len: 2, value: '03' });
    const pctStr = String(opts.feePercent);
    tags.push({ id: '57', len: pctStr.length, value: pctStr });
  }

  // Merchant metadata overrides
  if (opts.merchantName) {
    const t = tags.find(t => t.id === '59');
    if (t) { t.value = opts.merchantName; t.len = opts.merchantName.length; }
  }
  if (opts.merchantCity) {
    const t = tags.find(t => t.id === '60');
    if (t) { t.value = opts.merchantCity; t.len = opts.merchantCity.length; }
  }
  if (opts.countryCode) {
    const t = tags.find(t => t.id === '58');
    if (t) { t.value = opts.countryCode; t.len = opts.countryCode.length; }
  }
  if (opts.postalCode) {
    const t = tags.find(t => t.id === '61');
    if (t) { t.value = opts.postalCode; t.len = opts.postalCode.length; }
  }

  // Remove existing CRC tag (63)
  tags = tags.filter(t => t.id !== '63');

  // Rebuild without CRC
  const withoutCRC = buildPayload(tags);

  // Calculate and append CRC
  const crc = crc16(withoutCRC + '6304');
  return withoutCRC + '6304' + crc;
}

/**
 * Validate a QRIS payload.
 * Returns { valid, error?, tags? }
 */
export function validateQris(raw) {
  if (!raw || typeof raw !== 'string') return { valid: false, error: 'Empty payload' };
  if (raw.length < 20) return { valid: false, error: 'Payload too short' };

  try {
    // Check CRC
    const payload = raw.slice(0, -4);
    const givenCRC = raw.slice(-4).toUpperCase();
    const computedCRC = crc16(payload);
    if (givenCRC !== computedCRC) {
      return { valid: false, error: `CRC mismatch: given ${givenCRC}, computed ${computedCRC}` };
    }

    const tags = parseTopLevelTags(payload);

    // Must have tag 00 (Payload Format Indicator)
    if (!tags.find(t => t.id === '00')) {
      return { valid: false, error: 'Missing tag 00 (Payload Format Indicator)' };
    }

    // Should have some merchant info (26-51 range = merchant account)
    const merchantTags = tags.filter(t => parseInt(t.id) >= 26 && parseInt(t.id) <= 51);
    if (merchantTags.length === 0) {
      return { valid: false, error: 'No merchant account info found (tags 26-51)' };
    }

    return { valid: true, tags };
  } catch (e) {
    return { valid: false, error: `Parse error: ${e.message}` };
  }
}

/**
 * Extract useful info from QRIS payload for display.
 */
export function extractInfo(raw) {
  const payload = raw.slice(0, -4);
  const tags = parseTopLevelTags(payload);
  const get = (id) => tags.find(t => t.id === id)?.value || '';
  return {
    merchantName: get('59'),
    merchantCity: get('60'),
    countryCode: get('58'),
    postalCode: get('61'),
    amount: get('54') || null,
    isDynamic: get('01') === '12',
  };
}
