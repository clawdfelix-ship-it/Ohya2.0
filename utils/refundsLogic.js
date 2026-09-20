function computePaymentStatusAfterRefund({ orderTotal, refundAmount, totalRefunded }) {
  const total = Number(orderTotal);
  const refund = Number(totalRefunded !== undefined ? totalRefunded : refundAmount);
  if (!Number.isFinite(total) || !Number.isFinite(refund)) return 'partial_refunded';
  if (refund >= total) return 'refunded';
  return 'partial_refunded';
}

module.exports = { computePaymentStatusAfterRefund };
