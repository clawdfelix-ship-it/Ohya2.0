'use strict';

const PRODUCT_SCOPES = {
  read: 'products:read', content: 'products:content:write', media: 'products:media:write',
  classification: 'products:classification:write', variants: 'products:variants:write',
  pricing: 'products:pricing:write', cost: 'products:cost:write', inventory: 'inventory:write',
  status: 'products:status:write',
};
const ALL_PRODUCT_SCOPES = Object.values(PRODUCT_SCOPES);
const PRODUCT_FIELDS = {
  name: 'content', name_zh_hk: 'content',
  description: 'content', description_zh_hk: 'content', short_description: 'content', short_description_zh_hk: 'content',
  image_url: 'media', gallery_images: 'media', category_id: 'classification',
  price: 'pricing', original_price: 'pricing', member_price: 'pricing', cost_price: 'cost',
  status: 'status',
};
const SKU_FIELDS = {
  sku: 'variants', barcode: 'variants', manufacturer_code: 'variants', attributes: 'variants',
  price: 'pricing', original_price: 'pricing', weight: 'variants', weight_unit: 'variants',
  cost_price: 'cost', cost_price_jpy: 'cost', wholesale_price_hkd: 'cost',
  is_active: 'status', stock: 'inventory',
};
class AgentValidationError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(message, details = {}) {
  throw new AgentValidationError(422, 'VALIDATION_ERROR', message, details);
}

function validatePatch(body, fieldMap, scopes, options) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('JSON object required');
  const keys = Object.keys(body);
  const unknown = keys.filter((key) => !Object.hasOwn(fieldMap, key));
  if (unknown.length) throw new AgentValidationError(422, 'UNKNOWN_FIELDS', 'Unknown fields are not allowed', { fields: unknown });
  if (!keys.length) throw new AgentValidationError(422, 'EMPTY_PATCH', 'At least one editable field is required');
  const scopesSet = new Set(Array.isArray(scopes) ? scopes : []);
  const out = {};
  for (const [key, group] of Object.entries(fieldMap)) {
    if (!Object.hasOwn(body, key)) continue;
    const scope = PRODUCT_SCOPES[group];
    if (!scopesSet.has(scope)) throw new AgentValidationError(403, 'SCOPE_REQUIRED', 'Agent credential lacks required field scope', { scope });
    out[key] = validateField(key, body[key], options);
  }
  return out;
}

function validateProductPatch(body, scopes, options = {}) {
  return validatePatch(body, PRODUCT_FIELDS, scopes, options);
}
function validateSkuPatch(body, scopes) {
  return validatePatch(body, SKU_FIELDS, scopes, {});
}

function validateField(key, value, { allowedImageHosts = [] } = {}) {
  if (key === 'status') {
    if (!['active', 'inactive'].includes(value)) fail('Only active/inactive is supported');
    return value;
  }
  if (key === 'is_active' || key === 'is_featured') {
    if (typeof value !== 'boolean') fail(`${key} must be boolean`);
    return value;
  }
  if (['price', 'original_price', 'member_price', 'cost_price', 'cost_price_jpy', 'wholesale_price_hkd'].includes(key)) {
    if (value === null && key !== 'price' && key !== 'cost_price_jpy') return null;
    if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value) || Number(value) > 9999999.99) fail(`${key} must be a bounded non-negative decimal string`);
    return value;
  }
  if (key === 'weight') {
    if (value === null) return null;
    if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(value)) fail('weight must be a decimal string');
    return value;
  }
  if (key === 'stock') {
    if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) fail('stock must be an integer between 0 and 1000000');
    return value;
  }
  if (key === 'category_id') {
    if (value === null) return null;
    if (!Number.isSafeInteger(value) || value <= 0) fail(`${key} must be a positive integer or null`);
    return value;
  }
  if (key === 'image_url') return value === null ? null : validateImageUrl(value, allowedImageHosts);
  if (key === 'gallery_images') {
    if (value === null) return null;
    if (!Array.isArray(value) || value.length > 20) fail('gallery_images must contain at most 20 URLs');
    return value.map((url) => validateImageUrl(url, allowedImageHosts));
  }
  if (key === 'slug') {
    if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,254}$/.test(value)) fail('slug must be lowercase URL-safe text');
    return value;
  }
  if (key === 'attributes') return validateAttributes(value);
  if (key === 'weight_unit') {
    if (!['g', 'kg', 'lb', 'oz'].includes(value)) fail('Unsupported weight_unit');
    return value;
  }
  if (['name', 'name_zh_hk', 'sku', 'barcode', 'manufacturer_code'].includes(key)) {
    if (value === null && key !== 'name' && key !== 'name_zh_hk' && key !== 'sku') return null;
    if (typeof value !== 'string' || !value.trim() || value.length > 255 || /[\u0000-\u001f\u007f]/.test(value)) fail(`${key} has invalid text`);
    return value.trim();
  }
  if (['description', 'description_zh_hk', 'short_description', 'short_description_zh_hk'].includes(key)) {
    if (value === null) return null;
    if (typeof value !== 'string' || value.length > 50000 || /[<>]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(`${key} accepts plain text only`);
    return value;
  }
  fail('Unsupported field');
}

function validateImageUrl(value, hosts) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(value)) fail('Invalid image URL');
  let url;
  try { url = new URL(value); } catch { fail('Invalid image URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname.toLowerCase())) {
    fail('Image URL host is not approved');
  }
  return url.toString();
}

function validateAttributes(value, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) fail('attributes must be a shallow JSON object');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail('attributes must not use a custom or polluted prototype');
  if (JSON.stringify(value).length > 8192) fail('attributes too large');
  const out = Object.create(null);
  for (const [key, child] of Object.entries(value)) {
    if (!/^[\w .-]{1,64}$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('Invalid attribute name');
    if (typeof child === 'string') {
      if (child.length > 255 || /[\u0000-\u001f\u007f<>]/.test(child)) fail('Invalid attribute text');
      out[key] = child;
    } else if (typeof child === 'number' && Number.isFinite(child) || typeof child === 'boolean' || child === null) out[key] = child;
    else if (child && typeof child === 'object' && !Array.isArray(child)) out[key] = validateAttributes(child, depth + 1);
    else fail('Invalid attribute value');
  }
  return out;
}

function parseExpectedVersion(header) {
  const raw = typeof header === 'string' ? header.trim().replace(/^W\//, '').replace(/^"|"$/g, '') : '';
  // PostgreSQL timestamp text is an opaque, lossless version token (including microseconds).
  const validShape = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(raw);
  const normalized = raw.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  if (!validShape || Number.isNaN(new Date(normalized).getTime())) {
    throw new AgentValidationError(428, 'VERSION_REQUIRED', 'If-Match must contain the exact product version');
  }
  return raw;
}

function validateIdempotencyKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw new AgentValidationError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key must be 8-128 safe characters');
  }
  return key;
}

function requestDigest(value) {
  const crypto = require('node:crypto');
  const keys = Object.keys(value).sort();
  const sorted = {};
  for (const key of keys) sorted[key] = value[key];
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

module.exports = {
  PRODUCT_SCOPES, ALL_PRODUCT_SCOPES, PRODUCT_FIELDS, SKU_FIELDS, AgentValidationError,
  validateProductPatch, validateSkuPatch, parseExpectedVersion, validateIdempotencyKey, requestDigest,
};
