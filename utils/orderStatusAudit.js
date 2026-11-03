function shouldFallbackToLegacyEventTable(err) {
  if (!err) return false;
  if (err.code === '42P01' || err.code === '42703') return true;
  const msg = String(err.message || '');
  return /order_status_history/i.test(msg);
}

async function writeOrderStatusAudit(db, { orderId, fromStatus = null, toStatus, note = null, processedBy = null }) {
  if (!db || typeof db.query !== 'function') {
    throw new TypeError('db.query is required');
  }
  if (!orderId) {
    throw new TypeError('orderId is required');
  }
  if (!toStatus) {
    throw new TypeError('toStatus is required');
  }

  try {
    await db.query(
      `INSERT INTO order_status_history
         (order_id, from_status, to_status, note, processed_by, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [orderId, fromStatus, toStatus, note, processedBy]
    );
    return;
  } catch (err) {
    if (!shouldFallbackToLegacyEventTable(err)) throw err;
  }

  await db.query(
    `INSERT INTO order_status_histories
       (order_id, status, notes, created_by, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [orderId, toStatus, note, processedBy]
  );
}

module.exports = { writeOrderStatusAudit };
