const { calculateCouponDiscount } = require('../src/utils/coupon');

describe('Coupon utility', () => {
  it('normalizes coupon codes and calculates fixed discounts', () => {
    expect(calculateCouponDiscount('flower100', 800)).toEqual({
      couponCode: 'FLOWER100',
      discount: 100
    });
  });

  it('rounds SPRING10 and caps the discount at 300', () => {
    expect(calculateCouponDiscount('SPRING10', 1234).discount).toBe(123);
    expect(calculateCouponDiscount('SPRING10', 3500).discount).toBe(300);
  });

  it('returns no discount when no coupon is supplied', () => {
    expect(calculateCouponDiscount(undefined, 800)).toEqual({
      couponCode: null,
      discount: 0
    });
  });

  it.each([
    ['SUMMER50', 1000],
    ['FLOWER100', 799],
    ['NOT-A-COUPON', 1000]
  ])('rejects %s for subtotal %i', (code, subtotal) => {
    expect(() => calculateCouponDiscount(code, subtotal)).toThrow('優惠碼無效');
  });
});
