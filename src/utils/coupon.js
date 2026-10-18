const COUPONS = Object.freeze({
  FLOWER100: Object.freeze({
    minSubtotal: 800,
    calculateDiscount: () => 100
  }),
  SPRING10: Object.freeze({
    calculateDiscount: subtotal => Math.min(300, Math.round(subtotal * 0.1))
  })
});

function calculateCouponDiscount(couponCode, subtotal) {
  if (couponCode === undefined || couponCode === null || couponCode === '') {
    return { couponCode: null, discount: 0 };
  }

  const normalizedCode = String(couponCode).trim().toUpperCase();
  const coupon = COUPONS[normalizedCode];
  if (!coupon || (coupon.minSubtotal && subtotal < coupon.minSubtotal)) {
    const error = new Error('優惠碼無效、已失效或未達使用門檻');
    error.code = 'INVALID_COUPON';
    throw error;
  }

  return { couponCode: normalizedCode, discount: coupon.calculateDiscount(subtotal) };
}

module.exports = { calculateCouponDiscount };
