function buildOrderExportQuery(rawIds) {
  const values = rawIds === undefined ? [] : (Array.isArray(rawIds) ? rawIds : [rawIds]);
  if (!values.length) {
    const error = new Error('請先勾選要匯出嘅訂單');
    error.status = 400;
    throw error;
  }
  if (values.length > 500) {
    const error = new Error('每次最多匯出 500 張已選訂單');
    error.status = 400;
    throw error;
  }
  const ids = [];
  const seen = new Set();
  for (const value of values) {
    const raw = String(value).trim();
    if (!/^[1-9]\d*$/.test(raw)) {
      const error = new Error('訂單 ID 唔正確');
      error.status = 400;
      throw error;
    }
    const id = Number(raw);
    if (!Number.isSafeInteger(id)) {
      const error = new Error('訂單 ID 唔正確');
      error.status = 400;
      throw error;
    }
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return { ids, placeholders: ids.map((_, index) => `$${index + 1}`).join(',') };
}

module.exports = { buildOrderExportQuery };
