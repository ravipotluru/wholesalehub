import { selectUnitPrice } from '@/lib/pricing';
import { Prisma } from '@prisma/client';

const noPromo = {
  promoPrice: null,
  onPromotion: false,
  promoStartDate: null,
  promoEndDate: null,
};

describe('selectUnitPrice — base only', () => {
  it('returns the base wholesalePrice when there are no tiers', () => {
    const r = selectUnitPrice(
      { wholesalePrice: '10.00', ...noPromo },
      [],
      5,
    );
    expect(r.unitPrice.toString()).toBe('10');
    expect(r.source).toBe('BASE');
    expect(r.appliedTierMinQty).toBeNull();
  });
});

describe('selectUnitPrice — tier selection', () => {
  const tiers = [
    { minQty: 1, unitPrice: '10.00' },
    { minQty: 12, unitPrice: '9.00' },
    { minQty: 24, unitPrice: '8.00' },
  ];

  it('uses the 1-tier for quantities below 12', () => {
    const r = selectUnitPrice({ wholesalePrice: '10.00', ...noPromo }, tiers, 11);
    expect(r.unitPrice.toString()).toBe('10');
    expect(r.appliedTierMinQty).toBe(1);
  });

  it('uses the 12-tier inclusively from quantity 12', () => {
    const r = selectUnitPrice({ wholesalePrice: '10.00', ...noPromo }, tiers, 12);
    expect(r.unitPrice.toString()).toBe('9');
    expect(r.appliedTierMinQty).toBe(12);
  });

  it('uses the 24-tier inclusively from quantity 24', () => {
    const r = selectUnitPrice({ wholesalePrice: '10.00', ...noPromo }, tiers, 24);
    expect(r.unitPrice.toString()).toBe('8');
    expect(r.appliedTierMinQty).toBe(24);
  });

  it('uses the 24-tier for any quantity above 24', () => {
    const r = selectUnitPrice({ wholesalePrice: '10.00', ...noPromo }, tiers, 1000);
    expect(r.unitPrice.toString()).toBe('8');
    expect(r.appliedTierMinQty).toBe(24);
  });

  it('falls through to base when the smallest tier is above the order quantity', () => {
    const onlyBigTier = [{ minQty: 100, unitPrice: '5.00' }];
    const r = selectUnitPrice({ wholesalePrice: '10.00', ...noPromo }, onlyBigTier, 50);
    expect(r.unitPrice.toString()).toBe('10');
    expect(r.source).toBe('BASE');
  });
});

describe('selectUnitPrice — promo handling', () => {
  const tiers = [{ minQty: 1, unitPrice: '10.00' }];

  it('uses the promoPrice when it beats every tier and the window is active', () => {
    const r = selectUnitPrice(
      {
        wholesalePrice: '10.00',
        promoPrice: '7.00',
        onPromotion: true,
        promoStartDate: null,
        promoEndDate: null,
      },
      tiers,
      5,
    );
    expect(r.unitPrice.toString()).toBe('7');
    expect(r.source).toBe('PROMO');
  });

  it('ignores promoPrice when onPromotion is false', () => {
    const r = selectUnitPrice(
      {
        wholesalePrice: '10.00',
        promoPrice: '7.00',
        onPromotion: false,
        promoStartDate: null,
        promoEndDate: null,
      },
      tiers,
      5,
    );
    expect(r.source).toBe('BASE');
    expect(r.unitPrice.toString()).toBe('10');
  });

  it('ignores promoPrice before promoStartDate', () => {
    const future = new Date('2099-01-01');
    const r = selectUnitPrice(
      {
        wholesalePrice: '10.00',
        promoPrice: '7.00',
        onPromotion: true,
        promoStartDate: future,
        promoEndDate: null,
      },
      tiers,
      5,
      new Date('2026-01-01'),
    );
    expect(r.source).toBe('BASE');
  });

  it('ignores promoPrice after promoEndDate', () => {
    const past = new Date('2020-01-01');
    const r = selectUnitPrice(
      {
        wholesalePrice: '10.00',
        promoPrice: '7.00',
        onPromotion: true,
        promoStartDate: null,
        promoEndDate: past,
      },
      tiers,
      5,
      new Date('2026-01-01'),
    );
    expect(r.source).toBe('BASE');
  });

  it('still picks the cheaper of TIER vs PROMO', () => {
    const tiersDeep = [{ minQty: 24, unitPrice: '6.00' }];
    const r = selectUnitPrice(
      {
        wholesalePrice: '10.00',
        promoPrice: '7.00',
        onPromotion: true,
        promoStartDate: null,
        promoEndDate: null,
      },
      tiersDeep,
      24,
    );
    expect(r.unitPrice.toString()).toBe('6');
    expect(r.source).toBe('TIER');
  });
});

describe('selectUnitPrice — Decimal arithmetic', () => {
  it('returns a Prisma.Decimal regardless of input shape', () => {
    const r = selectUnitPrice(
      { wholesalePrice: '12.50', ...noPromo },
      [{ minQty: 10, unitPrice: 11.99 }],
      10,
    );
    expect(r.unitPrice).toBeInstanceOf(Prisma.Decimal);
    expect(r.unitPrice.toString()).toBe('11.99');
  });
});
