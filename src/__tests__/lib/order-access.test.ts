import { canAccessOrder } from '@/lib/order-access';

const order = { retailerId: 'rt_owner', wholesalerId: 'ws_owner' };

describe('canAccessOrder', () => {
  it('admins can read every order', () => {
    expect(
      canAccessOrder(
        { role: 'ADMIN', retailerId: null, wholesalerId: null },
        order,
      ),
    ).toBe(true);
  });

  it('analysts can read every order', () => {
    expect(
      canAccessOrder(
        { role: 'ANALYST', retailerId: null, wholesalerId: null },
        order,
      ),
    ).toBe(true);
  });

  it('a retailer can read their own order', () => {
    expect(
      canAccessOrder(
        { role: 'RETAILER', retailerId: 'rt_owner', wholesalerId: null },
        order,
      ),
    ).toBe(true);
  });

  it('a retailer cannot read another retailer’s order (IDOR guard)', () => {
    expect(
      canAccessOrder(
        { role: 'RETAILER', retailerId: 'rt_other', wholesalerId: null },
        order,
      ),
    ).toBe(false);
  });

  it('a retailer with null retailerId cannot read any order', () => {
    expect(
      canAccessOrder(
        { role: 'RETAILER', retailerId: null, wholesalerId: null },
        order,
      ),
    ).toBe(false);
  });

  it('a wholesaler can read their own order', () => {
    expect(
      canAccessOrder(
        { role: 'WHOLESALER', retailerId: null, wholesalerId: 'ws_owner' },
        order,
      ),
    ).toBe(true);
  });

  it('a wholesaler cannot read another wholesaler’s order', () => {
    expect(
      canAccessOrder(
        { role: 'WHOLESALER', retailerId: null, wholesalerId: 'ws_other' },
        order,
      ),
    ).toBe(false);
  });

  it('warehouse staff can read their wholesaler’s orders', () => {
    expect(
      canAccessOrder(
        { role: 'WAREHOUSE_STAFF', retailerId: null, wholesalerId: 'ws_owner' },
        order,
      ),
    ).toBe(true);
  });

  it('an unknown role cannot read orders', () => {
    expect(
      canAccessOrder(
        { role: 'GUEST', retailerId: null, wholesalerId: null },
        order,
      ),
    ).toBe(false);
  });
});
