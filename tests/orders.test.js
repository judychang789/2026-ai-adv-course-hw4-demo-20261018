const { app, request, registerUser } = require('./setup');
const db = require('../src/database');

describe('Orders API', () => {
  let userToken;
  let productId;
  let productPrice;
  let orderId;

  beforeAll(async () => {
    // Register a user for order tests
    const { token } = await registerUser();
    userToken = token;

    // Get a product id
    const prodRes = await request(app).get('/api/products');
    productId = prodRes.body.data.products[0].id;
    productPrice = prodRes.body.data.products[0].price;

    // Add product to cart
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity: 1 });
  });

  it('should create an order from cart', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'convenience_store',
        isRemoteArea: true,
        isExpress: true,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('subtotal', productPrice);
    expect(res.body.data).toHaveProperty(
      'shipping_fee',
      (productPrice >= 1500 ? 0 : 60) + 200 + 250
    );
    expect(res.body.data).toHaveProperty('shipping_method', 'convenience_store');
    expect(res.body.data).toHaveProperty('is_remote_area', true);
    expect(res.body.data).toHaveProperty('is_express', true);
    expect(res.body.data).toHaveProperty('total_amount');
    expect(res.body.data.total_amount).toBe(
      res.body.data.subtotal + res.body.data.shipping_fee
    );
    expect(res.body.data).toHaveProperty('status', 'pending');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);

    orderId = res.body.data.id;
  });

  it('should fail to create order with empty cart', async () => {
    // The cart was already cleared by the previous order
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home_delivery',
        isRemoteArea: false,
        isExpress: false,
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });

  it('should fail to create order without auth', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should get order list', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('orders');
    expect(Array.isArray(res.body.data.orders)).toBe(true);
    expect(res.body.data.orders.length).toBeGreaterThan(0);
  });

  it('should get order detail', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id', orderId);
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('subtotal', productPrice);
    expect(res.body.data).toHaveProperty('shipping_fee');
    expect(res.body.data).toHaveProperty('shipping_method', 'convenience_store');
    expect(res.body.data).toHaveProperty('is_remote_area', true);
    expect(res.body.data).toHaveProperty('is_express', true);
    expect(res.body.data.total_amount).toBe(
      res.body.data.subtotal + res.body.data.shipping_fee
    );
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('should not expose another user\'s order detail', async () => {
    const { token: otherUserToken } = await registerUser();
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherUserToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ data: null, error: 'NOT_FOUND' });
  });

  it('should return 404 for non-existent order', async () => {
    const res = await request(app)
      .get('/api/orders/non-existent-order-id')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });

  it('should reject non-string recipient fields', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: { first: '測試' },
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home_delivery',
        isRemoteArea: false,
        isExpress: false,
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should hide mock payment outside the test environment', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const res = await request(app)
        .patch(`/api/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ action: 'success' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('data', null);
      expect(res.body).toHaveProperty('error', 'NOT_FOUND');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should mock payment once in the test environment', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ action: 'success' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('status', 'paid');

    const again = await request(app)
      .patch(`/api/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ action: 'fail' });

    expect(again.status).toBe(400);
    expect(again.body).toHaveProperty('error', 'INVALID_STATUS');
  });
});

describe('Order list filters and pagination', () => {
  let token;
  let userId;
  let newestOrderId;

  function insertOrder({ id, orderNo, ownerId, status, createdAt }) {
    db.prepare(
      `INSERT INTO orders (
        id, order_no, user_id, recipient_name, recipient_email, recipient_address,
        subtotal, shipping_fee, shipping_method, is_remote_area, is_express,
        total_amount, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, orderNo, ownerId, '收件人', 'recipient@example.com', '台北市測試路 1 號',
      100, 60, 'home_delivery', 0, 0, 160, status, createdAt
    );
  }

  beforeAll(async () => {
    const user = await registerUser();
    token = user.token;
    userId = user.user.id;

    for (let index = 1; index <= 12; index += 1) {
      const id = `list-order-${Date.now()}-${index}`;
      if (index === 12) newestOrderId = id;
      insertOrder({
        id,
        orderNo: `LIST-${Date.now()}-${index}`,
        ownerId: userId,
        status: index % 2 === 0 ? 'paid' : 'pending',
        createdAt: `2026-01-01T00:00:${String(index).padStart(2, '0')}Z`
      });
    }

    const otherUser = await registerUser();
    insertOrder({
      id: `other-order-${Date.now()}`,
      orderNo: `OTHER-${Date.now()}`,
      ownerId: otherUser.user.id,
      status: 'paid',
      createdAt: '2027-01-01T00:00:00Z'
    });
  });

  it('returns the first page in descending creation order by default', async () => {
    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(10);
    expect(res.body.data.orders[0].id).toBe(newestOrderId);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 10, total: 12, totalPages: 2 });
  });

  it('filters to the user\'s selected order status', async () => {
    const res = await request(app)
      .get('/api/orders?status=paid')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(6);
    expect(res.body.data.orders.every(order => order.status === 'paid')).toBe(true);
    expect(res.body.data.pagination.total).toBe(6);
  });

  it('paginates, clamps the limit, and never returns another user\'s orders', async () => {
    const page = await request(app)
      .get('/api/orders?page=3&limit=5')
      .set('Authorization', `Bearer ${token}`);
    const clamped = await request(app)
      .get('/api/orders?limit=100')
      .set('Authorization', `Bearer ${token}`);

    expect(page.status).toBe(200);
    expect(page.body.data.orders).toHaveLength(2);
    expect(page.body.data.pagination).toEqual({ page: 3, limit: 5, total: 12, totalPages: 3 });
    expect(clamped.body.data.pagination.limit).toBe(50);
    expect(clamped.body.data.orders).toHaveLength(12);
  });

  it.each(['status=unknown', 'page=0', 'limit=-1'])('rejects invalid query %s', async (query) => {
    const res = await request(app)
      .get(`/api/orders?${query}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual(expect.objectContaining({ data: null, error: 'VALIDATION_ERROR' }));
  });
});
