function computePaymentStatusAfterRefund({ orderTotal, refundAmount, totalRefundAmount }) {
  const total = Number(orderTotal);
  const refunded = Number(totalRefundAmount !== undefined ? totalRefundAmount : refundAmount);
  if (!Number.isFinite(total) || !Number.isFinite(refunded)) return 'partial_refunded';
  if (refunded >= total) return 'refunded';
  return 'partial_refunded';
}

module.exports = { computePaymentStatusAfterRefund };
