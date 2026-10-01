function computePaymentStatusAfterRefund({ orderTotal, refundAmount, totalRefundAmount }) {
  const total = Number(orderTotal);
  const refund = Number(totalRefundAmount !== undefined ? totalRefundAmount : refundAmount);
  if (!Number.isFinite(total) || !Number.isFinite(refund)) return 'partially_refunded';
  if (refund >= total) return 'refunded';
  return 'partially_refunded';
}

module.exports = { computePaymentStatusAfterRefund };
