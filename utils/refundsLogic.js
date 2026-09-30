function computePaymentStatusAfterRefund({ orderTotal, refundAmount, refundedTotal }) {
  const total = Number(orderTotal);
  const refund = Number(refundedTotal !== undefined ? refundedTotal : refundAmount);
  if (!Number.isFinite(total) || !Number.isFinite(refund)) return 'partially_refunded';
  if (refund >= total) return 'refunded';
  return 'partially_refunded';
}

module.exports = { computePaymentStatusAfterRefund };
