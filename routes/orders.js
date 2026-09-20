module.exports = function(app, pool, requireAuth, requireAdmin) {
  const { requirePermission } = require('./middleware/auth');

  // Get my orders (current user)
  app.get('/api/orders', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.per_page) || 10;
      const offset = (page - 1) * perPage;

      const countResult = await pool.query('SELECT COUNT(*) as total FROM orders WHERE user_id = $1', [userId]);
      const total = parseInt(countResult.rows[0].total);

      const result = await pool.query(`
        SELECT o.*, COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = $1
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, perPage, offset]);

      res.json({
        orders: result.rows,
        pagination: {
          page,
          perPage,
          total,
          totalPages: Math.ceil(total / perPage)
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Get single order detail
  app.get('/api/orders/:id', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { id } = req.params;

      const orderResult = await pool.query(`
        SELECT o.*
        FROM orders o
        WHERE o.id = $1 AND o.user_id = $2
      `, [id, userId]);

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: '訂單不存在' });
      }

      const itemsResult = await pool.query(`
        SELECT oi.*, p.name, p.image_url
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
      `, [id]);

      res.json({
        order: orderResult.rows[0],
        items: itemsResult.rows
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Create new order from cart
  // 付款：銀行轉帳 / FPS（人工核實，payment_status 起步 pending）；運費：到付（shipping_fee=0）
  app.post('/api/orders', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = req.session.userId;
      const { contact_name, contact_phone, contact_address, note, payment_method } = req.body;

      if (!contact_name || !contact_phone || !contact_address) {
        return res.status(400).json({ error: '聯絡資訊不全' });
      }

      // 暫時只開放銀行轉帳 / FPS
      const ALLOWED_PAYMENT = { bank_transfer: '銀行轉帳', fps: 'FPS 轉數快' };
      const paymentCode = ALLOWED_PAYMENT[payment_method] ? payment_method : null;
      if (!paymentCode) {
        return res.status(400).json({ error: '請選擇付款方式（銀行轉帳或 FPS 轉數快）' });
      }

      await client.query('BEGIN');

      // Get cart items（預購模式：不追蹤庫存，只驗商品仍上架）
      const cartResult = await client.query(`
        SELECT ci.id AS cart_item_id, ci.product_id, ci.quantity,
               p.price, p.name, p.status
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.user_id = $1
        FOR UPDATE OF p
      `, [userId]);

      if (cartResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '購物車是空的' });
      }

      // 預購模式：商品仍有效即可，數量不受庫存限制
      for (const item of cartResult.rows) {
        if (item.status !== 'active') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `商品「${item.name}」已落架` });
        }
      }

      // 小計（DB products.price 單位為 HKD；運費到付，落單唔收運費）
      let subtotal = 0;
      cartResult.rows.forEach(item => {
        subtotal += Number(item.price) * Number(item.quantity);
      });
      const subtotalMoney = Number(subtotal.toFixed(2));

      const orderResult = await client.query(`
        INSERT INTO orders
          (user_id, contact_name, contact_phone, contact_address, note,
           subtotal_amount, shipping_fee, freight_collect, total_amount,
           payment_method_code, payment_status, status)
        VALUES ($1, $2, $3, $4, $5, $6, 0, true, $6, $7, 'pending', 'pending')
        RETURNING id
      `, [userId, contact_name, contact_phone, contact_address, note || null,
           subtotalMoney, paymentCode]);

      const orderId = orderResult.rows[0].id;

      // 人睇嘅訂單編號 OHYA-YYMMDD-000123
      const now = new Date();
      const ym = String(now.getFullYear()).slice(2) +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0');
      const orderNumber = `OHYA-${ym}-${String(orderId).padStart(6, '0')}`;
      await client.query('UPDATE orders SET order_number = $1 WHERE id = $2', [orderNumber, orderId]);

      // Create order items（預購模式不扣庫存）
      for (const item of cartResult.rows) {
        await client.query(`
          INSERT INTO order_items (order_id, product_id, quantity, unit_price)
          VALUES ($1, $2, $3, $4)
        `, [orderId, item.product_id, item.quantity, item.price]);
      }

      // Clear cart
      await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

      await client.query('COMMIT');

      res.json({ success: true, orderId, orderNumber, paymentMethod: paymentCode });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    } finally {
      client.release();
    }
  });

  // Cancel order (user)
  app.post('/api/orders/:id/cancel', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { id } = req.params;

      // Check order exists and belongs to user
      const orderCheck = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [id, userId]);
      if (orderCheck.rows.length === 0) {
        return res.status(404).json({ error: '訂單不存在' });
      }

      const order = orderCheck.rows[0];
      if (!['pending', 'paid'].includes(order.status)) {
        return res.status(400).json({ error: '此訂單無法取消' });
      }

      // Start transaction to restore stock
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 預購模式：取消訂單不退還庫存
        // Update order status
        await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', ['cancelled', id]);

        await client.query('COMMIT');
        res.json({ success: true });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: Get all orders
  app.get('/api/admin/orders', requirePermission('orders:read'), async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.per_page) || 30;
      const status = req.query.status;
      const search = req.query.search || '';
      const offset = (page - 1) * perPage;

      let where = '1=1';
      let params = [];
      let paramIndex = 1;

      if (status) {
        where += ` AND o.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (search) {
        where += ` AND (o.contact_name ILIKE $${paramIndex} OR o.contact_phone ILIKE $${paramIndex} OR o.id::text ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      const countResult = await pool.query(`SELECT COUNT(*) as total FROM orders o WHERE ${where}`, params);
      const total = parseInt(countResult.rows[0].total);

      const result = await pool.query(`
        SELECT o.*, u.username
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE ${where}
        ORDER BY o.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, perPage, offset]);

      res.json({
        orders: result.rows,
        pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: Update order status
  app.put('/api/admin/orders/:id/status', requirePermission('orders:write'), async (req, res) => {
    try {
      const { id } = req.params;
      const { status, tracking_number } = req.body;

      const allowedStatuses = ['pending', 'paid', 'shipping', 'completed', 'cancelled'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: '無效狀態' });
      }

      let updateQuery = 'UPDATE orders SET status = $1, updated_at = NOW()';
      let params = [status, id];

      if (tracking_number !== undefined) {
        updateQuery += ', tracking_number = $' + (params.length + 1);
        params.push(tracking_number);
      }
      updateQuery += ' WHERE id = $' + params.length + ' RETURNING *';

      const result = await pool.query(updateQuery, params);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: '訂單不存在' });
      }

      res.json({ success: true, order: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: Get order details (full info with items)
  app.get('/api/admin/orders/:id', requirePermission('orders:read'), async (req, res) => {
    try {
      const { id } = req.params;

      const orderResult = await pool.query(`
        SELECT o.*, u.username, u.contact, u.whatsapp, u.marketing_consent
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.id = $1
      `, [id]);

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: '訂單不存在' });
      }

      const itemsResult = await pool.query(`
        SELECT oi.*, p.name, p.image_url
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
      `, [id]);

      res.json({
        order: orderResult.rows[0],
        items: itemsResult.rows
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

};
