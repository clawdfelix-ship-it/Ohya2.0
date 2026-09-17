module.exports = function(app, pool, requireAuth, requireAdmin) {
  const { requirePermission } = require('./middleware/auth');

  async function loadLockedCartItems(client, userId) {
    const result = await client.query(`
      SELECT ci.*, p.price, p.stock, p.name
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.user_id = $1
      ORDER BY ci.product_id ASC, ci.id ASC
      FOR UPDATE OF p
    `, [userId]);

    return Array.isArray(result.rows) ? result.rows : [];
  }

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
  app.post('/api/orders', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { contact_name, contact_phone, contact_address, note } = req.body;

      if (!contact_name || !contact_phone || !contact_address) {
        return res.status(400).json({ error: '聯絡資訊不全' });
      }

      // Start transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const cartItems = await loadLockedCartItems(client, userId);
        if (cartItems.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: '購物車是空的' });
        }

        for (const item of cartItems) {
          if (Number(item.stock) < Number(item.quantity)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `產品 ${item.name} 庫存不足` });
          }
        }

        let total = 0;
        cartItems.forEach(item => {
          total += item.price * item.quantity;
        });

        // Create order
        const orderResult = await client.query(`
          INSERT INTO orders (user_id, contact_name, contact_phone, contact_address, note, total_amount, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'pending')
          RETURNING id
        `, [userId, contact_name, contact_phone, contact_address, note || null, total]);

        const orderId = orderResult.rows[0].id;

        // Create order items + decrease stock
        for (const item of cartItems) {
          await client.query(`
            INSERT INTO order_items (order_id, product_id, quantity, unit_price)
            VALUES ($1, $2, $3, $4)
          `, [orderId, item.product_id, item.quantity, item.price]);

          // Decrease stock
          const stockUpdate = await client.query(`
            UPDATE products
            SET stock = stock - $1
            WHERE id = $2 AND stock >= $1
            RETURNING stock
          `, [item.quantity, item.product_id]);
          if (stockUpdate.rows.length === 0) {
            throw new Error(`庫存更新失敗: product_id=${item.product_id}`);
          }
        }

        // Clear cart
        await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

        await client.query('COMMIT');

        res.json({ success: true, orderId });
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

        // Get order items to restore stock
        const items = await client.query('SELECT * FROM order_items WHERE order_id = $1', [id]);
        for (const item of items.rows) {
          await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
        }

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
