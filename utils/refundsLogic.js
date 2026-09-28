function computePaymentStatusAfterRefund({ orderTotal, refundedAmount, refundAmount }) {
  const total = Number(orderTotal);
  const refund = Number(refundedAmount !== undefined ? refundedAmount : refundAmount);
  if (!Number.isFinite(total) || !Number.isFinite(refund)) return 'partially_refunded';
  if (refund >= total) return 'refunded';
  return 'partially_refunded';
}

module.exports = { computePaymentStatusAfterRefund };
